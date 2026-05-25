/**
 * HerLabScreen · dev-only Storybook 式真机自验屏
 *
 * Sprint 2 owner 提醒（DEV-PLAN §5.2）：
 *   每个 her 组件独立 PR + 配 demo screen，便于 review 和真机自验。
 *
 * 进入方式：主屏长按标题"Musing"，gate 在 __DEV__ 或 EXPO_PUBLIC_HER_LAB=1。
 * 不会污染生产用户路径——release 包未设环境变量时长按无效。
 *
 * 每个组件 section：标题 + spec 一行 + 真机渲染区。
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlindsLight } from './components/her/BlindsLight';
import { BreathGlow } from './components/her/BreathGlow';
import { EarpieceMic } from './components/her/EarpieceMic';
import { OS1LedButton } from './components/her/OS1LedButton';
import { PolaroidCard } from './components/her/PolaroidCard';
import { RippleAura } from './components/her/RippleAura';
import { SineBand } from './components/her/SineBand';
import { LetterPaper } from './components/her/LetterPaper';
import { VoiceEnvelope, VoiceEnvelopeCard } from './components/her/VoiceEnvelope';
import { VoiceSignature } from './components/her/VoiceSignature';
import { WaxSeal } from './components/her/WaxSeal';
import { AskCard } from './cards/AskCard';
import { DoneCard } from './cards/DoneCard';
import { ProgressCard } from './cards/ProgressCard';
import { ProposeCard } from './cards/ProposeCard';
import type { UIBlock } from './uiBlock';

const SPRINT3_PROPOSE_MOCK: UIBlock = {
  intent: 'propose',
  title: '协议对比完成 · 待选模型',
  recommended: 'A',
  options: [
    { id: 'A', desc: '延迟优先（91% 准确）' },
    { id: 'B', desc: '折中（95% 准确，模型 4GB）' },
    { id: 'C', desc: '准确率优先（97% 准确，模型 9GB）' },
  ],
  hint: 'benchmark 时段会影响结果',
};

const SPRINT3_ASK_MOCK: UIBlock = {
  intent: 'ask',
  title: '要继续追问，还是收口？',
  recommended: 'A',
  options: [
    { id: 'A', desc: '把这个想法整理成 PRD 草稿' },
    { id: 'B', desc: '换个角度再聊聊' },
    { id: 'C', desc: '就到这，存为 done' },
  ],
  hint: '我会按你选的继续往下做',
};

const SPRINT3_PROGRESS_MOCK: UIBlock = {
  intent: 'progress',
  title: '正在生成 PRD 草稿',
  stepIndex: 2,
  totalSteps: 4,
  currentStep: '正在写 §3 用户场景与流程',
  steps: [
    { state: 'done', label: '解析录音转写' },
    { state: 'done', label: '抽取核心诉求' },
    { state: 'now', label: '生成 PRD 大纲' },
    { state: 'todo', label: '写完整文档 + 推飞书' },
  ],
  hint: '通常 2-3 分钟',
};

const SPRINT3_DONE_MOCK: UIBlock = {
  intent: 'done',
  title: '草稿已生成 · 推到飞书了',
  summary: [
    { icon: '📄', label: '飞书 PRD', value: '[草稿 v3](https://feishu/...)' },
    { icon: '⏱', label: '耗时', value: '2 min 38s' },
    { icon: '📐', label: '字数', value: '1,840 字 · 6 章节' },
  ],
  nextSuggestions: ['继续追问', '让 reviewer 看看', '再来一个想法'],
  hint: '点 chip 继续，或长按 ORIGIN 回放',
};
import { COLORS, FONT_CN, FONT_SERIF_BOLD } from './theme';

type Props = {
  onBack: () => void;
};

type SectionProps = {
  name: string;
  spec: string;
  height?: number;
  children: React.ReactNode;
  /** 暗色卡底（黑底亮高光的组件用） */
  dark?: boolean;
};

function LabSection({ name, spec, height = 240, children, dark }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionName}>{name}</Text>
        <Text style={styles.sectionSpec}>{spec}</Text>
      </View>
      <View
        style={[
          styles.stage,
          { height },
          dark && { backgroundColor: '#2C2826' },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function HerLabScreen({ onBack }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.topbar}>
        <TouchableOpacity onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Her Lab</Text>
        <Text style={styles.sub}>视觉组件库 · 真机自验</Text>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Sprint 1 已交付 · 视觉底座 */}
        <Text style={styles.h2}>Sprint 1 · 视觉底座</Text>

        <LabSection
          name="BreathGlow"
          spec="5s 周期暖色呼吸光球 · opacity 0.45↔0.85 · scale 0.85↔1.10"
        >
          <BreathGlow size={180} top="50%" left="50%" />
          <Text style={styles.stageTip}>录音键下方背景层 · pointerEvents=none</Text>
        </LabSection>

        <LabSection
          name="BlindsLight (默认 0.32 opacity)"
          spec="木质百叶窗光 · 横向 amber 斜光 3px on / 15px off · 200px 高"
          height={220}
        >
          <BlindsLight height={200} />
        </LabSection>

        <LabSection
          name="BlindsLight (intense 0.55 opacity)"
          spec="in_progress 状态强渲染"
          height={220}
        >
          <BlindsLight height={200} intense />
        </LabSection>

        {/* Sprint 2 · 逐个 PR 填入 */}
        <Text style={styles.h2}>Sprint 2 · her 物件 + 波纹</Text>

        <LabSection
          name="EarpieceMic (T1 · PR 2.1)"
          spec="耳钉金属球 mic · 50px · radial 光源 35%/30% · coral glow drop shadow"
          height={180}
        >
          <View style={styles.row}>
            <View style={styles.demoCell}>
              <EarpieceMic size={50} />
              <Text style={styles.cellLabel}>50px · 默认</Text>
            </View>
            <View style={styles.demoCell}>
              <EarpieceMic size={70} />
              <Text style={styles.cellLabel}>70px · 放大</Text>
            </View>
            <View style={styles.demoCell}>
              <EarpieceMic size={50} socket={false} />
              <Text style={styles.cellLabel}>无 socket</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="RippleAura (T2 · PR 2.2)"
          spec="录音 3 道错位同心圆 · coral/peach/amber 错位 0/0.8/1.6s · 2.4s ease-out 循环"
          height={260}
        >
          <View style={styles.row}>
            <View style={styles.demoCell}>
              <View style={styles.rippleStage}>
                <RippleAura size={50} />
                <EarpieceMic size={50} />
              </View>
              <Text style={styles.cellLabel}>active · 录音中</Text>
            </View>
            <View style={styles.demoCell}>
              <View style={styles.rippleStage}>
                <RippleAura size={50} active={false} />
                <EarpieceMic size={50} />
              </View>
              <Text style={styles.cellLabel}>active=false · 静默</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="OS1LedButton (T3 · PR 2.3)"
          spec="顶栏 LED 替换返回箭头 · 3s 慢呼吸 opacity 0.55↔1 / scale 0.9↔1.08 · LED radial #FFB07A→coral→burnt + coral 0.7α 外发光"
          height={150}
        >
          <View style={styles.row}>
            <View style={styles.demoCell}>
              <OS1LedButton onPress={() => {}} />
              <Text style={styles.cellLabel}>40px · 默认</Text>
            </View>
            <View style={styles.demoCell}>
              <OS1LedButton size={56} ledSize={14} onPress={() => {}} />
              <Text style={styles.cellLabel}>56px · 放大</Text>
            </View>
            <View style={styles.demoCell}>
              <OS1LedButton size={32} ledSize={8} onPress={() => {}} />
              <Text style={styles.cellLabel}>32px · 紧凑</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="SineBand (T4 · PR 2.4)"
          spec="agent typing 4 道叠加正弦缓动 · coral/peach/amber/rose · 周期 6/9/13/17s · l2/l4 反向"
          height={210}
        >
          <View style={styles.sineCell}>
            <SineBand active height={130} />
            <Text style={styles.cellLabel}>active · samantha is speaking…</Text>
          </View>
        </LabSection>

        <LabSection
          name="SineBand (静默对照)"
          spec="active=false · 4 道 path 静止显示 · 验明 spec 不闪现"
          height={210}
        >
          <View style={styles.sineCell}>
            <SineBand active={false} height={130} />
            <Text style={styles.cellLabel}>active=false · 静默</Text>
          </View>
        </LabSection>

        <LabSection
          name="VoiceEnvelope (T5 · PR 2.5 C 区)"
          spec="长按 ORIGIN 播放 · 上下双轨包络 + 6s coral 扫描层 + 2px playhead 跟随末端"
          height={140}
        >
          <View style={styles.sineCell}>
            <VoiceEnvelope active height={80} />
            <Text style={styles.cellLabel}>active · 6s 周期 linear infinite</Text>
          </View>
        </LabSection>

        <LabSection
          name="VoiceEnvelopeCard (T5 · 完整 C 区设计稿)"
          spec="quote + envelope + 时间标尺一体 · Sprint 3 接 Detail / DoneCard"
          height={220}
        >
          <View style={styles.sineCell}>
            <VoiceEnvelopeCard active />
          </View>
        </LabSection>

        <LabSection
          name="VoiceSignature (T5 · PR 2.5 E 区)"
          spec="DoneCard 闭环底部静态海拔 · plate 容器 + 蜡封 M 章 + 上下渐变（coral 0.85 → peach 0.65）"
          height={220}
        >
          <View style={styles.sineCell}>
            <VoiceSignature />
          </View>
        </LabSection>

        <LabSection
          name="WaxSeal (T6 · PR 2.6)"
          spec="红蜡封印章 · 三档 small 24 / large 42 / huge 60 · radial coral→deep red + dashed inner ring + drop shadow + -12° 旋"
          height={140}
        >
          <View style={styles.row}>
            <View style={styles.demoCell}>
              <WaxSeal size="small" />
              <Text style={styles.cellLabel}>small 24px</Text>
            </View>
            <View style={styles.demoCell}>
              <WaxSeal size="large" />
              <Text style={styles.cellLabel}>large 42px</Text>
            </View>
            <View style={styles.demoCell}>
              <WaxSeal size="huge" />
              <Text style={styles.cellLabel}>huge 60px M</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="LetterPaper (T6 · PR 2.6)"
          spec="信纸容器 · cream 上下渐变 + 27px 横线 + 左 34px coral margin line + 14px 圆角 + drop shadow"
          height={260}
        >
          <View style={styles.sineCell}>
            <LetterPaper>
              <Text style={[styles.cellLabel, { color: COLORS.ink, fontSize: 14, lineHeight: 27, marginLeft: 18 }]}>
                {'  beautiful handwritten letters · by musing\n\n  letter to Lucia · v3\n\n  字数 318 · 语气温柔克制\n  改动 删第二段 · 加一句关于雨'}
              </Text>
            </LetterPaper>
          </View>
        </LabSection>

        <LabSection
          name="LetterPaper + WaxSeal huge (T6 · DoneCard 预演)"
          spec="信纸 + 右上角悬挂 huge 蜡封 M · Sprint 3 DoneCard 蓝图"
          height={300}
        >
          <View style={[styles.sineCell, { position: 'relative' }]}>
            <LetterPaper>
              <Text style={[styles.cellLabel, { color: COLORS.ink, fontSize: 14, lineHeight: 27, marginLeft: 18 }]}>
                {'  ⊹ beautiful handwritten letters · by musing ⊹\n\n  letter to Lucia · v3\n\n  字数 318 字 · 2 段\n  语气 温柔 · 克制\n  用时 9 轮 · 24 分钟'}
              </Text>
            </LetterPaper>
            <View style={{ position: 'absolute', top: -6, right: 30, zIndex: 2 }}>
              <WaxSeal size="huge" />
            </View>
          </View>
        </LabSection>

        <Text style={styles.h2}>Sprint 3 · Card 套皮接入</Text>

        <LabSection
          name="ProposeCard (3.1 · 已套蜡封)"
          spec="recommended option 自带 small 蜡封 + 卡片右上角 small 蜡封 · 来源 src/cards/ProposeCard.tsx"
          height={300}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <ProposeCard block={SPRINT3_PROPOSE_MOCK} onPickOption={() => {}} />
          </View>
        </LabSection>

        <LabSection
          name="AskCard (3.2 · 头部 SineBand 装饰)"
          spec="卡片头部 prepend SineBand active=true height=44 + samantha is speaking blink · 来源 src/cards/AskCard.tsx"
          height={340}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <AskCard block={SPRINT3_ASK_MOCK} onPickOption={() => {}} />
          </View>
        </LabSection>

        <LabSection
          name="ProgressCard (3.3 · done step → WaxSeal small ✓)"
          spec="step.state==='done' marker 从纯色圆点改为 WaxSeal small letter='✓' · 录音 dot 套 RippleAura · 来源 src/cards/ProgressCard.tsx + DetailScreen voiceStatusBar"
          height={320}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <ProgressCard block={SPRINT3_PROGRESS_MOCK} />
          </View>
        </LabSection>

        <LabSection
          name="录音状态条 (3.3b · dot 套 RippleAura)"
          spec="DetailScreen voiceStatusBar 真实态 mock · 12px dot 后置 RippleAura active=true · 3 道 coral/peach/amber 涟漪"
          height={90}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <View style={styles.recordingBarMock}>
              <View style={styles.recordingDotWrap} pointerEvents="none">
                <View style={styles.recordingRippleStage}>
                  <RippleAura active={true} size={12} />
                </View>
                <View style={styles.recordingDot} />
              </View>
              <Text style={styles.recordingText}>正在录音 · 说点什么</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="DoneCard (3.4 · 信纸 + huge 蜡封 + 声纹三件套 · 灵魂卡)"
          spec="LetterPaper 容器 + 右上角 WaxSeal huge M + 底部 VoiceSignature · 来源 src/cards/DoneCard.tsx"
          height={520}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <DoneCard block={SPRINT3_DONE_MOCK} onPickOption={() => {}} />
          </View>
        </LabSection>

        <LabSection
          name="EarpieceMic 接入 (3.7 · 主屏 CTA + 录音态 RippleAura)"
          spec="主屏底部 record CTA 替换为 EarpieceMic 金属球 + socket halo · 录音态外层套 RippleAura 三道涟漪 · 来源 src/components/her/EarpieceMic.tsx"
          height={180}
        >
          <View style={styles.row}>
            <View style={styles.demoCell}>
              <EarpieceMic size={70} socket={true} />
              <Text style={styles.cellLabel}>idle · 70px</Text>
            </View>
            <View style={[styles.demoCell, { position: 'relative' }]}>
              <View style={{ position: 'absolute', width: 70, height: 70, alignItems: 'center', justifyContent: 'center', top: 5 }} pointerEvents="none">
                <RippleAura active={true} size={70} />
              </View>
              <EarpieceMic size={70} socket={true} />
              <Text style={styles.cellLabel}>recording · 涟漪</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="ORIGIN mini-env (3.7 · DetailScreen ORIGIN 区下方挂)"
          spec="14px coral play CTA + 60×18 svg 包络 + italic 0:14 · 长按播放 · 来源 DetailScreen OriginMiniEnv inline"
          height={130}
        >
          <View style={[styles.sineCell, { padding: 12 }]}>
            <View style={{ paddingVertical: 6, paddingHorizontal: 10, paddingLeft: 14, borderRadius: 14, backgroundColor: 'rgba(244,184,157,0.18)', borderWidth: 1, borderColor: 'rgba(232,90,79,0.18)', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 8, color: COLORS.bgSub, lineHeight: 10 }}>▶</Text>
              </View>
              <Text style={{ fontFamily: FONT_SERIF_BOLD, fontStyle: 'italic', fontSize: 10.5, color: COLORS.accentHi, letterSpacing: 0.4 }}>0:14 · 长按播放</Text>
            </View>
          </View>
        </LabSection>

        <LabSection
          name="PolaroidCard (3.6 · 主屏 done thought 拍立得 · 灵魂卡)"
          spec="cream 渐变 + 棕色顶部胶带条 (rotate -2°) + 右上角 small 蜡封 M + -1.2° 整体歪 + 双层阴影 · 来源 src/components/her/PolaroidCard.tsx"
          height={300}
        >
          <View style={[styles.sineCell, { padding: 24 }]}>
            <PolaroidCard wax="M">
              <View>
                <Text style={styles.polaroidMockMeta}>
                  09:41 · 0:14   ·   issue   ✓ 已闭环
                </Text>
                <Text style={styles.polaroidMockBody}>
                  "想给 Lucia 写封信，说说她生日那天的事"
                </Text>
                <Text style={styles.polaroidMockFooter}>
                  letter to Lucia · 318 字 · 昨日
                </Text>
              </View>
            </PolaroidCard>
          </View>
        </LabSection>

        <LabSection
          name="DetailScreen 顶栏 (3.5 · ← 替换为 OS1 LED)"
          spec="DetailScreen 实装态 · OS1LedButton 替代 ← 文本 · LED 慢呼吸 · 旁边 SWO 编号 + 时间 · 右侧 status pill"
          height={120}
        >
          <View style={[styles.sineCell, { padding: 4 }]}>
            <View style={styles.detailHeaderMock}>
              <OS1LedButton onPress={() => {}} />
              <View style={styles.detailHeaderMid}>
                <Text style={styles.detailHeaderIdent}>issue</Text>
                <Text style={styles.detailHeaderSub}>15 分钟前</Text>
              </View>
              <View style={styles.detailHeaderPill}>
                <Text style={styles.detailHeaderPillText}>处理中</Text>
              </View>
            </View>
          </View>
        </LabSection>

        <Text style={styles.placeholder}>
          Sprint 3 · 6/6 全收口。下一阶段拍板：B (musing agent UI block 协议) / C (Force Dark plugin 持久化) / D (Sprint 4 6-pager)。
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40 },
  topbar: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  back: {
    fontSize: 28,
    color: COLORS.inkSub,
    marginBottom: 4,
  },
  title: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 26,
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkMute,
    marginTop: 2,
  },
  h2: {
    fontFamily: FONT_SERIF_BOLD,
    fontSize: 18,
    color: COLORS.accentHi,
    letterSpacing: 0.4,
    marginTop: 22,
    marginBottom: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionHead: {
    marginBottom: 8,
  },
  sectionName: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 16,
    color: COLORS.accent,
  },
  sectionSpec: {
    fontFamily: FONT_CN,
    fontSize: 11.5,
    color: COLORS.inkMute,
    marginTop: 2,
    lineHeight: 16,
  },
  stage: {
    backgroundColor: COLORS.bgSub,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageTip: {
    position: 'absolute',
    bottom: 10,
    fontSize: 10,
    color: COLORS.inkMute,
    fontFamily: FONT_CN,
  },
  placeholder: {
    fontFamily: FONT_CN,
    fontSize: 12,
    color: COLORS.inkMute,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  // Sprint 3.5 接入态 mock：还原 DetailScreen.styles.header 的横向布局
  detailHeaderMock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 14,
  },
  detailHeaderMid: { flex: 1 },
  detailHeaderIdent: {
    fontSize: 12,
    color: COLORS.inkMute,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  detailHeaderSub: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.inkMute,
  },
  detailHeaderPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.media + '22',
    borderWidth: 1,
    borderColor: COLORS.media + '66',
  },
  detailHeaderPillText: {
    fontSize: 11,
    color: COLORS.media,
    fontFamily: FONT_CN,
  },
  // Sprint 3.3b · 录音状态条 mock
  recordingBarMock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 7,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderRadius: 6,
  },
  recordingDotWrap: {
    width: 16,
    height: 16,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingRippleStage: {
    position: 'absolute',
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accentHi,
  },
  recordingText: {
    fontSize: 11,
    color: COLORS.accent,
    letterSpacing: 0.8,
    fontWeight: '500',
    fontFamily: FONT_CN,
  },
  // Sprint 3.6 · PolaroidCard mock 内文样式
  polaroidMockMeta: {
    fontSize: 11,
    color: COLORS.inkMute,
    marginBottom: 6,
  },
  polaroidMockBody: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.ink,
  },
  polaroidMockFooter: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 11,
    color: COLORS.accentHi,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
  },
  demoCell: {
    alignItems: 'center',
    gap: 8,
  },
  sineCell: {
    width: '100%',
    paddingHorizontal: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 8,
  },
  cellLabel: {
    fontFamily: FONT_CN,
    fontSize: 10,
    color: COLORS.inkMute,
  },
  rippleStage: {
    width: 175,
    height: 175,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
