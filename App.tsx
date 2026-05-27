import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Keyboard,
  Animated,
  Easing,
  AppState,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
// issue · 图片放大缩小 viewer 用 react-native-gesture-handler，
// 必须在 app 根挂 GestureHandlerRootView（android 新架构强制要求）
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFonts } from 'expo-font';
import { MulticaClient, deriveIssueTitle } from './src/multica';
import { DetailScreen } from './src/DetailScreen';
import { HerLabScreen } from './src/HerLabScreen';
import { SettingsScreen } from './src/SettingsScreen';
import {
  useConfig,
  isMulticaConfigured,
  isIflytekConfigured,
} from './src/config';
import { BreathGlow } from './src/components/her/BreathGlow';
import { EarpieceMic } from './src/components/her/EarpieceMic';
import { PolaroidCard } from './src/components/her/PolaroidCard';
import { RippleAura } from './src/components/her/RippleAura';
import { ScreenBg } from './src/components/her/ScreenBg';
import { useVoiceInput, VoiceInputResult } from './src/useVoiceInput';

// dev-only Lab gate · 长按主屏标题进入 Her Lab。仅在 dev build 启用，
// release build 永远关闭——不再有 build-time env 后门
const HER_LAB_ENABLED =
  typeof __DEV__ !== 'undefined' && (__DEV__ as boolean);
import {
  COLORS,
  FONT_CN,
  FONT_SERIF_BOLD,
  PillVariant,
  pillColors,
  pillFromStatus,
} from './src/theme';
import { Thought } from './src/types';

// All credentials come from `useConfig()` at runtime (Settings screen →
// SecureStore / AsyncStorage). No build-time .env fallback. See src/config.ts.

const STORAGE_KEY = 'thoughts_v1';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return m > 0 ? `${m}:${String(rs).padStart(2, '0')}` : `${rs}s`;
}

export default function App() {
  // Musing 字体链：
  //   英文标题 → Source Serif 4 SemiBold（Adobe, Anthropic 官网同款）
  //   中文正文 → 霞鹜新楷 LXGW Neo XiHei（独立开源，早期坚果 T1/T2 vibe）
  // RN 单 fontFamily 不支持 CSS fallback list；在 styles 里按"正文/标题"分别指定
  useFonts({
    'SourceSerif4-Semibold': require('./assets/fonts/SourceSerif4-Semibold.ttf'),
    'LXGWNeoXiHei': require('./assets/fonts/LXGWNeoXiHei.ttf'),
  });

  // issue · 把 SafeAreaProvider 提到外层，让 AppInner 能用 useSafeAreaInsets()
  // issue · GestureHandlerRootView 包最外层，让 ImageViewer 的 pinch/pan 手势能被 native 拿到
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppInner() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // 点击已发送的卡片进入对话式详情页（方向 B · 2026-04-30）
  const [viewingIdentifier, setViewingIdentifier] = useState<string | null>(
    null,
  );
  // dev-only · 长按主屏标题"Musing"进 Her Lab 视觉组件库
  const [viewingLab, setViewingLab] = useState(false);
  // 主屏齿轮 ⚙️ 入口 · 设置页（讯飞 / multica / 默认指派 配置）
  const [viewingSettings, setViewingSettings] = useState(false);

  // runtime config (Settings screen → SecureStore / AsyncStorage, .env fallback)
  const cfg = useConfig();

  const inputRef = useRef<TextInput>(null);
  // issue · 录音前 draft 作为前缀保护，避免覆盖用户已经打的字
  const voicePrefixRef = useRef('');
  // issue · 录音产物（音频/时长）暂存，等用户 tap ➤ 时和 draft 一起组装成 Thought
  const lastVoiceRef = useRef<VoiceInputResult | null>(null);

  // 键盘避让 · 与 DetailScreen 同思路：监听键盘事件给 composeBar 加 marginBottom
  const insets = useSafeAreaInsets();
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      setKbHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      setKbHeight(0);
      inputRef.current?.blur();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const kbOffset =
    kbHeight > 0
      ? kbHeight + (Platform.OS === 'android' ? insets.bottom : 0)
      : 0;

  // issue DEBUG · 先跑 storage 加载 + mock 注入（不要被 permission dialog 阻塞）
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          setThoughts(JSON.parse(raw));
        } else {
          // 空 storage 注入 mock 让 emulator 也能 tap 进 detail 页验证 layout bg 改动
          const mock: Thought[] = [
            {
              id: 'swo222-mock',
              text: '这是一条测试 thought，用来验证详情页背景图整图渲染',
              audioUri: '',
              durationMs: 9000,
              createdAt: Date.now() - 3 * 60 * 1000,
              sendStatus: 'sent',
              issueIdentifier: 'DEMO-001',
              issueId: '00000000-0000-0000-0000-000000000001',
              issueStatus: 'done',
              commentCount: 5,
              lastSeenCommentCount: 5,
            },
          ];
          setThoughts(mock);
        }
      } catch (e) {
        console.warn('读取本地想法失败', e);
      }
    })();
  }, []);

  const persist = useCallback(async (next: Thought[]) => {
    setThoughts(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  // issue · 复用详情页的 useVoiceInput hook：录音中 liveText 实时回填 draft，
  // 用户看着字在输入框里"长出来"。最终结果也覆盖一次（IAT final 可能比最后一帧
  // 修订过）。lastVoiceRef 暂存音频/时长，等用户 tap ➤ 一并组装进 Thought。
  const voice = useVoiceInput({
    iflytek: {
      appid: cfg?.iflytekAppid ?? '',
      apiKey: cfg?.iflytekApiKey ?? '',
      apiSecret: cfg?.iflytekApiSecret ?? '',
    },
    onFinal: (result) => {
      lastVoiceRef.current = result;
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

  // 录音中 liveText 实时同步 draft（详情页同款体验）
  useEffect(() => {
    if (!voice.isRecording) return;
    const prefix = voicePrefixRef.current;
    const sep = prefix && voice.liveText && !/\s$/.test(prefix) ? ' ' : '';
    setDraft(prefix + sep + voice.liveText);
  }, [voice.isRecording, voice.liveText]);

  const startVoice = useCallback(() => {
    voicePrefixRef.current = draft;
    lastVoiceRef.current = null;
    voice.start();
  }, [draft, voice]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const v = lastVoiceRef.current;
      const thought: Thought = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        // 纯文字输入时 durationMs/audioUri 为空（向后兼容 Thought 类型）
        durationMs: v?.durationMs ?? 0,
        audioUri: v?.audioUri ?? '',
        text,
      };
      await persist([thought, ...thoughts]);
      setDraft('');
      lastVoiceRef.current = null;
      voicePrefixRef.current = '';
      Keyboard.dismiss();
    } catch (e: any) {
      Alert.alert('保存失败', String(e?.message ?? e));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    await persist(thoughts.filter((x) => x.id !== id));
  };

  /** 详情页回调：把最新 issue 状态/评论数同步回 thoughts 列表（按 identifier 定位） */
  const syncFromDetail = useCallback(
    (
      identifier: string,
      patch: {
        issueStatus?: string;
        commentCount?: number;
        lastSyncedAt?: number;
        lastSeenCommentCount?: number;
      },
    ) => {
      setThoughts((prev) => {
        const next = prev.map((x) =>
          x.issueIdentifier === identifier ? { ...x, ...patch } : x,
        );
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  // 引用稳定的 onBack / onSync · 防止 DetailScreen useEffect([onBack]) 每帧重跑
  const detailOnBack = useCallback(() => setViewingIdentifier(null), []);
  const viewingIdentifierRef = useRef<string | null>(null);
  useEffect(() => {
    viewingIdentifierRef.current = viewingIdentifier;
  }, [viewingIdentifier]);
  const detailOnSync = useCallback(
    (patch: {
      issueStatus?: string;
      commentCount?: number;
      lastSyncedAt?: number;
      lastSeenCommentCount?: number;
    }) => {
      const id = viewingIdentifierRef.current;
      if (id) syncFromDetail(id, patch);
    },
    [syncFromDetail],
  );

  // 单例 client，只有真凭据字段变化时才重建。否则 DetailScreen 每次父 render 拿到
  // 新 client 引用 → fetchAll deps 变 → 死循环 setInterval refetch（用户报"明细页抖动"）。
  const multicaClient = useMemo<MulticaClient | null>(() => {
    if (!isMulticaConfigured(cfg) || !cfg) return null;
    return new MulticaClient({
      serverUrl: cfg.multicaServerUrl,
      token: cfg.multicaToken,
      workspaceId: cfg.multicaWorkspaceId,
      defaultAssigneeId: cfg.multicaDefaultAssigneeId || undefined,
      defaultAssigneeType: cfg.multicaDefaultAssigneeType,
    });
  }, [
    cfg?.multicaServerUrl,
    cfg?.multicaToken,
    cfg?.multicaWorkspaceId,
    cfg?.multicaDefaultAssigneeId,
    cfg?.multicaDefaultAssigneeType,
  ]);

  // SWO-371 · 首页 focus 刷新 issue 列表：
  // mount 时 + AppState active 时 + 从详情/设置页返回主屏时 调 API 静默更新
  const refreshIssuesFromApi = useCallback(async () => {
    const client = multicaClient;
    if (!client) return;
    try {
      const issues = await client.listIssues();
      setThoughts((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (!t.issueId && !t.issueIdentifier) return t;
          const match = issues.find(
            (i) => i.id === t.issueId || i.identifier === t.issueIdentifier,
          );
          if (!match) return t;
          if (match.status !== t.issueStatus) {
            changed = true;
            return { ...t, issueStatus: match.status, lastSyncedAt: Date.now() };
          }
          return t;
        });
        if (changed) {
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        }
        return changed ? next : prev;
      });
    } catch {
      // 静默失败，不阻塞用户
    }
  }, [multicaClient]);

  // mount 时刷新一次
  useEffect(() => {
    refreshIssuesFromApi();
  }, [refreshIssuesFromApi]);

  // AppState: 从后台回前台时刷新
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIssuesFromApi();
    });
    return () => sub.remove();
  }, [refreshIssuesFromApi]);

  // 从详情页/设置页返回主屏时刷新（viewingIdentifier/viewingSettings 回 null/false）
  const prevViewingRef = useRef(false);
  useEffect(() => {
    const isViewing = !!(viewingIdentifier || viewingSettings || viewingLab);
    if (prevViewingRef.current && !isViewing) {
      refreshIssuesFromApi();
    }
    prevViewingRef.current = isViewing;
  }, [viewingIdentifier, viewingSettings, viewingLab, refreshIssuesFromApi]);

  const sendToMultica = async (t: Thought) => {
    const client = multicaClient;
    if (!client) {
      Alert.alert(
        '未配置',
        '请打开右上角 ⚙️ 设置页，填好 multica 服务器地址、token、workspace ID。',
      );
      return;
    }
    if (!t.text?.trim()) {
      Alert.alert('提示', '这条想法没有文字，无法创建 issue');
      return;
    }
    // 先把卡片切到 sending 态，让用户有反馈
    const mark = (patch: Partial<Thought>) =>
      persist(thoughts.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await mark({ sendStatus: 'sending', sendError: undefined });
    try {
      const issue = await client.createIssue({
        title: deriveIssueTitle(t.text),
        description: [
          t.text,
          '',
          `— 录制于 ${new Date(t.createdAt).toLocaleString('zh-CN')}`,
          `— 时长 ${formatDuration(t.durationMs)}`,
          t.audioUri ? `— 本地音频: ${t.audioUri}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      });
      await mark({
        sendStatus: 'sent',
        issueIdentifier: issue.identifier,
        issueId: issue.id,
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      await mark({ sendStatus: 'failed', sendError: msg });
      Alert.alert('发送失败', msg);
    }
  };

  // 详情页分支 · state 驱动的视图切换（避免引入 @react-navigation 重依赖）
  if (viewingIdentifier) {
    const thought = thoughts.find(
      (t) => t.issueIdentifier === viewingIdentifier,
    );
    if (multicaClient) {
      return (
        <>
          <DetailScreen
            identifier={viewingIdentifier}
            thought={thought}
            client={multicaClient}
            onBack={detailOnBack}
            onSync={detailOnSync}
          />
          <StatusBar style="dark" />
        </>
      );
    }
    // client 未配置 → 退回主屏
    setViewingIdentifier(null);
  }

  // Her Lab · dev-only 视觉组件库（长按主屏标题进入）
  if (viewingLab) {
    return (
      <>
        <HerLabScreen onBack={() => setViewingLab(false)} />
        <StatusBar style="dark" />
      </>
    );
  }

  // 设置页 · 主屏右上角 ⚙️ 入口（讯飞 / multica / 默认指派 配置）
  if (viewingSettings) {
    return (
      <>
        <SettingsScreen onBack={() => setViewingSettings(false)} />
        <StatusBar style="dark" />
      </>
    );
  }

  // issue · 按 v2 设计稿（docs/her/v2-musing-her.html i.home 区）首页布局重做
  // 顶部 home-header 叙事 / 中部 thought-card 列表 / 底部 compose bar
  const reviewCount = thoughts.filter((t) => t.issueStatus === 'in_review').length;
  const doneCount = thoughts.filter((t) => t.issueStatus === 'done').length;
  const totalCount = thoughts.length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Her 视觉底座 · ScreenBg 整屏 radial + BreathGlow 居中呼吸光球 */}
      <ScreenBg />
      <BreathGlow size={280} top="22%" />

        {/* 主屏右上角 ⚙️ 设置入口 · OS1 LED breathing dot = 必配项缺失 */}
        <Pressable
          style={styles.settingsBtn}
          onPress={() => setViewingSettings(true)}
          accessibilityRole="button"
          accessibilityLabel="设置"
        >
          <Text style={styles.settingsBtnIcon}>⚙</Text>
          {cfg && (!isMulticaConfigured(cfg) || !isIflytekConfigured(cfg)) ? (
            <SettingsLedDot />
          ) : null}
        </Pressable>

        {/* D1 + D2 · home-header（spec line 244-249, 337-341） */}
        <View style={styles.homeHeader}>
          <Text style={styles.greeting}>good evening, theodore</Text>
          <Text
            style={styles.h1}
            onLongPress={
              HER_LAB_ENABLED ? () => setViewingLab(true) : undefined
            }
            suppressHighlighting
          >
            你今天{'\n'}
            {totalCount > 0 ? (
              <>
                留下了{' '}
                <Text style={styles.h1Em}>{totalCount} 个想法</Text>。
              </>
            ) : (
              <Text style={styles.h1Em}>还没留下想法</Text>
            )}
          </Text>
          {reviewCount > 0 || doneCount > 0 ? (
            <View style={styles.metaRow}>
              {reviewCount > 0 ? (
                <View style={styles.metaItem}>
                  <View
                    style={[styles.metaDot, { backgroundColor: COLORS.accent }]}
                  />
                  <Text style={styles.metaText}>{reviewCount} in review</Text>
                </View>
              ) : null}
              {doneCount > 0 ? (
                <View style={styles.metaItem}>
                  <View
                    style={[styles.metaDot, { backgroundColor: COLORS.success }]}
                  />
                  <Text style={styles.metaText}>{doneCount} done</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* D4 · 删 listHeader · 直接 thought-list（spec line 251-258） */}
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={thoughts}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text style={styles.empty}>
              今天还没留下想法。{'\n'}按下面那颗球说一个。
            </Text>
          }
          renderItem={({ item }) => {
            const canOpen =
              item.sendStatus === 'sent' && !!item.issueIdentifier;
            const hasUnread =
              (item.commentCount ?? 0) > (item.lastSeenCommentCount ?? 0);
            const pillMeta = item.issueStatus
              ? pillFromStatus(item.issueStatus)
              : item.sendStatus === 'sent'
                ? { variant: 'done' as PillVariant, label: '已发送' }
                : null;
            const isPolaroid = item.issueStatus === 'done';
            const preview = derivePreview(item, hasUnread);

            const onCardPress = () => {
              if (canOpen) {
                setViewingIdentifier(item.issueIdentifier!);
              } else if (item.sendStatus === 'sending') {
                // 发送中 no-op
              } else {
                sendToMultica(item);
              }
            };
            const onCardLongPress = () => {
              Alert.alert(
                '删除这条想法？',
                item.text?.slice(0, 40) ?? '',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '删除',
                    style: 'destructive',
                    onPress: () => remove(item.id),
                  },
                ],
              );
            };

            const inner = (
              <View
                style={[
                  styles.cardSpec,
                  isPolaroid && styles.cardSpecPolaroidInner,
                ]}
              >
                <View style={styles.cardSpecHead}>
                  <Text style={styles.cardSpecId}>
                    {item.issueIdentifier ??
                      (item.sendStatus === 'failed'
                        ? '— 待重试'
                        : '— 待发送')}
                  </Text>
                  {pillMeta ? (
                    <CardStatusPill
                      variant={pillMeta.variant}
                      label={pillMeta.label}
                    />
                  ) : null}
                </View>
                <Text style={styles.cardSpecBody} numberOfLines={3}>
                  {`"${item.text || '（无文字）'}"`}
                </Text>
                <View style={styles.cardSpecFooter}>
                  <Text
                    style={[
                      styles.cardSpecPreview,
                      hasUnread && styles.cardSpecPreviewUnread,
                    ]}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                  <Text style={styles.cardSpecTime}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
              </View>
            );

            // D8 · done 卡升级 polaroid + 蜡封 M（PolaroidCard 自带 wax）
            return isPolaroid ? (
              <TouchableOpacity
                onPress={onCardPress}
                onLongPress={onCardLongPress}
                activeOpacity={0.85}
                style={styles.cardPolaroidWrap}
              >
                <PolaroidCard wax="M">{inner}</PolaroidCard>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={onCardPress}
                onLongPress={onCardLongPress}
                activeOpacity={0.6}
              >
                {inner}
              </TouchableOpacity>
            );
          }}
        />

        {/* issue · 首页 compose bar 对齐详情页：真 TextInput + 4 态右键
         *  状态机（拍按钮）：
         *    idle (draft empty, !recording)        → EarpieceMic · tap = startVoice
         *    recording                              → EarpieceMic + RippleAura · tap = voice.stop
         *    has draft (typed or post-transcription) → ➤ send · tap = submit
         *    sending                                → ActivityIndicator
         *  录音中 liveText 实时长在输入框里（详情页同款），不再用独立 overlay */}
        <View style={[styles.composeBar, { marginBottom: kbOffset }]}>
          <TextInput
            ref={inputRef}
            style={styles.composeInputPill}
            value={draft}
            onChangeText={setDraft}
            placeholder="说点什么……"
            placeholderTextColor={COLORS.mauve}
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

      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

/** issue · 卡片 footer 单行 preview · 替代旧的 actions 横排
 *  spec: `agent: <一句话进度>`（warm-gray italic）
 */
function derivePreview(t: Thought, hasUnread: boolean): string {
  if (hasUnread) return '💬 Musing 刚回复了';
  if (t.sendStatus === 'sending') return 'agent: 发送中…';
  if (t.sendStatus === 'failed') return 'agent: 发送失败 · 点击重试 / 长按删';
  if (t.sendStatus === 'sent') {
    switch (t.issueStatus) {
      case 'in_progress':
        return 'agent: 处理中 · 等会儿回来看';
      case 'in_review':
        return 'agent: 等你拍板 · 点开看回复';
      case 'done':
        return 'agent: 已闭环 · 点开归档';
      case 'cancelled':
        return 'agent: 已取消';
      case 'todo':
      case 'backlog':
        return 'agent: 已接单 · 排队中';
      default:
        return 'agent: 已接单 · 点开看回复';
    }
  }
  return '点击交给 Musing · 长按删除';
}

// COLORS / FONT_* 统一抽到 src/theme.ts（DetailScreen 共享，防止值漂移）

/**
 * SettingsLedDot · OS1 LED 呼吸点，挂在齿轮按钮右上角
 * 必配项缺失时显示。3.5s ease-in-out 慢呼吸（opacity 0.55↔1）。
 * 视觉对齐 docs/her/v2-musing-her.html `.os1-led-btn .led`，但更小（9px）。
 */
function SettingsLedDot() {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 1750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.settingsBtnLed, { opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingTop: Platform.OS === 'android' ? 32 : 0,
  },

  // ─── 主屏 ⚙️ 设置入口 ── v2: cream-w 底 + 暖珊瑚 shadow + 40px ──
  settingsBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 50 : 12,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 20,
    // coral-tinted soft shadow
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 2,
  },
  settingsBtnIcon: {
    fontSize: 19,
    color: COLORS.ink,
    lineHeight: 22,
  },
  // OS1 LED breathing dot · v2 callout · 03 ·  3.5s 呼吸 + 双层 box-shadow 玻璃罩光感
  settingsBtnLed: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 2,
    borderColor: COLORS.bgSub,
  },

  // ─── D1 + D2 · home-header ──────────────────────────────
  // 对齐 spec docs/her/v2-musing-her.html:244-249, 337-341
  homeHeader: {
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 14,
    zIndex: 5,
  },
  greeting: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    color: COLORS.accentHi, // burnt
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  h1: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 30,
    lineHeight: 36,
    color: COLORS.ink, // charcoal
    letterSpacing: -0.15,
  },
  h1Em: {
    fontStyle: 'italic',
    color: COLORS.accent, // coral
    fontWeight: '600',
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 18,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: 11.5,
    color: COLORS.mauve,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },

  // ─── 列表（删 listHeader · 直接 list） ──────────────────
  list: { flex: 1, zIndex: 5 },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
  },
  empty: {
    textAlign: 'center',
    color: COLORS.inkMute,
    marginTop: 64,
    fontSize: 14,
    lineHeight: 24,
    fontFamily: FONT_CN,
  },

  // ─── D5-D7 · thought-card spec 三件套 ────────────────────
  // 对齐 spec line 252-258
  cardSpec: {
    backgroundColor: COLORS.bgSub,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(224,213,194,0.7)',
    gap: 6,
    // shadow-soft（spec --shadow-soft 近似）
    shadowColor: '#9B5A28',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 2,
  },
  // D8 · done 卡升级 polaroid · PolaroidCard 已自带 bg/border/padding/wax，
  // inner cardSpec 卸掉重复装饰（让外层 polaroid 视觉占主导）
  cardSpecPolaroidInner: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardSpecHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSpecId: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 11.5,
    color: COLORS.accentHi, // burnt
    letterSpacing: 0.5,
  },
  cardSpecBody: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 14.5,
    lineHeight: 22.5,
    color: COLORS.ink,
  },
  cardSpecFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  cardSpecPreview: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 11,
    color: COLORS.inkSub, // warm-gray
    flex: 1,
    marginRight: 10,
  },
  cardSpecPreviewUnread: {
    color: COLORS.accent,
  },
  cardSpecTime: {
    fontSize: 11,
    color: COLORS.mauve,
    fontVariant: ['tabular-nums'],
  },
  cardPolaroidWrap: {
    paddingVertical: 4,
  },

  // ─── D3 + D10 · 底部 compose bar ─────────────────────────
  // 对齐 spec line 220-237, 361-364
  // Sprint 3.21 · issue · 对齐详情页 composeBar 姿势：
  //   bg transparent + 删 borderTop，让 ScreenBg + BreathGlow 透出来融为一体，
  //   不画硬线、不画 cream 切色（spec 原本是 linear-gradient 透明过渡，
  //   sprint 3.20 迁底部时简化为半透明 cream 留下"蒙了一层"的视觉违和）。
  composeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    backgroundColor: 'transparent',
    zIndex: 6,
  },
  // issue · 对齐详情页 composeInputPill：真 TextInput · cream-w pill · italic Source Serif
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 0,
  },
  composeMicBtn: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
  // 录音中 mic + ripple 同心叠层
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
  // draft 非空时的 ➤ 发送箭头（替换 mic 球）
  composeSendArrow: {
    fontSize: 22,
    color: COLORS.accent,
    fontWeight: '600',
  },

  // ─── 主屏 Pill（CardStatusPill 用，保留） ──────────────
  cardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
    gap: 5,
  },
  cardPillDot: { width: 5, height: 5, borderRadius: 2.5 },
  cardPillText: {
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});

/**
 * 主屏卡片用的静态 Pill（不 pulse）
 * 动画版本在 DetailScreen 里（doing 态会 pulse）
 */
function CardStatusPill({
  variant,
  label,
}: {
  variant: PillVariant;
  label: string;
}) {
  const c = pillColors(variant);
  return (
    <View
      style={[
        styles.cardPill,
        {
          backgroundColor: c.bg,
          borderColor: c.border ?? 'transparent',
          borderWidth: c.border ? 1 : 0,
        },
      ]}
    >
      <View style={[styles.cardPillDot, { backgroundColor: c.fg }]} />
      <Text style={[styles.cardPillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}
