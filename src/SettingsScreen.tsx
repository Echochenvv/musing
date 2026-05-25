/**
 * Musing Settings · runtime credential configuration.
 *
 * Lets the user paste / edit:
 *   - iFlytek IAT (APPID + API KEY + API SECRET)
 *   - Multica tracker (server URL + token + workspace ID)
 *   - Default assignee (id + type)
 *
 * Saved values land in SecureStore (secrets) / AsyncStorage (the rest); see
 * src/config.ts for the storage strategy.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AssigneeType,
  EMPTY_CONFIG,
  MusingConfig,
  clearAllConfig,
  ensureConfig,
  isIflytekConfigured,
  isMulticaConfigured,
  saveConfig,
} from './config';
import { COLORS, FONT_CN, FONT_SERIF_BOLD } from './theme';
import { buildAuthUrl } from './iflytek-iat';
import { BlindsLight } from './components/her/BlindsLight';
import { WaxSeal } from './components/her/WaxSeal';

type Props = {
  onBack: () => void;
};

type FieldKey = keyof MusingConfig;

type FieldDef = {
  key: FieldKey;
  label: string;
  hint?: string;
  secret?: boolean;
  placeholder?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
};

const IFLYTEK_FIELDS: FieldDef[] = [
  {
    key: 'iflytekAppid',
    label: 'APPID',
    hint: '讯飞控制台「实时语音转写」应用 APPID',
    placeholder: '8 位字母数字',
  },
  {
    key: 'iflytekApiKey',
    label: 'API Key',
    secret: true,
    placeholder: '32 位字母数字',
  },
  {
    key: 'iflytekApiSecret',
    label: 'API Secret',
    secret: true,
    placeholder: 'base64 长串',
  },
];

const MULTICA_FIELDS: FieldDef[] = [
  {
    key: 'multicaServerUrl',
    label: '服务器地址',
    hint: '完整 URL，例如 https://your-multica-server.example.com',
    placeholder: 'https://...',
  },
  {
    key: 'multicaToken',
    label: 'Token',
    secret: true,
    hint: 'Bearer token，通常以 mul_ 开头',
    placeholder: 'mul_xxxxxxxxxxxx',
  },
  {
    key: 'multicaWorkspaceId',
    label: 'Workspace ID',
    hint: 'multica workspace 的 UUID',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
];

const ASSIGNEE_FIELDS: FieldDef[] = [
  {
    key: 'multicaDefaultAssigneeId',
    label: 'Assignee ID',
    hint: '新提交的想法默认指派给的 agent 或 member 的 UUID',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
];

export function SettingsScreen({ onBack }: Props) {
  const [draft, setDraft] = useState<MusingConfig>(EMPTY_CONFIG);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let mounted = true;
    ensureConfig().then((c) => {
      if (mounted) {
        setDraft(c);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Android 系统手势返回 / BACK 键 → 回主屏
  // （Android 10+ 边缘 swipe 默认走 BACK keycode；不接管的话 RN app 会被关）
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  const update = <K extends FieldKey>(key: K, value: MusingConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveConfig({
        ...draft,
        // trim incidental whitespace on every text field; user paste often has trailing space
        iflytekAppid: draft.iflytekAppid.trim(),
        iflytekApiKey: draft.iflytekApiKey.trim(),
        iflytekApiSecret: draft.iflytekApiSecret.trim(),
        multicaServerUrl: draft.multicaServerUrl.trim().replace(/\/$/, ''),
        multicaToken: draft.multicaToken.trim(),
        multicaWorkspaceId: draft.multicaWorkspaceId.trim(),
        multicaDefaultAssigneeId: draft.multicaDefaultAssigneeId.trim(),
      });
      Alert.alert('已保存', '配置已写入加密保险柜与本地存储。');
    } catch (e: any) {
      Alert.alert('保存失败', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const onClear = () => {
    Alert.alert(
      '清空全部配置？',
      '会同时擦掉加密保险柜和本地存储里的内容。下次启动会回退到 .env 兜底（如果有的话）。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清空',
          style: 'destructive',
          onPress: async () => {
            try {
              const cleared = await clearAllConfig();
              setDraft(cleared);
            } catch (e: any) {
              Alert.alert('清空失败', String(e?.message ?? e));
            }
          },
        },
      ],
    );
  };

  const onTest = async () => {
    setTesting(true);
    const lines: string[] = [];

    // 讯飞：开真 WebSocket 连一次。onopen = 凭据有效；onerror = 签名错；3s 超时 = 网络问题。
    // （旧版用 GET 探 wss endpoint，HTTP 400 是 WebSocket-only 端点拒 GET 的预期行为，
    //   不是失败也不是成功，所以改成开真 WS 拿 onopen / onerror。）
    if (isIflytekConfigured(draft)) {
      try {
        const wsUrl = buildAuthUrl(
          draft.iflytekApiKey.trim(),
          draft.iflytekApiSecret.trim(),
        );
        const verdict: { ok: boolean; reason: string } = await new Promise(
          (resolve) => {
            const ws = new WebSocket(wsUrl);
            const timer = setTimeout(() => {
              try { ws.close(); } catch { /* ignore */ }
              resolve({ ok: false, reason: '握手超时（3s）— 网络或服务不可达' });
            }, 3000);
            ws.onopen = () => {
              clearTimeout(timer);
              try { ws.close(); } catch { /* ignore */ }
              resolve({ ok: true, reason: '握手成功 · API Key / Secret 有效' });
            };
            ws.onerror = () => {
              clearTimeout(timer);
              resolve({
                ok: false,
                reason: '握手失败 · API Key / Secret / 签名 不对',
              });
            };
            // 正常情况下 onopen 之后我们主动 close → 触发 onclose，无需特别处理
          },
        );
        lines.push((verdict.ok ? '✅' : '❌') + ' 讯飞：' + verdict.reason);
      } catch (e: any) {
        lines.push('❌ 讯飞：异常 — ' + String(e?.message ?? e));
      }
    } else {
      lines.push('⚠️ 讯飞：APPID / API Key / API Secret 三项必须都填');
    }

    // multica：拉一条 issue
    if (isMulticaConfigured(draft)) {
      try {
        const url =
          draft.multicaServerUrl.trim().replace(/\/$/, '') +
          '/api/issues?limit=1';
        const r = await fetch(url, {
          headers: {
            Authorization: `Bearer ${draft.multicaToken.trim()}`,
            'X-Workspace-Id': draft.multicaWorkspaceId.trim(),
          },
        });
        if (r.ok) {
          lines.push('✅ Multica：服务器 + token + workspace 都对（HTTP 200）');
        } else if (r.status === 401 || r.status === 403) {
          lines.push('❌ Multica：token 或 workspace ID 不对（HTTP ' + r.status + '）');
        } else {
          lines.push('⚠️ Multica：HTTP ' + r.status + '（服务器返回非 200）');
        }
      } catch (e: any) {
        lines.push('❌ Multica：网络错误 — ' + String(e?.message ?? e));
      }
    } else {
      lines.push('⚠️ Multica：服务器地址 / Token / Workspace ID 三项必须都填');
    }

    setTesting(false);
    Alert.alert('测试结果', lines.join('\n\n'));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator color={COLORS.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Her 视觉底座 · 顶部木质百叶窗光（peach→cream radial × 横向 stripes 8% 透明）*/}
      <View pointerEvents="none" style={styles.blindsWrap}>
        <BlindsLight height={200} />
      </View>

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          <Text style={styles.titleEm}>设</Text>置
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Section
            titleEm="讯飞"
            title="IAT"
            subtitle="语音转写。去 xfyun.cn 创建实时语音转写应用，复制 APPID / API Key / API Secret。"
            done={isIflytekConfigured(draft)}
          >
            {IFLYTEK_FIELDS.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={String(draft[f.key] ?? '')}
                onChange={(v) => update(f.key, v as any)}
                revealed={!!revealed[f.key]}
                onToggleReveal={() =>
                  setRevealed((r) => ({ ...r, [f.key]: !r[f.key] }))
                }
              />
            ))}
          </Section>

          <Section
            titleEm="Multica"
            title=""
            subtitle="issue 跟踪后端。提交想法时通过这套凭据创建 issue。"
            done={isMulticaConfigured(draft)}
          >
            {MULTICA_FIELDS.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={String(draft[f.key] ?? '')}
                onChange={(v) => update(f.key, v as any)}
                revealed={!!revealed[f.key]}
                onToggleReveal={() =>
                  setRevealed((r) => ({ ...r, [f.key]: !r[f.key] }))
                }
              />
            ))}
          </Section>

          <Section titleEm="默认" title="指派" done>
            <View style={styles.segmented}>
              {(['agent', 'member'] as AssigneeType[]).map((t) => {
                const active = draft.multicaDefaultAssigneeType === t;
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.segItem,
                      active && styles.segItemActive,
                    ]}
                    onPress={() => update('multicaDefaultAssigneeType', t)}
                  >
                    <Text
                      style={[
                        styles.segItemText,
                        active && styles.segItemTextActive,
                      ]}
                    >
                      {t === 'agent' ? 'Agent' : 'Member'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {ASSIGNEE_FIELDS.map((f) => (
              <Field
                key={f.key}
                def={f}
                value={String(draft[f.key] ?? '')}
                onChange={(v) => update(f.key, v as any)}
                revealed
                onToggleReveal={() => {}}
              />
            ))}
          </Section>

          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={onTest}
              disabled={testing}
            >
              <Text style={styles.btnSecondaryText}>
                {testing ? '测试中…' : '测试连接'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={styles.btnPrimaryText}>
                {saving ? '保存中…' : '保存'}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.clearLink} onPress={onClear}>
            <Text style={styles.clearLinkText}>全部清空</Text>
          </Pressable>

          <Text style={styles.footer}>
            敏感字段（API Key / Secret / Token）保存到 iOS Keychain / Android
            Keystore（系统级加密）；其它字段保存到 AsyncStorage（本地未加密）。
            没填的字段会回退到 .env 里的值。
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  titleEm,
  subtitle,
  done,
  sealLetter = '✓',
  children,
}: {
  /** 标题非斜体部分 */
  title: string;
  /** 标题前 italic em（如「讯飞」、「Multica」、「默认」），可选 */
  titleEm?: string;
  subtitle?: string;
  done?: boolean;
  /** 蜡封中心字符，已配置时显示。默认 ✓ */
  sealLetter?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {/* 信纸右上角微撕角痕迹（design v2 callout · 02）*/}
      <View pointerEvents="none" style={styles.tearCorner} />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {titleEm ? (
            <Text style={styles.sectionTitleEm}>{titleEm}</Text>
          ) : null}
          {titleEm ? ' · ' : ''}
          {title}
        </Text>
        {/* 已配置 = 红蜡封 + sealLetter；未配置 = 灰蜡未印 mauve circle */}
        {done ? (
          <WaxSeal size="small" letter={sealLetter} />
        ) : (
          <View style={styles.unsealedWax}>
            <Text style={styles.unsealedWaxText}>?</Text>
          </View>
        )}
      </View>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Field({
  def,
  value,
  onChange,
  revealed,
  onToggleReveal,
}: {
  def: FieldDef;
  value: string;
  onChange: (next: string) => void;
  revealed: boolean;
  onToggleReveal: () => void;
}) {
  const filled = !!value;
  const masked = def.secret && !revealed;

  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{def.label}</Text>
        <View
          style={[
            styles.statusDotSm,
            { backgroundColor: filled ? COLORS.success : COLORS.inkMute },
          ]}
        />
      </View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={def.placeholder}
          placeholderTextColor={COLORS.inkMute}
          secureTextEntry={masked}
          autoCapitalize={def.autoCapitalize ?? 'none'}
          autoCorrect={false}
          autoComplete="off"
          keyboardType={def.secret ? 'visible-password' : 'default'}
        />
        {def.secret ? (
          <Pressable style={styles.eye} onPress={onToggleReveal} hitSlop={8}>
            <Text style={styles.eyeText}>{revealed ? '隐藏' : '显示'}</Text>
          </Pressable>
        ) : null}
      </View>
      {def.hint ? <Text style={styles.fieldHint}>{def.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  // Her 视觉底座 · 顶部 200px 木质百叶窗光（v2 callout · 04）
  blindsWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    zIndex: 1,
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    zIndex: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.ink,
  },
  title: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 19,
    color: COLORS.ink,
    letterSpacing: 0.2,
  },
  // 标题首字 italic em（"设" 用斜体强调）
  titleEm: {
    fontStyle: 'italic',
    color: COLORS.accentHi,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 22,
    paddingBottom: 60,
  },
  // 信纸 section · v2 改：paper 暖底（代替 bgSub 灰）+ 24px 圆角 + 暖米边
  section: {
    backgroundColor: COLORS.paper,
    borderRadius: 24,
    padding: 22,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    // coral-tinted shadow · v2 callout · 07
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 14,
    elevation: 2,
    position: 'relative',
  },
  // 信纸右上角微撕角痕迹
  tearCorner: {
    position: 'absolute',
    top: 0,
    right: 24,
    width: 16,
    height: 12,
    backgroundColor: COLORS.bg,
    opacity: 0.5,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    transform: [{ rotate: '-12deg' }],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 17,
    color: COLORS.ink,
  },
  // 段标题 italic em ("讯飞" / "Multica" / "默认")
  sectionTitleEm: {
    fontStyle: 'italic',
    color: COLORS.accentHi,
  },
  // 灰蜡未印（unsealed）· 24px 圆，mauve 渐变近似，中央 ?
  unsealedWax: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.mauve,
    opacity: 0.55,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  unsealedWaxText: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.bgSub,
    lineHeight: 24,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkSub,
    lineHeight: 19,
    marginBottom: 14,
  },
  // 字段标签旁的小状态点（filled = green / empty = mauve）· v2 保留 6px dot 不堆 wax
  statusDotSm: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  fieldLabel: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkSub,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSub,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 14,
    color: COLORS.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eye: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eyeText: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.accent,
  },
  fieldHint: {
    fontFamily: FONT_CN,
    fontSize: 11,
    color: COLORS.inkMute,
    marginTop: 4,
    lineHeight: 16,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgSub,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    marginBottom: 14,
  },
  segItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  // active 加 coral 阴影 · 与 pill 按钮统一暖色调
  segItemActive: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 2,
  },
  segItemText: {
    fontFamily: FONT_CN,
    fontSize: 13,
    color: COLORS.inkSub,
  },
  segItemTextActive: {
    color: COLORS.bg,
    fontWeight: '600',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
  },
  // pill 999 · v2 callout · 07
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // coral-tinted shadow · v2 callout · 07
  btnPrimary: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 4,
  },
  btnPrimaryText: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.bgSub,
    letterSpacing: 0.3,
  },
  btnSecondary: {
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 1,
  },
  btnSecondaryText: {
    fontFamily: FONT_SERIF_BOLD,
    fontWeight: '600',
    fontSize: 15,
    color: COLORS.ink,
    letterSpacing: 0.3,
  },
  // 「全部清空」 · italic 弱化避免误点
  clearLink: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  clearLinkText: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    color: COLORS.danger,
    opacity: 0.85,
    letterSpacing: 0.4,
  },
  // 底部说明 italic
  footer: {
    fontFamily: FONT_CN,
    fontStyle: 'italic',
    fontSize: 11,
    color: COLORS.inkMute,
    lineHeight: 19,
    marginTop: 14,
  },
});
