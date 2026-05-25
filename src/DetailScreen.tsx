/**
 * Musing 对话式详情页（方向 B · 2026-04-30）
 *
 * 三段式：
 *   ① 原始想法（你说的话 + 播放按钮）
 *   ② 执行时间线（runs）+ 产出摘要（run.result.output）
 *   ③ 对话（comments）+ 底部追问框
 *
 * 架构策略：不上 react-navigation，由 App.tsx 用 state 驱动条件渲染。
 * 凭据来自 App 注入的 MulticaClient 单例。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';

import {
  MulticaClient,
  MulticaComment,
  MulticaIssueDetail,
  MulticaTaskRun,
} from './multica';
import { useVoiceInput } from './useVoiceInput';
import {
  ProposeCard,
  AskCard,
  ProgressCard,
  DoneCard,
} from './cards';
// Sprint 3.11 · 旧 mini-env 假 path / AnimatedG / reanimated flow 已被真 VoiceEnvelope 组件替代，
// 不再需要 svg / reanimated 直接 import。

import { BlindsLight } from './components/her/BlindsLight';
import { BreathGlow } from './components/her/BreathGlow';
import { ScreenBg } from './components/her/ScreenBg';
import { EarpieceMic } from './components/her/EarpieceMic';
import { FullscreenImageViewer } from './components/her/FullscreenImageViewer';
import { OS1LedButton } from './components/her/OS1LedButton';
import { RippleAura } from './components/her/RippleAura';
import { SineBand } from './components/her/SineBand';
import { VoiceEnvelope } from './components/her/VoiceEnvelope';
import { WaxSeal } from './components/her/WaxSeal';
import {
  COLORS,
  FONT_CN,
  FONT_SERIF_BOLD,
  PillVariant,
  pillColors,
  pillFromStatus,
  relativeTime,
} from './theme';
import { Thought } from './types';
import { extractUIBlock, UIBlock } from './uiBlock';
import { latestUIBlock } from './cardSignal';
import { useConfig, getCachedConfig } from './config';

// 方案 B v3 不再需要 collapsed 滑动收起手势 · 主屏极简到位 + 卡片化对话流

type Props = {
  identifier: string;
  thought?: Thought; // 本地 thought 记录，用于顶部播放和显示你的原始话
  client: MulticaClient;
  onBack: () => void;
  /** 成功拉到数据 / 发完评论后，把最新状态回写给 App 的 thoughts 列表 */
  onSync?: (patch: {
    issueStatus?: string;
    commentCount?: number;
    lastSyncedAt?: number;
    lastSeenCommentCount?: number;
  }) => void;
};

export function DetailScreen({
  identifier,
  thought,
  client,
  onBack,
  onSync,
}: Props) {
  const [issue, setIssue] = useState<MulticaIssueDetail | null>(null);
  const [runs, setRuns] = useState<MulticaTaskRun[]>([]);
  const [comments, setComments] = useState<MulticaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // ExecCard 历史产出展开态 · 留作未来「查看详细进度」二级页用
  const [showHistory, setShowHistory] = useState(false);
  // Sprint 3.24 · issue · 对话查看模式 toggle
  // 用户原话「按一下进入对话查看模式 · 隐藏 origin · 让对话展示更多 · 从 musing 最新一条回复展开」
  const [focusMode, setFocusMode] = useState(false);

  // runtime config (iflytek 凭据用于追问框语音输入；multica 凭据由父组件传 client 注入)
  const cfg = useConfig();

  // 聊天感：评论加载完 / 键盘弹起 / 自己发完评论 → 滚到底
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  // Sprint 3.24 · issue · toggle 对话查看模式
  // 进入：隐藏 ORIGIN + scroll 到底（latest agent reply 在最末，scrollToEnd 自然落到那里）
  // 退出：恢复默认（恢复显示 ORIGIN，不强制 scroll）
  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      if (next) {
        // 等 ORIGIN 隐藏后 layout 稳定再滚到底（避免 layout 跳变 race）
        setTimeout(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
      return next;
    });
  }, []);

  // onSync 来自父组件 inline arrow，每次父 rerender 都是新引用；
  // 用 ref 捕获最新版本，避免它进入 fetchAll 的依赖 → 无限 fetch loop。
  const onSyncRef = useRef(onSync);
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  // 键盘避让 · 不用 KeyboardAvoidingView（edge-to-edge 下 Android 行为不稳）
  // 直接监听键盘事件，给 compose 容器加 marginBottom。
  // 注意：Android 新架构下要用 keyboardDidShow；iOS 用 keyboardWillShow 更丝滑。
  const [kbHeight, setKbHeight] = useState(0);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
      // 聊天感：键盘弹起 → 让最后一条评论紧贴输入框
      scrollToEnd();
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      setKbHeight(0);
      // 键盘收起时主动 blur，让 TextInput 光标消失
      inputRef.current?.blur();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insets.bottom, scrollToEnd]);

  // Android 手势返回 / BACK 键拦截
  // 底层逻辑：Musing 用 state 驱动视图切换（不是 react-navigation），系统默认 BACK 直接关 app。
  // 关键细节：键盘弹起时的第一次 BACK 由系统吞掉（只收键盘），我们只接管键盘已关状态的 BACK。
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);


  // Android edge-to-edge 下 endCoordinates.height 通常不含 nav bar（手势条），
  // 需要补 insets.bottom 才能完全避让；iOS 的键盘高度已经是全额，不补。
  const kbOffset =
    kbHeight > 0
      ? kbHeight + (Platform.OS === 'android' ? insets.bottom : 0)
      : 0;

  // 最近一次拿到的评论数（silent 轮询检测新消息用 —— 闭包拿不到最新 state，用 ref）
  const commentsCountRef = useRef(0);
  useEffect(() => {
    commentsCountRef.current = comments.length;
  }, [comments.length]);

  const fetchAll = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setError(null);
        const [i, r, c] = await Promise.all([
          client.getIssue(identifier),
          client.listRuns(identifier),
          client.listComments(identifier),
        ]);
        setIssue(i);
        setRuns(r);
        setComments(c);
        onSyncRef.current?.({
          issueStatus: i.status,
          commentCount: c.length,
          lastSyncedAt: Date.now(),
          lastSeenCommentCount: c.length, // 打开详情 = 读完了
        });
        // 非 silent（用户主动操作）→ 强制滚底
        // silent 轮询 → 只有检测到新评论才滚，不打断当前阅读
        if (!silent) {
          scrollToEnd();
        } else if (c.length > commentsCountRef.current) {
          scrollToEnd();
        }
      } catch (e: any) {
        if (!silent) setError(String(e?.message ?? e));
        // silent 轮询失败静默（保留原状，不打扰 UI）
      }
    },
    [client, identifier, scrollToEnd],
  );

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // AppState 前后台感知：后台暂停 polling（省电）、回到前台立即刷一次
  // 放弃基于 issue.status 的 terminal 判断 —— agent 在 done 后仍可能被用户追问触发 rerun + 回评论
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      if (active) fetchAll(true); // 回前台立即刷一次，不等下个 tick
    });
    return () => sub.remove();
  }, [fetchAll]);

  // 静默轮询：前台时每 5s 拉一次。
  // silent 模式不动 loading/error UI；评论数增加时自动 scrollToEnd（"新消息到了"的聊天感）
  useEffect(() => {
    if (!appActive) return; // 后台不轮询
    const timer = setInterval(() => fetchAll(true), 5000);
    return () => clearInterval(timer);
  }, [fetchAll, appActive]);

  // 语音输入：录音中 liveText 实时写入 draft，按钮区只切 🎙/◼，
  // 用户看着字在输入框里"长出来"即知在录，极简无遮挡
  const voicePrefixRef = useRef(''); // 录音开始前的 draft，作为前缀保护
  const voice = useVoiceInput({
    iflytek: {
      appid: cfg?.iflytekAppid ?? '',
      apiKey: cfg?.iflytekApiKey ?? '',
      apiSecret: cfg?.iflytekApiSecret ?? '',
    },
    onFinal: (result) => {
      // IAT 最终结果可能比最后一帧 liveText 修订过，用最终版覆盖一次
      const prefix = voicePrefixRef.current;
      const text = result.text.trim();
      if (!text) {
        setDraft(prefix);
        return;
      }
      const sep = prefix && !/\s$/.test(prefix) ? ' ' : '';
      setDraft(prefix + sep + text);
    },
    onError: (e) => {
      Alert.alert('录音失败', String(e?.message ?? e));
    },
  });

  // 录音中 liveText 实时同步 draft（字在输入框里"长出来"的体验）
  // 录音状态提示由独立的 voiceStatusBar 承载（紧贴 compose 顶），不依赖 placeholder
  useEffect(() => {
    if (!voice.isRecording) return;
    const prefix = voicePrefixRef.current;
    const sep = prefix && voice.liveText && !/\s$/.test(prefix) ? ' ' : '';
    setDraft(prefix + sep + voice.liveText);
  }, [voice.isRecording, voice.liveText]);

  // 包装 voice.start：启动前捕获当前 draft 作为 prefix。focus 不在这里调，
  // 因为 voice.isRecording 此刻还是 false，showSoftInputOnFocus=true 会弹键盘。
  // 真正的 focus 在下面的 useEffect 里——等 isRecording 变 true + React commit 完再 focus。
  const startVoice = useCallback(() => {
    voicePrefixRef.current = draft;
    voice.start();
  }, [draft, voice]);

  // 时序修正：录音状态变化后再 focus，此时 showSoftInputOnFocus=false 已生效
  // 双保险：先 Keyboard.dismiss 压任何残留，再等下一帧 focus（确保 React commit 完）
  useEffect(() => {
    if (voice.isRecording) {
      Keyboard.dismiss();
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [voice.isRecording]);

  // 录音呼吸动画：0 ↔ 1 循环，单值驱动 scale + opacity 两个变换（native driver 流畅）
  const voicePulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!voice.isRecording) {
      voicePulse.setValue(0); // 立刻 reset 到静态态，不留余震
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(voicePulse, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voice.isRecording, voicePulse]);
  // scale 呼吸已让位给状态条的 opacity 呼吸（按钮静态）；scale 留空间以备后用
  const voicePulseOpacity = voicePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.55],
  });

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await client.addComment(identifier, text);
      setDraft('');
      // 立即 re-fetch 取回最新列表（包含自己刚发的和 agent 的后续回复）
      const c = await client.listComments(identifier);
      setComments(c);
      onSyncRef.current?.({
        commentCount: c.length,
        lastSyncedAt: Date.now(),
        lastSeenCommentCount: c.length,
      });
      // 发完自己的评论 → 滚到最底看到自己的气泡
      scrollToEnd();
    } catch (e: any) {
      Alert.alert('发送失败', String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  };

  // 播放器（复用 App 的思路；每屏各一个实例，退屏自动销毁）
  const player = useAudioPlayer();
  const [playing, setPlaying] = useState(false);
  const togglePlay = () => {
    if (!thought?.audioUri) {
      Alert.alert('提示', '此想法没有本地音频');
      return;
    }
    try {
      if (playing) {
        player.pause();
        setPlaying(false);
        return;
      }
      player.replace({ uri: thought.audioUri });
      player.play();
      setPlaying(true);
    } catch (e: any) {
      Alert.alert('播放失败', String(e?.message ?? e));
    }
  };

  const statusMeta = useMemo(
    () => pillFromStatus(issue?.status),
    [issue?.status],
  );

  // 取最新一条带 UI block 的评论 ID —— CommentRow 比较自身 id 决定是否渲染卡片
  // 4 类 Card 互斥：以「最新」为准，历史评论里的旧 block 不重复渲染
  const latestBlock = useMemo(() => latestUIBlock(comments), [comments]);
  const latestBlockCommentId = latestBlock?.commentId ?? null;

  // options chip 点击 → 把 "选 X" 预填到 draft，不直接 send
  // （给用户最后一次机会改文案，与 instructions #14 极简口令推进对齐）
  const onPickOption = useCallback((label: string) => {
    setDraft((prev) => (prev.trim() ? prev : label));
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // 取第一个 run（v1 大多数 issue 只会 run 一次；多 run 情况 v1 降级展示最新）
  const latestRun = useMemo(
    () =>
      runs
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [runs],
  );
  const runOutput =
    (latestRun?.result && typeof latestRun.result === 'object'
      ? (latestRun.result as any).output
      : null) ?? null;

  // toggle 历史产出 · 给 ExecCard 二级页用
  const onToggleHistory = useCallback(() => {
    setShowHistory((v) => !v);
  }, []);

  // 执行态（智能退化用）：pending > running > ok
  // backend 目前没有 waiting_approval 的 status，pending 永远不触发，组件留位
  // Sprint 3.26 · issue · 加 'queued' 进 running 集合（multica 派发 agent 但还没起跑的中间态，
  //   语义上仍是"用户发了指令，agent 在路上"——动画应该已经在转，不能等到 dispatched 才开始）
  const execState: 'pending' | 'running' | 'ok' = useMemo(() => {
    if (!latestRun) return 'ok';
    const s = (latestRun.status || '').toLowerCase();
    if (s === 'waiting_approval' || s === 'pending_approval') return 'pending';
    if (s === 'running' || s === 'dispatched' || s === 'pending' || s === 'queued') return 'running';
    return 'ok';
  }, [latestRun]);

  return (
    <SafeAreaView
      style={styles.container}
      edges={kbHeight > 0 ? ['top'] : ['top', 'bottom']}
    >
      {/* Sprint 3.17/3.18/3.19/3.22 · 视觉底座完整对齐 spec
          · 3.22 · issue · BreathGlow 回归 spec 单颗 normal · 删 sprint 3.18 双 strong
                  原因：sprint 3.18 加倍是当时 detail 内容遮挡 BreathGlow 的兼容代码，
                  sprint 3.20 内容已 transparent 化（line 1559/1599），ScreenBg 直接透出，
                  不再需要"加倍/加强"。继续保留双 strong → 详情页顶部偏 peach 暖光，
                  和首页 cream 主调不一致（用户反馈"百叶窗背景色和页面背景色不一致"）。
                  现对齐首页 App.tsx:405 的 BreathGlow size=280 top=22% normal。
          · 3.19 · ScreenBg 整屏底座（右上 peach 高光 + 左下 amber 暖影 + cream 底）
          · 3.17 · BlindsLight 仅 doing 态出现（progress 屏专用） */}
      <ScreenBg />
      <BreathGlow size={280} top="22%" />
      {/* Sprint 3.26 · issue · 触发条件改 execState === 'running'（latest task run 真的在跑）
          原本 statusMeta.variant === 'doing'（issue.status === 'in_progress'）不准确：
          issue 可能 in_progress 但 multica agent 没在执行。用户原话「真的在执行任务时在运动」
          Sprint 3.27 · issue · focus 模式百叶窗缩短到 100px 顶部区域
          用户原话「切换到查看对话模式时，百叶窗需要缩短一些，在顶部区域就行」 */}
      {execState === 'running' ? (
        <BlindsLight intense height={focusMode ? 100 : 200} />
      ) : null}
      <View style={styles.flex}>
        {/* 顶栏 · Sprint 3.5：← 返回箭头替换为 OS1 LED 按钮（呼吸 led + cream-w 圆底） */}
        <View style={styles.header}>
          <OS1LedButton onPress={onBack} />
          <View style={styles.headerMid}>
            <Text style={styles.ident}>{identifier}</Text>
            {issue ? (
              <Text style={styles.headerSub}>
                {relativeTime(issue.updatedAt)}
              </Text>
            ) : null}
          </View>
          <Pill variant={statusMeta.variant} label={statusMeta.label} />
        </View>

        {/* 粘顶区（B v3 主屏极简：只渲染 ORIGIN，无收起态、无 ExecCard）
            Sprint 3.24 · issue · focusMode 时整个 stickyWrap 隐藏（ORIGIN 让位给 chat） */}
        {!focusMode ? (
        <View style={styles.stickyWrap}>
          {/* ① 原始想法（A1=B1 极简 quote · 大写 serif label + 引号 body）
              播放按钮去掉，audioUri 时长按 body 唤起播放 */}
          {thought ? (
            <View style={styles.original}>
              {/* Sprint 3.9 · 对齐设计稿 .origin .label::before 14px 横线 prefix */}
              <View style={styles.originalLabelRow}>
                <View style={styles.originalLabelDash} />
                <Text style={styles.originalLabel}>
                  ORIGIN · 你的想法
                  {playing ? (
                    <Text style={styles.originalPlayHint}>  · 播放中</Text>
                  ) : null}
                </Text>
              </View>
              {/* Sprint 3.9 · quote 左侧 2px coral 竖线 + italic Source Serif 21px */}
              <View style={styles.originalQuoteWrap}>
                <View style={styles.originalQuoteBar} />
                <Text style={styles.originalQuote} numberOfLines={4}>
                  {`"${thought.text || '（无文字）'}"`}
                </Text>
              </View>
              {/* Sprint 3.8 · 录音回放从"长按 body"改成"点击 ▶ 图标" · 3.9 海浪流动 */}
              {thought.audioUri ? (
                <OriginMiniEnv
                  durationMs={thought.durationMs}
                  playing={playing}
                  onPlay={togglePlay}
                />
              ) : null}
            </View>
          ) : issue?.description ? (
            <View style={styles.original}>
              <View style={styles.originalLabelRow}>
                <View style={styles.originalLabelDash} />
                <Text style={styles.originalLabel}>ORIGIN · 描述</Text>
              </View>
              <View style={styles.originalQuoteWrap}>
                <View style={styles.originalQuoteBar} />
                <Text style={styles.originalQuote} numberOfLines={4}>
                  {`"${issue.description}"`}
                </Text>
              </View>
            </View>
          ) : null}
          {/* ExecCard 主屏不渲染：进度归 ProgressCard，done 归 DoneCard */}

          {/* Sprint 3.23 · issue · convo label 粘顶（用户原话「对话/N 条统计上下滑动应一直固定」）
              原本在 ScrollView 内 sectionLast 顶部，会随滚动滚走 → 移到 stickyWrap 末尾，
              和 ORIGIN 一起粘顶；ScrollView 直接从第 1 条对话开始滚动。 */}
          {!loading && !error ? (
            <View style={styles.convoLabel}>
              <Text style={styles.convoLabelText}>对话</Text>
              <Text style={styles.convoLabelCount}>{comments.length} 条</Text>
            </View>
          ) : null}
        </View>
        ) : null}

        {/* 对话滚动区：现在只承载 comment 气泡，独立滚动 */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.chatContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.accent}
            />
          }
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={COLORS.accent} />
              <Text style={styles.loadingText}>正在拉 Musing 的最新动静…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>加载失败：{error}</Text>
              <TouchableOpacity onPress={onRefresh}>
                <Text style={styles.retryText}>点这里重试</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.sectionLast}>
              {/* Sprint 3.23 · convo label 已迁出到 stickyWrap 末尾粘顶，sectionLast 直接从 comment 1 开始 */}
              {comments.length === 0 ? (
                <Text style={styles.empty}>
                  还没有对话。说点什么，Musing 会回你。
                </Text>
              ) : (
                comments.map((c, idx) => (
                  <CommentRow
                    key={c.id}
                    comment={c}
                    isLast={idx === comments.length - 1}
                    isLatestWithBlock={c.id === latestBlockCommentId}
                    onPickOption={onPickOption}
                  />
                ))
              )}
              {/* Sprint 3.23 · issue · doing 态在 chat 末尾显示 4 道流动 sine
                  用户原话「agent 在回答问题的时候/页面在等待 agent 回答的时候应该显示」
                  Sprint 3.26 · 触发条件改 execState === 'running'（multica agent 真的在执行 task run）
                  原本 statusMeta.variant === 'doing' 不准确——issue 可能 in_progress 但没有 active run */}
              {execState === 'running' ? <SpeakingNow /> : null}
            </View>
          )}
        </ScrollView>

        {/* 录音状态条 · 承载"正在录音"提示，整行 opacity 呼吸（图标静态）
            Sprint 3.3 接入：dot 套 RippleAura 3 道 coral/peach/amber 涟漪 · 录音中可视化 */}
        {voice.isRecording ? (
          <Animated.View
            style={[styles.voiceStatusBar, { opacity: voicePulseOpacity }]}
          >
            <View style={styles.voiceStatusDotWrap} pointerEvents="none">
              <View style={styles.voiceRippleStage}>
                <RippleAura active={true} size={12} />
              </View>
              <View style={styles.voiceStatusDot} />
            </View>
            <Text style={styles.voiceStatusText}>
              正在录音 · 说点什么
            </Text>
          </Animated.View>
        ) : null}

        {/* Sprint 3.24 · issue · 烫金蜡封 toggle button（右拇指区悬浮）
            点击 → toggle focusMode：
              focusMode=true  → 隐藏 ORIGIN + scroll 到 latest agent reply 处
              focusMode=false → 恢复默认（显示 ORIGIN）
            不在录音中才显示（避免和录音状态条挤）；compose bar 上方 ~26px 间距 */}
        {!voice.isRecording ? (
          <TouchableOpacity
            onPress={toggleFocusMode}
            activeOpacity={0.7}
            style={styles.focusToggleBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={focusMode ? '退出对话查看模式' : '进入对话查看模式'}
          >
            <WaxSeal
              size="large"
              letter={focusMode ? '×' : 'M'}
              rotate={focusMode ? 12 : -12}
            />
          </TouchableOpacity>
        ) : null}

        {/* Sprint 3.8 · 详情页底部 compose 重构（横排 input + 右侧 mic socket，对齐设计稿）
         *  - 左侧：cream-w pill TextInput（"说点什么……" placeholder · italic Source Serif）
         *  - 右侧：50px EarpieceMic 金属球 socket，按下切换录音 / 发送
         *  状态机（拍按钮）：
         *    idle (draft empty, !recording)     → EarpieceMic · tap = startVoice
         *    recording                          → EarpieceMic + 外圈 RippleAura · tap = voice.stop
         *    has draft (post-transcription)     → ➤ send · tap = submit
         *    sending                            → ActivityIndicator */}
        <View
          style={[
            styles.composeBar,
            voice.isRecording && styles.composeRecording,
            { marginBottom: kbOffset },
          ]}
        >
          <TextInput
            ref={inputRef}
            style={styles.composeInputPill}
            value={draft}
            onChangeText={setDraft}
            placeholder="追问 musing……"
            placeholderTextColor={COLORS.inkMute}
            multiline
            blurOnSubmit
            onSubmitEditing={() => draft.trim() && submit()}
            returnKeyType="send"
            editable={!sending && !voice.isRecording}
          />
          <Pressable
            onPress={
              sending
                ? undefined
                : voice.isRecording
                  ? voice.stop
                  : draft.trim()
                    ? submit
                    : startVoice
            }
            disabled={sending}
            hitSlop={6}
            style={({ pressed }: { pressed: boolean }) => [
              styles.composeMicBtn,
              pressed && !sending && { opacity: 0.85 },
            ]}
          >
            {sending ? (
              <ActivityIndicator color={COLORS.accent} size="small" />
            ) : voice.isRecording ? (
              <View style={styles.composeMicStage} pointerEvents="none">
                <View style={styles.composeMicRipple}>
                  <RippleAura active={true} size={50} />
                </View>
                <EarpieceMic size={50} socket={true} />
              </View>
            ) : draft.trim() ? (
              <Text style={styles.composeSendArrow}>➤</Text>
            ) : (
              <EarpieceMic size={50} socket={true} />
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ================= 子组件 =================

/**
 * Sprint 3.7 · OriginMiniEnv（3.8 升级 · 点击 ▶ 触发播放）
 * ORIGIN 区下方挂的 mini envelope 视觉 hint + 真实播放控制：
 * 14px coral filled ▶/■ Pressable + 60×18 svg envelope 包络 + italic "时长 · 点击播放/播放中"
 * 来源：docs/her/v2-musing-her.html .origin .mini-env
 */
/**
 * Sprint 3.7 OriginMiniEnv
 *  · 3.8: 点击 ▶ 触发播放
 *  · 3.9: playing 时海浪 horizontally 流动（短版伪 path）
 *  · 3.11: 升级——内嵌真 VoiceEnvelope 组件（C 区包络扫描 6s playhead）
 *    spec docs/her/v2-musing-her.html .obj-card C 区"音量包络 + playhead，6s 扫过"
 *    布局：上行 [▶ + 时长 + 状态文案] / 下行 [VoiceEnvelope 真组件 stretch 全宽 height=28]
 */
function OriginMiniEnv({
  durationMs,
  playing,
  onPlay,
}: {
  durationMs?: number;
  playing?: boolean;
  onPlay?: () => void;
}) {
  const sec = Math.max(0, Math.round((durationMs || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const timeLabel = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;

  // Sprint 3.15 · issue · 回归 spec docs/her/v2-musing-her.html line 128-130
  // 单行 inline pill：[▶] [svg 60×18] [时长 · 点击播放]
  // alignSelf:'flex-start' = width:max-content（不撑满）；envelope 60×18 取代 56 双行版
  return (
    <Pressable
      onPress={onPlay}
      hitSlop={10}
      style={({ pressed }) => [
        styles.originEnv,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.miniEnvPlay}>
        <Text style={styles.miniEnvPlayIcon}>{playing ? '■' : '▶'}</Text>
      </View>
      <View style={styles.miniEnvSvg}>
        <VoiceEnvelope
          active={!!playing}
          height={18}
          durationMs={Math.max(2000, durationMs || 6000)}
        />
      </View>
      <Text style={styles.miniEnvLabel}>
        {timeLabel} · {playing ? '播放中…' : '点击播放'}
      </Text>
    </Pressable>
  );
}

function Pill({ variant, label }: { variant: PillVariant; label: string }) {
  const c = pillColors(variant);
  const animated = variant === 'doing';
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: c.bg,
          borderColor: c.border ?? 'transparent',
          borderWidth: c.border ? 1 : 0,
        },
      ]}
    >
      <PillDot color={c.fg} animated={animated} />
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

function PillDot({ color, animated }: { color: string; animated: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, opacity]);
  return (
    <Animated.View
      style={[styles.pillDot, { backgroundColor: color, opacity }]}
    />
  );
}


function CommentRow({
  comment,
  isLatestWithBlock,
  onPickOption,
}: {
  comment: MulticaComment;
  isLast?: boolean; // 留着向后兼容；新布局下不再需要（底部边框已废）
  isLatestWithBlock?: boolean;
  onPickOption?: (label: string) => void;
}) {
  const isAgent = comment.authorType === 'agent';
  // 拆 UI block：气泡正文走原 markdown，block 走 4 类 Card（仅最新一条评论渲染）
  const { textWithoutBlock, uiBlock } = useMemo(
    () => extractUIBlock(comment.content || ''),
    [comment.content],
  );
  const showCard = isLatestWithBlock && !!uiBlock;
  const bubbleText = textWithoutBlock.trim();
  // Sprint 3.16 · 删头像（spec docs/her/v2-musing-her.html .bubble 没 avatar）
  // bubble 直接靠 align-self:flex-start/flex-end 区分左右，who 标签在 bubble 内首行
  return (
    <View style={[styles.chatRow, !isAgent && styles.chatRowUser]}>
      <View style={[styles.bubbleCol, !isAgent && styles.bubbleColUser]}>
        {bubbleText ? (
          <View
            style={[styles.bubble, isAgent ? styles.bubbleAgent : styles.bubbleUser]}
          >
            {/* Sprint 3.13 · who 标签进 bubble 内部首行（spec .bubble .who） */}
            <Text style={[styles.bubbleWho, !isAgent && styles.bubbleWhoUser]}>
              {isAgent ? 'samantha' : 'theodore'}
            </Text>
            <MarkdownText
              text={bubbleText}
              style={isAgent ? styles.bubbleTextAgent : styles.bubbleTextUser}
            />
          </View>
        ) : null}
        {/* 时间戳保留作为 metadata，但放在 bubble 下方 + 极弱化 */}
        <Text
          style={[styles.bubbleMeta, !isAgent && styles.bubbleMetaUser]}
        >
          {relativeTime(comment.createdAt)}
        </Text>
        {showCard && uiBlock ? (
          <UIBlockCard block={uiBlock} onPickOption={onPickOption} />
        ) : null}
      </View>
    </View>
  );
}

// Sprint 3.10 ① · SpeakingNow 独立块（spec .speaking-now · cream gradient bg + coral 边 + 4 道流动 sine + blink）
// Sprint 3.14 · height 32 → 80（spec voice-viz-lab.html sine-stage svg 160 / 详情页折中 80）
//                让 4 道叠加 + 缓动相位 + 暖色渐变效果可见
function SpeakingNow() {
  return (
    <View style={styles.speakingNow} pointerEvents="none">
      <SineBand active={true} height={80} showLabel={true} />
    </View>
  );
}

// ================= 4 类 UI Block Card =================
//
// 设计稿来源：~/.work/swo-204-uiblock/design.html（用户已拍板 A）
// 字段值（option 描述 / hint / summary value / step label / nextSuggestion）
// 全部走 MarkdownText 子集渲染，让 **加粗** / `code` / [链接](url) 正确显示
// —— 这是 issue 用户原话「markdown 样式没正确渲染」的真因 fix。

function UIBlockCard({
  block,
  onPickOption,
}: {
  block: UIBlock;
  onPickOption?: (label: string) => void;
}) {
  switch (block.intent) {
    case 'propose':
      return <ProposeCard block={block} onPickOption={onPickOption} />;
    case 'ask':
      // Sprint 3.10 ① · ask 卡之前 prepend SpeakingNow 独立块（spec .speaking-now 在 convo 区独立位置）
      return (
        <>
          <SpeakingNow />
          <AskCard block={block} onPickOption={onPickOption} />
        </>
      );
    case 'progress':
      return <ProgressCard block={block} />;
    case 'done':
      return <DoneCard block={block} onPickOption={onPickOption} />;
    default:
      return null;
  }
}


// ================= Markdown renderer · 两阶段解析 =================
//
// 两阶段：
//   ① Block 级：代码块 / 标题 / 引用 / 列表 / 分割线 / 表格 / 段落
//   ② Inline 级（段落/标题/引用/列表项内部）：粗体 / 斜体 / 删除线 / 内联代码 / 链接
//
// 零依赖：纯 RN View + Text + Linking.openURL。样式映射 brand tokens。

// multica 附件 URL 解析：相对 /uploads/... 拼服务器地址，走 Bearer 鉴权
function resolveUploadUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const serverUrl = getCachedConfig().multicaServerUrl.replace(/\/$/, '');
  if (url.startsWith('/') && serverUrl) return `${serverUrl}${url}`;
  return url;
}

type MdBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'code_block'; lang?: string; content: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; ordered: boolean; items: string[]; indent: number }
  | { type: 'divider' }
  | { type: 'image'; alt: string; url: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

type MdInline =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'italic'; content: string }
  | { type: 'strike'; content: string }
  | { type: 'code'; content: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; alt: string; url: string };

function parseBlocks(input: string): MdBlock[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block ```lang\n...\n```
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] || undefined;
      const content: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        content.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code_block', lang, content: content.join('\n') });
      continue;
    }

    // divider --- / *** / ___
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // block-level image：整行只是 ![alt](url)
    const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (imgMatch) {
      blocks.push({ type: 'image', alt: imgMatch[1], url: imgMatch[2] });
      i++;
      continue;
    }

    // heading # ~ ######
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
      });
      i++;
      continue;
    }

    // quote block（连续 > ）
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: q.join('\n') });
      continue;
    }

    // table（检测 header + separator 行）
    if (
      /\|/.test(line) &&
      i + 1 < lines.length &&
      /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const headers = line
        .split('|')
        .map((s) => s.trim())
        .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        const cells = lines[i]
          .split('|')
          .map((s) => s.trim())
          .filter((_, idx, arr) => !(idx === 0 && arr[0] === '') && !(idx === arr.length - 1 && arr[arr.length - 1] === ''));
        rows.push(cells);
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // 无序列表 - * + · 支持缩进（前导空白代表嵌套层级）
    const ulMatch = /^(\s*)([-*+])\s+/.exec(line);
    if (ulMatch) {
      const indent = ulMatch[1].length;
      const items: string[] = [];
      // 同 indent 且同 marker 的行合并为一组；不同 indent 作为独立 block 单独匹配
      while (i < lines.length) {
        const m = /^(\s*)[-*+]\s+/.exec(lines[i]);
        if (!m || m[1].length !== indent) break;
        items.push(lines[i].replace(/^(\s*)[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items, indent });
      continue;
    }

    // 有序列表 1. 2. 3. · 支持缩进
    const olMatch = /^(\s*)\d+\.\s+/.exec(line);
    if (olMatch) {
      const indent = olMatch[1].length;
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^(\s*)\d+\.\s+/.exec(lines[i]);
        if (!m || m[1].length !== indent) break;
        items.push(lines[i].replace(/^(\s*)\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items, indent });
      continue;
    }

    // 空行 skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 普通段落（吸收连续非空 + 非特殊前缀行 · 包括缩进的列表 `  - / 1.`）
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(```|-{3,}|_{3,}|\*{3,}|#{1,6}\s|>\s?|\s*[-*+]\s|\s*\d+\.\s|\||!\[)/.test(
        lines[i],
      )
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }
  return blocks;
}

function parseInline(input: string): MdInline[] {
  // 优先级：image(!) / link > code > bold（**） > strike（~~） > italic（*）
  // image 与 link 共用捕获组，区别只在 `!` 前缀——组 0 的第一个字符判断。
  const pattern =
    /(!?)\[([^\]]*)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*/g;
  const out: MdInline[] = [];
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(input)) !== null) {
    if (m.index > lastEnd) {
      out.push({ type: 'text', content: input.slice(lastEnd, m.index) });
    }
    if (m[2] !== undefined) {
      // link 或 image
      if (m[1] === '!') out.push({ type: 'image', alt: m[2], url: m[3] });
      else out.push({ type: 'link', text: m[2], url: m[3] });
    } else if (m[4] !== undefined) out.push({ type: 'code', content: m[4] });
    else if (m[5] !== undefined) out.push({ type: 'bold', content: m[5] });
    else if (m[6] !== undefined) out.push({ type: 'strike', content: m[6] });
    else if (m[7] !== undefined) out.push({ type: 'italic', content: m[7] });
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd < input.length) {
    out.push({ type: 'text', content: input.slice(lastEnd) });
  }
  return out;
}

/** 检测一组 inline 节点里是否含 image —— 含 image 的段落/cell 不能用 Text wrap，
 *  因为 RN 的 Text 不允许嵌套 Image。调用方需改走 View 布局。*/
function hasInlineImage(nodes: MdInline[]): boolean {
  return nodes.some((n) => n.type === 'image');
}

/** 把含 image 的 inline 片段拆成 "Text chunks + Image" 交错的 React 节点列表，
 *  每个 chunk 自己 wrap 在 Text 里，Image 以 block 形式独立渲染。适用于 paragraph / cell 容器。 */
function renderInlineWithImages(
  segments: MdInline[],
  textStyle?: TextStyle,
): ReactNode[] {
  const out: ReactNode[] = [];
  let buf: MdInline[] = [];
  let key = 0;
  const flush = () => {
    if (buf.length === 0) return;
    out.push(
      <Text key={`t-${key++}`} style={textStyle}>
        {renderInlineNodes(buf)}
      </Text>,
    );
    buf = [];
  };
  for (const seg of segments) {
    if (seg.type === 'image') {
      flush();
      out.push(
        <MarkdownImage
          key={`img-${key++}`}
          alt={seg.alt}
          url={resolveUploadUrl(seg.url)}
        />,
      );
    } else {
      buf.push(seg);
    }
  }
  flush();
  return out;
}

// ================= 代码块语法高亮 · 轻量 tokenizer =================
// 支持：python / javascript / typescript / bash / json 及常见别名。
// 未识别语言 → 不高亮（plain 输出）。颜色全映射 brand tokens，零新色。

type CodeToken = {
  type: 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'op' | 'plain';
  content: string;
};

const KEYWORDS_JS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'break', 'continue', 'switch', 'case', 'default', 'new', 'this',
  'class', 'extends', 'super', 'import', 'export', 'from', 'as', 'typeof',
  'instanceof', 'in', 'of', 'null', 'undefined', 'true', 'false', 'async',
  'await', 'try', 'catch', 'finally', 'throw', 'yield', 'void', 'delete',
]);
const KEYWORDS_TS = new Set([
  ...KEYWORDS_JS,
  'interface', 'type', 'enum', 'implements', 'readonly', 'private', 'public',
  'protected', 'static', 'abstract', 'namespace', 'declare', 'keyof', 'infer',
  'never', 'unknown', 'any', 'string', 'number', 'boolean',
]);
const KEYWORDS_PY = new Set([
  'def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else', 'for',
  'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'try',
  'except', 'finally', 'with', 'as', 'lambda', 'yield', 'pass', 'break',
  'continue', 'async', 'await', 'raise', 'global', 'nonlocal', 'self',
  'assert', 'del',
]);
const KEYWORDS_BASH = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'do', 'done', 'while', 'until',
  'case', 'esac', 'function', 'return', 'export', 'local', 'echo', 'read',
  'source', 'eval', 'exec', 'exit', 'unset', 'cd', 'pwd',
]);

function resolveLang(lang: string | undefined): 'js' | 'ts' | 'py' | 'sh' | 'json' | null {
  const l = (lang || '').toLowerCase();
  if (l === 'js' || l === 'javascript' || l === 'jsx') return 'js';
  if (l === 'ts' || l === 'typescript' || l === 'tsx') return 'ts';
  if (l === 'py' || l === 'python') return 'py';
  if (l === 'sh' || l === 'bash' || l === 'shell' || l === 'zsh') return 'sh';
  if (l === 'json') return 'json';
  return null;
}

function tokenize(code: string, lang: string | undefined): CodeToken[] {
  const resolved = resolveLang(lang);
  if (!resolved) return [{ type: 'plain', content: code }];

  const keywords =
    resolved === 'js' ? KEYWORDS_JS :
    resolved === 'ts' ? KEYWORDS_TS :
    resolved === 'py' ? KEYWORDS_PY :
    resolved === 'sh' ? KEYWORDS_BASH :
    new Set<string>();

  const tokens: CodeToken[] = [];
  let i = 0;
  const push = (type: CodeToken['type'], content: string) => {
    if (content.length === 0) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.content += content;
    else tokens.push({ type, content });
  };

  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;

    // 注释
    if ((resolved === 'py' || resolved === 'sh') && (m = /^#[^\n]*/.exec(rest))) {
      push('comment', m[0]); i += m[0].length; continue;
    }
    if (resolved === 'js' || resolved === 'ts') {
      if ((m = /^\/\/[^\n]*/.exec(rest))) { push('comment', m[0]); i += m[0].length; continue; }
      if ((m = /^\/\*[\s\S]*?\*\//.exec(rest))) { push('comment', m[0]); i += m[0].length; continue; }
    }

    // 字符串（优先三引号 → 双/单/反引号，允许前缀 f/r/b）
    if (resolved === 'py' && (m = /^[frbFRB]{0,2}"""[\s\S]*?"""/.exec(rest))) {
      push('string', m[0]); i += m[0].length; continue;
    }
    if (resolved === 'py' && (m = /^[frbFRB]{0,2}'''[\s\S]*?'''/.exec(rest))) {
      push('string', m[0]); i += m[0].length; continue;
    }
    if ((m = /^[frbFRB]{0,2}"(?:[^"\\\n]|\\.)*"/.exec(rest))) {
      push('string', m[0]); i += m[0].length; continue;
    }
    if ((m = /^[frbFRB]{0,2}'(?:[^'\\\n]|\\.)*'/.exec(rest))) {
      push('string', m[0]); i += m[0].length; continue;
    }
    if ((resolved === 'js' || resolved === 'ts') && (m = /^`(?:[^`\\]|\\.)*`/.exec(rest))) {
      push('string', m[0]); i += m[0].length; continue;
    }

    // 数字
    if ((m = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest))) {
      push('number', m[0]); i += m[0].length; continue;
    }

    // 标识符
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = m[0];
      if (keywords.has(word)) {
        push('keyword', word);
      } else if (code[i + word.length] === '(') {
        push('function', word);
      } else if (resolved === 'json' && /^"[\s\S]*"\s*:/.test(rest)) {
        // json 的 key 已被字符串匹配走，这里走不到；保留
        push('plain', word);
      } else {
        push('plain', word);
      }
      i += word.length;
      continue;
    }

    // 操作符
    if ((m = /^[+\-*/%=!<>&|^~?:]+/.exec(rest))) {
      push('op', m[0]); i += m[0].length; continue;
    }

    // 其余（空白/括号/逗号/点等）→ plain
    push('plain', code[i]);
    i++;
  }
  return tokens;
}

function tokenStyle(type: CodeToken['type']): TextStyle | undefined {
  switch (type) {
    case 'keyword':
      return { color: COLORS.accent, fontWeight: '600' };
    case 'string':
      return { color: COLORS.success };
    case 'comment':
      return { color: COLORS.inkMute, fontStyle: 'italic' };
    case 'number':
      return { color: COLORS.accentHi };
    case 'function':
      return { color: COLORS.media };
    case 'op':
      return { color: COLORS.inkSub };
    case 'plain':
    default:
      return undefined; // 继承 mdCodeBlockText 的 ink 色
  }
}

function openMarkdownLink(url: string) {
  // mention:// 是 multica 的内部协议，手机端暂无对应处理——用 Alert 提示 identifier
  if (url.startsWith('mention://')) {
    const m = url.match(/mention:\/\/issue\/[^/]+/);
    Alert.alert('Musing', m ? `内部引用：${m[0]}` : `引用：${url}`);
    return;
  }
  Linking.openURL(url).catch(() =>
    Alert.alert('打开失败', `无法打开 ${url}`),
  );
}

/** 渲染一段 inline 片段（在 Text 内使用；自己不带 Text wrapper）*/
function renderInlineNodes(segments: MdInline[]): ReactNode[] {
  return segments.map((s, i) => {
    if (s.type === 'bold')
      return (
        <Text key={i} style={styles.mdBold}>
          {s.content}
        </Text>
      );
    if (s.type === 'italic')
      return (
        <Text key={i} style={styles.mdItalic}>
          {s.content}
        </Text>
      );
    if (s.type === 'strike')
      return (
        <Text key={i} style={styles.mdStrike}>
          {s.content}
        </Text>
      );
    if (s.type === 'code')
      return (
        <Text key={i} style={styles.mdCode}>
          {s.content}
        </Text>
      );
    if (s.type === 'link')
      return (
        <Text
          key={i}
          style={styles.mdLink}
          onPress={() => openMarkdownLink(s.url)}
          suppressHighlighting
        >
          {s.text}
        </Text>
      );
    if (s.type === 'image') {
      // 不应走到这里：含 image 的 inline 段应该由 renderInlineWithImages 拆开。
      // 万一 fallback 到这里（比如调用方忘了检查 hasInlineImage），用链接兜底而不是崩溃。
      return (
        <Text
          key={i}
          style={styles.mdLink}
          onPress={() => openMarkdownLink(s.url)}
          suppressHighlighting
        >
          {s.alt || '[image]'}
        </Text>
      );
    }
    if (s.type === 'text') return <Text key={i}>{s.content}</Text>;
    return null;
  });
}

/**
 * 内联图片（block 级）· 支持 multica 相对 `/uploads/...` URL：
 * 1. 用 `onLoad` 的 `nativeEvent.source` 拿到原图尺寸，算 aspectRatio 撑开容器；
 * 2. 失败态显示 alt 文案 + URL（末位 32 字符），不静默吞
 */
function MarkdownImage({ alt, url }: { alt: string; url: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // issue · tap → 全屏 viewer（pinch / pan / 双击 toggle）
  const [viewerOpen, setViewerOpen] = useState(false);

  const source = useMemo(() => {
    const c = getCachedConfig();
    const serverUrl = c.multicaServerUrl.replace(/\/$/, '');
    if (c.multicaToken && serverUrl && url.startsWith(serverUrl)) {
      return {
        uri: url,
        headers: { Authorization: `Bearer ${c.multicaToken}` },
      };
    }
    return { uri: url };
  }, [url]);

  if (failed) {
    return (
      <View style={styles.mdImageFallback}>
        <Text style={styles.mdImageFallbackText}>
          {alt ? `[图片 · ${alt}]` : '[图片]'}
        </Text>
        <Text style={styles.mdImageFallbackUrl} numberOfLines={1}>
          {url}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.mdImageWrap}>
      <Pressable
        onPress={() => setViewerOpen(true)}
        accessibilityLabel={alt ? `${alt} · 点击放大` : '图片 · 点击放大'}
        accessibilityRole="imagebutton"
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <Image
          source={source}
          style={[
            styles.mdImage,
            ratio ? { aspectRatio: ratio } : { height: 180 },
          ]}
          resizeMode="contain"
          onLoad={(e) => {
            const { width: w, height: h } = e.nativeEvent.source;
            if (w && h) setRatio(w / h);
          }}
          onError={() => setFailed(true)}
        />
      </Pressable>
      {alt ? <Text style={styles.mdImageCaption}>{alt}</Text> : null}
      <FullscreenImageViewer
        visible={viewerOpen}
        source={source}
        caption={alt}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

export function MarkdownText({
  text,
  style,
}: {
  text: string;
  style?: TextStyle;
}) {
  const blocks = parseBlocks(text);
  return (
    <View>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph': {
            const segs = parseInline(b.text);
            if (hasInlineImage(segs)) {
              return (
                <View key={i} style={styles.mdParagraph}>
                  {renderInlineWithImages(segs, style)}
                </View>
              );
            }
            return (
              <Text key={i} style={[style, styles.mdParagraph]}>
                {renderInlineNodes(segs)}
              </Text>
            );
          }
          case 'heading': {
            const sizeMap: Record<number, number> = {
              1: 22,
              2: 19,
              3: 17,
              4: 16,
              5: 15,
              6: 14,
            };
            return (
              <Text
                key={i}
                style={[
                  style,
                  styles.mdHeading,
                  { fontSize: sizeMap[b.level] ?? 15 },
                ]}
              >
                {renderInlineNodes(parseInline(b.text))}
              </Text>
            );
          }
          case 'code_block': {
            const tokens = tokenize(b.content, b.lang);
            return (
              <View key={i} style={styles.mdCodeBlock}>
                {b.lang ? (
                  <Text style={styles.mdCodeBlockLang}>{b.lang}</Text>
                ) : null}
                <Text style={styles.mdCodeBlockText}>
                  {tokens.map((t, k) => (
                    <Text key={k} style={tokenStyle(t.type)}>
                      {t.content}
                    </Text>
                  ))}
                </Text>
              </View>
            );
          }
          case 'quote':
            return (
              <View key={i} style={styles.mdQuote}>
                <Text style={[style, styles.mdQuoteText]}>
                  {renderInlineNodes(parseInline(b.text))}
                </Text>
              </View>
            );
          case 'list':
            return (
              <View
                key={i}
                style={[
                  styles.mdList,
                  // 缩进列表：每级缩进 2 个空格 ≈ 20px（嵌套列表视觉分层）
                  b.indent > 0 && { paddingLeft: Math.min(b.indent, 8) * 10 },
                ]}
              >
                {b.items.map((item, idx) => (
                  <View key={idx} style={styles.mdListItem}>
                    <Text style={styles.mdListBullet}>
                      {b.ordered ? `${idx + 1}.` : '•'}
                    </Text>
                    <Text style={[style, styles.mdListText]}>
                      {renderInlineNodes(parseInline(item))}
                    </Text>
                  </View>
                ))}
              </View>
            );
          case 'divider':
            return <View key={i} style={styles.mdDivider} />;
          case 'image':
            return (
              <MarkdownImage key={i} alt={b.alt} url={resolveUploadUrl(b.url)} />
            );
          case 'table':
            return (
              <View key={i} style={styles.mdTable}>
                <View style={[styles.mdTableRow, styles.mdTableHead]}>
                  {b.headers.map((h, c) => {
                    const segs = parseInline(h);
                    if (hasInlineImage(segs)) {
                      // header 含图片 → View 容器（同 body cell 策略，RN Text 不能嵌套 Image）
                      // 外层 View 只吃 mdTableCell 的 View-可用属性；head 专属的 fontWeight/color
                      // 挪到内层 Text chunk 的 mdTableHeadCellText 上。
                      return (
                        <View key={c} style={styles.mdTableCell}>
                          {renderInlineWithImages(
                            segs,
                            styles.mdTableHeadCellText,
                          )}
                        </View>
                      );
                    }
                    return (
                      <Text
                        key={c}
                        style={[styles.mdTableCell, styles.mdTableHeadCell]}
                        numberOfLines={2}
                      >
                        {renderInlineNodes(segs)}
                      </Text>
                    );
                  })}
                </View>
                {b.rows.map((row, r) => (
                  <View key={r} style={styles.mdTableRow}>
                    {row.map((cell, c) => {
                      const segs = parseInline(cell);
                      if (hasInlineImage(segs)) {
                        // cell 含图片 → 用 View 容器渲染（RN Text 无法嵌套 Image）
                        return (
                          <View key={c} style={styles.mdTableCell}>
                            {renderInlineWithImages(segs, styles.mdTableCellText)}
                          </View>
                        );
                      }
                      return (
                        <Text
                          key={c}
                          style={styles.mdTableCell}
                          numberOfLines={3}
                        >
                          {renderInlineNodes(segs)}
                        </Text>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
        }
      })}
    </View>
  );
}

// ================= utils =================

export function fmtClock(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes(),
    ).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function durationSec(startIso: string, endIso: string): number | null {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!a || !b) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

// ================= styles =================

export const styles = StyleSheet.create({
  // Sprint 3.20 · issue · container 透明 → ScreenBg 整屏 radial 完整透出
  // spec docs/her/v2-musing-her.html .screen 是连续整图（line 82-85），不分模块
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },

  // 顶栏 · Sprint 3.12 对齐 spec .topbar 排版（删分隔线 + space-between + 居中 id-block）
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // spec topbar
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 16,
    // Sprint 3.12 ① · 删 borderBottom 分隔线（spec topbar 没分隔线）
  },
  // spec id-block: flex:1 居中 + margin 0 12px
  headerMid: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  // spec id: 16px ds 加粗 charcoal letter-spacing 0.02em
  ident: {
    fontSize: 16,
    color: '#2C2826', // charcoal
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    letterSpacing: 0.32,
  },
  // spec time: 11px italic ds mauve
  headerSub: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.inkMute, // mauve
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
  },

  // 粘顶区：想法 + 执行
  // Sprint 3.13 · 删 shadow + elevation（用户报"分隔线还在" · spec 详情页是连续 cream 底，靠 padding 分层不靠 shadow）
  // Sprint 3.20 · issue · 删 cream bg → ScreenBg 整屏渐变透出，不再分模块切割
  stickyWrap: {
    zIndex: 2,
  },
  stickyWrapCollapsed: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },

  // 收起态单行
  collapsedRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSub,
    borderRadius: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  collapsedRowPending: {
    backgroundColor: COLORS.dangerBg,
    borderColor: COLORS.danger,
    borderWidth: 1,
  },
  collapsedRowIcon: {
    fontSize: 16,
  },
  collapsedRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkSub,
  },
  collapsedRowBody: {
    flex: 1,
    fontSize: 13,
    color: COLORS.inkSub,
    fontFamily: FONT_CN,
  },
  collapsedRowChev: {
    fontSize: 18,
    color: COLORS.inkMute,
    marginLeft: 4,
  },

  // 执行卡里的历史产出折叠
  runHistoryWrap: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  runHistoryToggle: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
  },
  runHistoryList: {
    marginTop: 8,
    maxHeight: 240,
  },
  runHistoryListContent: {
    gap: 10,
    paddingRight: 4, // 给滚动条让位，避免遮挡日期戳
  },
  runHistoryItem: {
    paddingVertical: 4,
  },
  runHistoryDate: {
    fontSize: 11,
    color: COLORS.inkMute,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  runHistoryText: {
    fontSize: 13,
    color: COLORS.inkSub,
    fontFamily: FONT_CN,
    lineHeight: 20,
  },

  // 对话滚动区
  chatContent: {
    paddingBottom: 8,
  },

  // 原始想法 · Sprint 3.9 对齐设计稿 .origin spec
  scrollContent: { paddingBottom: 8 },
  original: {
    // Sprint 3.17 · 真机 390dp 宽对齐三大区 padding：26→22（header 22 / chat 22 / compose 22 一条直线）
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 14,
    // Sprint 3.12 ① · 删 ORIGIN 底部分隔线（spec 没分隔线，ORIGIN 与 convo 之间靠 padding 分层）
  },
  // Sprint 3.9 · label 前加 14px 横线 prefix（spec .origin .label::before）
  originalLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  originalLabelDash: {
    width: 14,
    height: 1,
    backgroundColor: COLORS.inkMute,
  },
  // spec: font-size 10, letter-spacing .32em, uppercase, mauve
  originalLabel: {
    fontSize: 10,
    color: COLORS.inkMute,
    letterSpacing: 3.2, // 0.32em ≈ 3.2px @ 10px
    textTransform: 'uppercase',
    fontFamily: FONT_SERIF_BOLD,
  },
  // 播放态 inline hint
  originalPlayHint: {
    color: COLORS.accent,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
  },
  // Sprint 3.9 · quote 左侧 2px coral 竖线（spec .origin .quote::before）+ italic Source Serif 21px
  originalQuoteWrap: {
    position: 'relative',
    paddingLeft: 14,
  },
  originalQuoteBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  originalQuote: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 21,
    lineHeight: 32,
    color: COLORS.ink,
  },
  // Sprint 3.7 · ORIGIN 区下方 mini-env 静态包络 hint（保留旧 style 兼容）
  miniEnv: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingLeft: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(244,184,157,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,90,79,0.18)',
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  // Sprint 3.15 · issue · 回归 spec docs/her/v2-musing-her.html line 128
  // single-row inline pill: [▶] [svg 60×18] [text]
  // alignSelf:'flex-start' ≈ width:max-content（不撑满全宽）
  // padding 6/14/6/10 + borderRadius 14 + marginTop 10 全部对齐 spec
  originEnv: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 14,
    // Sprint 3.17 · italic 字体尾巴溢出 → paddingRight 10→16，"放"字不再被裁
    paddingRight: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(244,184,157,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,90,79,0.18)',
  },
  // svg 容器：spec 写死 60×18
  miniEnvSvg: {
    width: 60,
    height: 18,
    overflow: 'hidden',
  },
  miniEnvPlay: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniEnvPlayIcon: {
    fontSize: 8,
    color: COLORS.bgSub,
    lineHeight: 10,
  },
  miniEnvLabel: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 10.5,
    color: COLORS.accentHi,
    letterSpacing: 0.4,
  },

  // section 通用
  section: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // 最后一个 section（评论区）不画底边，和 compose 顶边合并为单条视觉分隔
  sectionLast: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    color: COLORS.inkMute,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 12,
  },
  // Sprint 3.10 ① · SpeakingNow 独立块（spec .speaking-now · cream gradient bg + coral 边）
  speakingNow: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(244,184,157,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(232,90,79,0.18)',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  // Sprint 3.24 · issue · 烫金蜡封 focus toggle 按钮（详情页右拇指悬浮）
  focusToggleBtn: {
    position: 'absolute',
    right: 22,
    bottom: 90, // compose bar 高度 ~70 + spacing 20，避开 mic 球
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10, // 高于 chat ScrollView，浮在所有内容之上
  },

  // Sprint 3.10 ⑦ · convo label 横排（spec .convo-label space-between）
  // Sprint 3.23.1 · issue · paddingHorizontal 6 → 22 对齐三大区 anchor
  //   原本只有 6px 太贴左右两边，spec .convo 容器有 20px 横向 padding + 自身 6px = ~26px 内边距
  //   迁到 stickyWrap 后没了容器 padding，要在 label 自己上补到 22 与 ORIGIN/chat 横向对齐
  convoLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 6,
    marginBottom: 6,
  },
  convoLabelText: {
    fontSize: 10,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: COLORS.inkMute,
    fontFamily: FONT_SERIF_BOLD,
  },
  convoLabelCount: {
    fontSize: 10,
    letterSpacing: 2.8,
    textTransform: 'uppercase',
    color: COLORS.accentHi,
    fontFamily: FONT_SERIF_BOLD,
  },

  // 时间线
  timeline: { gap: 2 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 10,
  },
  timelineDot: { width: 6, height: 6, borderRadius: 3 },
  timelineTime: {
    fontSize: 12,
    color: COLORS.inkMute,
    minWidth: 62,
    fontVariant: ['tabular-nums'],
  },
  timelineText: { fontSize: 13, color: COLORS.inkSub, flex: 1 },

  runOutput: {
    marginTop: 14,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.bgSub,
  },
  runOutputLabel: {
    fontSize: 10,
    color: COLORS.inkMute,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 6,
  },
  runOutputText: {
    fontFamily: FONT_CN,
    fontSize: 14,
    lineHeight: 24,
    color: COLORS.ink,
  },

  // 评论
  empty: {
    fontFamily: FONT_CN,
    fontSize: 13,
    color: COLORS.inkMute,
    paddingVertical: 8,
  },
  // ---- 对话气泡（Sprint 3.16 · 对齐 spec · 没头像，bubble 直接靠 align-self 分左右）----
  chatRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    alignItems: 'flex-start',
    width: '100%',
  },
  chatRowUser: {
    flexDirection: 'row-reverse',
  },
  bubbleCol: {
    flexShrink: 1,
    // Sprint 3.17 · 真机 390dp 宽优化：78%→88%，给长内容更舒展的呼吸空间
    maxWidth: '88%',
    alignItems: 'flex-start',
  },
  bubbleColUser: {
    alignItems: 'flex-end',
  },
  bubbleMeta: {
    fontSize: 11,
    color: COLORS.inkMute,
    marginBottom: 4,
    marginHorizontal: 2,
  },
  bubbleMetaUser: {
    textAlign: 'right',
  },
  // Sprint 3.10 ④ · bubble 配色对齐 spec
  // - agent: cream-w + 米色 border + soft shadow + 左下不对称 8px 圆角
  // - me: rose→pink 渐变（用中间色 #EDBDB1 近似单色，RN 无原生渐变）+ 右下 8px + charcoal 文字
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22, // Sprint 3.13 · spec --r-bubble:22px
  },
  // Sprint 3.13 · who 标签放进 bubble 内部（spec .bubble .who · italic burnt 11.5px）
  bubbleWho: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 11.5,
    color: COLORS.accentHi, // burnt #C8553D
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  bubbleWhoUser: {
    color: '#8B4A3A', // spec .bubble.me .who color
  },
  bubbleAgent: {
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: 'rgba(224,213,194,0.7)',
    borderBottomLeftRadius: 8, // spec border-bottom-left-radius 8px
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleUser: {
    backgroundColor: '#EDBDB1', // rose#E8B4A0 + pink#F2C6C2 中间值近似（RN 无原生 linear-gradient）
    borderBottomRightRadius: 8, // spec border-bottom-right-radius 8px
  },
  bubbleTextAgent: {
    fontFamily: FONT_CN,
    fontSize: 13.5,
    lineHeight: 22,
    color: '#2C2826', // charcoal
  },
  bubbleTextUser: {
    fontFamily: FONT_CN,
    fontSize: 13.5,
    lineHeight: 22,
    color: '#2C2826', // charcoal（spec .bubble.me color）
  },
  mdLink: {
    color: COLORS.accent,
    textDecorationLine: 'underline',
    textDecorationColor: COLORS.accent,
  },
  mdCode: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 13,
    color: COLORS.accent,
    backgroundColor: COLORS.codeSurface,
    // RN inline Text 不支持 padding，用 letterSpacing + 前后加空格视觉兜；此处不 padding
  },
  mdBold: { fontWeight: '700' },
  mdItalic: { fontStyle: 'italic' },
  mdStrike: { textDecorationLine: 'line-through' },

  mdParagraph: {
    marginTop: 4,
    marginBottom: 4,
  },
  mdHeading: {
    fontFamily: FONT_SERIF_BOLD,
    color: COLORS.ink,
    marginTop: 10,
    marginBottom: 4,
    letterSpacing: -0.3,
  },

  // 代码块（block 级，多行）· warm codeSurface 底（比 bgSub 深一档）+ hairline 边
  // 故意比气泡背景再深一档，避免在 agent 气泡（bgSub）里隐身
  mdCodeBlock: {
    backgroundColor: COLORS.codeSurface,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 6,
  },
  mdCodeBlockLang: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 10,
    color: COLORS.inkMute,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  mdCodeBlockText: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.ink,
  },

  // 引用块 · 左侧 accent 竖条 + 微底色
  mdQuote: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
    backgroundColor: 'rgba(201,100,66,0.05)',
    paddingLeft: 12,
    paddingVertical: 6,
    marginVertical: 6,
  },
  mdQuoteText: {
    color: COLORS.inkSub,
    fontStyle: 'italic',
  },

  // 列表 · bullet + 缩进
  mdList: {
    marginVertical: 4,
  },
  mdListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  mdListBullet: {
    color: COLORS.accent,
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 15,
    lineHeight: 26,
    width: 24,
    textAlign: 'right',
    marginRight: 8,
  },
  mdListText: {
    flex: 1,
  },

  // 分割线
  mdDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  // 图片（block 级）· 撑满列宽，aspectRatio 由 onLoad 动态算
  mdImageWrap: {
    marginVertical: 8,
    alignItems: 'stretch',
  },
  mdImage: {
    width: '100%',
    borderRadius: 6,
    backgroundColor: COLORS.bgSub,
  },
  mdImageCaption: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.inkSub,
    textAlign: 'center',
  },
  mdImageFallback: {
    marginVertical: 8,
    padding: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSub,
  },
  mdImageFallbackText: {
    fontSize: 13,
    color: COLORS.ink,
  },
  mdImageFallbackUrl: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.inkMute,
  },

  // 表格（简化：等宽列 + 横线分隔）
  mdTable: {
    marginVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  mdTableRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  mdTableHead: {
    backgroundColor: COLORS.bgSub,
  },
  mdTableCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.ink,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLORS.border,
  },
  // 表格单元格里含 image 时，外层是 View 不再能直接吃 fontSize/color；
  // 这个 style 专门给 cell 内的 Text chunk（和图片穿插的文本片段）用。
  mdTableCellText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.ink,
  },
  mdTableHeadCell: {
    fontWeight: '600',
    color: COLORS.inkSub,
  },
  // header cell 含图片时外层降级为 View，这个 style 给 View 内 Text chunk 复刻 head 视觉
  mdTableHeadCellText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.inkSub,
    fontWeight: '600',
  },

  // pill
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    gap: 6,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },

  // loading / error
  loading: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  loadingText: { fontSize: 13, color: COLORS.inkMute, fontFamily: FONT_CN },
  errorBox: { padding: 22, alignItems: 'center', gap: 10 },
  errorText: { fontSize: 13, color: COLORS.danger, fontFamily: FONT_CN },
  retryText: { fontSize: 13, color: COLORS.accent },

  // 底部追问
  // Sprint 3.20 · issue · compose bg 透明 + 删 borderTop（spec 用 linear-gradient 透明过渡，不画硬线、不画 cream 切色）
  compose: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 16,
    backgroundColor: 'transparent',
    gap: 10,
  },
  composeInput: {
    flex: 1,
    backgroundColor: COLORS.bgSub,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONT_CN,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
    maxHeight: 120,
    minHeight: 38,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.inkMute },
  sendArrow: { color: '#fff', fontSize: 16, marginLeft: 2 },

  /* 纯语音激进态 · 整条橙色语音条
   *  视觉目标：一眼就知道"按底部 = 聊天"，取代右侧独立麦克风 */
  aggressiveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: Platform.OS === 'ios' ? 14 : 16,
    paddingHorizontal: 20,
    borderRadius: 30, // 高度/2 ≈ 30 → 药丸
    backgroundColor: COLORS.accent, // clay orange，品牌主色
  },
  aggressiveBarRecording: {
    backgroundColor: COLORS.accentHi, // 录音中换深一档，给视觉反馈
  },
  aggressiveBarIcon: {
    fontSize: 26,
    color: '#fff',
  },
  // Sprint 3.7b · aggressiveBar 内嵌 EarpieceMic 金属球
  aggressiveBarMicWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sprint 3.8 · 重构 compose bar：横排 cream-w input + 右侧金属球 socket
  // Sprint 3.13 · 删 borderTopWidth（spec .compose 用 linear-gradient 透明过渡，不画硬线）
  // Sprint 3.20 · issue · composeBar bg 透明（input pill 自带 cream-w，外层不需要 cream 切割）
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // Sprint 3.17 · 真机 390dp 宽对齐三大区 padding：18→22（header / chat / compose 横向 anchor 一致）
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 22,
    backgroundColor: 'transparent',
  },
  composeInputPill: {
    flex: 1,
    backgroundColor: COLORS.bgSub,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.ink,
    maxHeight: 88,
    minHeight: 44,
    // soft shadow（spec var(--shadow-soft) 近似）
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 0,
  },
  composeMicBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeMicStage: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  composeMicRipple: {
    position: 'absolute',
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeSendArrow: {
    fontSize: 22,
    color: COLORS.accent,
    fontWeight: '600',
  },
  aggressiveBarStopSquare: {
    width: 18,
    height: 18,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  aggressiveBarSend: {
    fontFamily: FONT_CN,
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  aggressiveBarSendArrow: {
    fontSize: 18,
    color: '#fff',
  },

  // 语音入口：麦克风按钮（替换 send 按钮位，draft 空时显示）
  voiceMicBtn: {
    backgroundColor: COLORS.accent,
  },
  voiceMicIcon: { fontSize: 20 },
  // 录音中的停止按钮（深红土 + 内部白方块）
  voiceStopBtn: {
    backgroundColor: COLORS.accentHi,
  },
  voiceStopSquare: {
    width: 14,
    height: 14,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  // 录音状态条（紧贴 compose 顶）· 极简一行，不遮挡评论
  // Sprint 3.20 · issue · bg 透明（layout 层不再切色，spec 没有）
  voiceStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 7,
    backgroundColor: 'transparent',
    // Sprint 3.13 · 删 borderTop（用户报视觉分隔线 · spec 没有）
  },
  voiceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accentHi,
  },
  // Sprint 3.3 · dot + RippleAura 同心叠层
  voiceStatusDotWrap: {
    width: 16,
    height: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceRippleStage: {
    position: 'absolute',
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceStatusText: {
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  // 录音中 compose 顶 border 由 voiceStatusBar 的 borderTop 承担，自己不画 —— 避免双线
  composeRecording: {
    borderTopWidth: 0,
  },

  // 展开按钮（compose 左侧，飞书式大屏输入入口）
  expandBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandIcon: {
    fontSize: 12,
    fontFamily: FONT_CN,
    color: COLORS.inkSub,
    letterSpacing: 0.5,
  },

  // 大屏编辑器（覆盖式）
  fullEditor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.bg,
    zIndex: 1000,
    elevation: 1000, // Android
  },
  fullEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  fullEditorCancel: {
    fontSize: 15,
    color: COLORS.inkSub,
    fontFamily: FONT_CN,
  },
  fullEditorTitle: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 17,
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  fullEditorSend: {
    fontSize: 15,
    color: COLORS.accent,
    fontFamily: FONT_CN,
    fontWeight: '600',
  },
  fullEditorSendDisabled: {
    color: COLORS.inkMute,
    fontWeight: '400',
  },
  // header 中间 编辑/预览 segmented control
  editorTabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorTab: {
    fontFamily: FONT_CN,
    fontSize: 14,
    color: COLORS.inkMute,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  editorTabActive: {
    color: COLORS.ink,
    fontWeight: '600',
  },
  editorTabDivider: {
    color: COLORS.border,
    fontSize: 14,
  },
  // 预览态容器（ScrollView 里放 MarkdownText）
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  previewEmpty: {
    textAlign: 'center',
    color: COLORS.inkMute,
    fontSize: 13,
    fontFamily: FONT_CN,
    marginTop: 40,
  },
  fullEditorInput: {
    flex: 1,
    paddingHorizontal: 22,
    paddingVertical: 18,
    fontFamily: FONT_CN,
    fontSize: 17,
    lineHeight: 28,
    color: COLORS.ink,
    // Android 必须关掉 font extra padding 才能和 overlay Text 对齐
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  // WYSIWYG 覆盖层：容器相对定位，overlay Text 和 TextInput 共占同一区域
  editorStack: {
    flex: 1,
    position: 'relative',
  },
  editorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // textAlignVertical top 保持 multiline 从顶对齐
    textAlignVertical: 'top',
  },
  editorTransparent: {
    color: 'transparent',
    backgroundColor: 'transparent',
  },
  // Musing 气质水印（右下角 serif 半透明）
  fullEditorWatermark: {
    position: 'absolute',
    right: 18,
    bottom: 80,
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 72,
    color: COLORS.accent,
    opacity: 0.06,
    letterSpacing: -2,
    // 不影响点击事件 & 不被当作无障碍焦点
    // @ts-ignore: pointerEvents 放 style 里是 RN 特例
  },

  // Markdown 工具条（紧贴键盘顶）
  // Sprint 3.20 · issue · bg 透明（fullEditor 自带 cream 兜底，不需要再切一层）
  mdToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  mdToolBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    minWidth: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mdToolBtnPressed: {
    backgroundColor: COLORS.accentBg, // 半透明 accent 底色 · 按下瞬间高亮反馈
  },
  mdToolBtnText: {
    fontSize: 16,
    color: COLORS.inkSub,
    fontFamily: FONT_CN,
  },
  mdToolBtnTextPressed: {
    color: COLORS.accent, // 按下时文字也变 accent 色，视觉上"激活"
  },

  // ============= UI Block Card 4 类共享 + 4 类专属 =============
  // 设计稿来源：~/.work/swo-204-uiblock/design.html
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 6,
  },
  cardPropose: { borderColor: COLORS.accent },
  cardAsk: { borderColor: 'rgba(201,100,66,0.55)' },
  cardProgress: { borderColor: 'rgba(106,155,204,0.55)' },
  cardDone: { borderColor: 'rgba(120,140,93,0.55)' },

  // Sprint 3.1 · ProposeCard recommended 时卡片右上角悬挂 small 蜡封
  cardWithWax: { paddingTop: 18 }, // 给蜡封让一点出头空间

  // Sprint 3.2 · AskCard 头部 SineBand 装饰
  cardWithSine: { paddingTop: 6 },
  cardSineHeader: {
    marginHorizontal: -6,
    marginBottom: 8,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: 'rgba(201,100,66,0.04)',
  },

  // Sprint 3.4 · DoneCard 信纸 + 蜡封 huge + 声纹三件套
  doneStage: {
    position: 'relative',
    alignSelf: 'stretch',
    marginTop: 6,
    marginRight: 6, // 给右上角 huge 蜡封出头让位
  },
  doneLetter: {
    alignSelf: 'stretch',
  },
  doneWaxCorner: {
    position: 'absolute',
    top: -10,
    right: 4,
    zIndex: 2,
  },
  doneTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 56, // 给右上角 huge 蜡封让位
    marginBottom: 8,
  },
  doneTitleIcon: {
    fontSize: 16,
    color: COLORS.success,
    lineHeight: 22,
  },
  doneTitle: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 17,
    color: COLORS.ink,
    lineHeight: 22,
  },
  doneSignatureWrap: {
    marginTop: 12,
  },
  // Sprint 3.10 ③ · DoneCard letterhead 三件套
  letterHead: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 11,
    color: COLORS.accentHi, // burnt
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
    marginTop: -4,
  },
  letterHeadOrnate: {
    color: COLORS.inkMute, // mauve
  },
  letterCompany: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 18,
    color: COLORS.ink,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  letterRule: {
    height: 1,
    marginBottom: 12,
    backgroundColor: 'rgba(176,139,139,0.45)',
  },
  cardWaxCorner: {
    position: 'absolute',
    top: -10,
    right: 14,
    zIndex: 2,
  },
  // Sprint 3.1 · OptionRow recommended 时右上角 mini 蜡封
  optionWaxCorner: {
    position: 'absolute',
    top: -8,
    right: 8,
    zIndex: 2,
  },

  // Sprint 3.12 ③ · 对齐 spec .uicard .card-head（32px circle icon + 16 serif charcoal title）
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  cardTitleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitleIcon: {
    fontSize: 16,
    lineHeight: 18,
  },
  cardTitleTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2826', // charcoal
    letterSpacing: 0.2,
  },
  cardHintWrap: {
    paddingTop: 6,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderStyle: 'dashed',
  },
  cardHintText: {
    fontFamily: FONT_CN,
    fontSize: 11,
    color: COLORS.inkMute,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ===== options（propose / ask 共用）=====
  optionList: {
    gap: 6,
    marginBottom: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgSub,
  },
  optionRowRecommended: {
    backgroundColor: 'rgba(201,100,66,0.10)',
    borderColor: COLORS.accent,
  },
  optionRowPressed: {
    opacity: 0.65,
  },
  optionId: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 13,
    color: COLORS.inkSub,
    minWidth: 16,
    textAlign: 'center',
  },
  optionIdRecommended: {
    color: COLORS.accentHi,
  },
  optionDescWrap: {
    flex: 1,
  },
  optionDesc: {
    fontFamily: FONT_CN,
    fontSize: 13,
    color: COLORS.ink,
    lineHeight: 19,
  },
  optionStar: {
    fontFamily: FONT_CN,
    fontSize: 10,
    color: COLORS.accent,
    marginLeft: 4,
    marginTop: 1,
  },

  // ===== progress =====
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  progressFrac: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 13,
    color: COLORS.media,
  },
  progressCurrentWrap: { flex: 1 },
  progressCurrent: {
    fontFamily: FONT_CN,
    fontSize: 11,
    color: COLORS.inkSub,
  },
  stepList: {
    gap: 4,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  stepRowNow: {
    backgroundColor: 'rgba(106,155,204,0.10)',
  },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: COLORS.success },
  stepDotNow: { backgroundColor: COLORS.media },
  // Sprint 3.10 ⑤ · now marker = amber 内圆 + 4px coral 0.25 ring 光晕（spec .step.now .marker）
  stepNowRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,155,122,0.25)', // 4px ring 替代：用稍大半径 + 透明 amber 拟光晕
  },
  stepNowDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D49B7A', // amber spec
  },
  // Sprint 3.3 · done step 用 WaxSeal small（24px），需要外层 wrap 控制对齐
  stepWaxWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotTodo: {
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepDotText: {
    fontSize: 10,
    color: '#fff',
    fontFamily: FONT_SERIF_BOLD,
    lineHeight: 12,
  },
  stepLabelWrap: { flex: 1 },
  stepLabel: {
    fontFamily: FONT_CN,
    fontSize: 13,
    color: COLORS.ink,
    lineHeight: 18,
  },
  stepLabelMute: { color: COLORS.inkMute },
  // Sprint 3.10 ② · ProgressCard 底部 progress-bar + meta 横排
  progressBarWrap: {
    marginTop: 8,
  },
  progressBarMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressBarMetaLeft: {
    fontSize: 11,
    color: COLORS.inkMute,
    letterSpacing: 0.4,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
  },
  progressBarMetaRight: {
    fontSize: 11,
    color: COLORS.inkMute,
    letterSpacing: 0.4,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
  },
  // Sprint 3.10 ⑤ · done 文字划掉，now 加粗
  stepLabelDone: {
    color: COLORS.ink,
    textDecorationLine: 'line-through',
    textDecorationColor: 'rgba(155,53,37,0.4)',
    opacity: 0.65,
  },
  stepLabelNow: {
    color: COLORS.ink,
    fontWeight: '600',
  },

  // ===== done summary + suggestions =====
  summaryBox: {
    backgroundColor: 'transparent', // Sprint 3.10 ⑥ · 信纸内不要再叠 cream box
    padding: 0,
    marginBottom: 8,
    gap: 0,
  },
  // Sprint 3.10 ⑥ · spec letter-summary：space-between · 行间 dashed mauve
  summaryRowSpaced: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(176,139,139,0.3)',
    borderStyle: 'dashed',
  },
  summaryLblSpec: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    color: COLORS.inkMute, // warm-gray
  },
  summaryValSpecWrap: {
    flexShrink: 1,
  },
  summaryValSpec: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    color: COLORS.accentHi, // burnt
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryIcon: {
    fontSize: 13,
    width: 16,
    textAlign: 'center',
  },
  summaryLabel: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkSub,
    flexShrink: 0,
  },
  summaryValueWrap: {
    flex: 1,
  },
  summaryValue: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.ink,
    lineHeight: 18,
  },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  suggestChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  suggestChipPressed: { opacity: 0.65 },
  suggestText: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkSub,
  },
});
