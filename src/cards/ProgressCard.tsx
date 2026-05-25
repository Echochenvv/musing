/**
 * ProgressCard — agent 正在执行
 *  · stepIndex / totalSteps · currentStep · steps[] 展开 stepper
 *  · StepRow 是 ProgressCard 私有子组件
 *
 * Sprint 3.3 接入：step.state==='done' 的 marker 从纯色圆点改为 `<WaxSeal small letter="✓">`
 *   含义：每完成一步像盖一个红蜡封，仪式感拉满，区别于 now/todo 的功能态色块。
 */

import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { WaxSeal } from '../components/her/WaxSeal';
import type { UIBlock, UIBlockStep } from '../uiBlock';
import { styles, MarkdownText } from '../DetailScreen';
import { COLORS } from '../theme';
import { CardTitle, CardHint } from './_shared';

export function ProgressCard({ block }: { block: UIBlock }) {
  const idx = block.stepIndex;
  const tot = block.totalSteps;
  const showFrac = typeof idx === 'number' && typeof tot === 'number' && tot > 0;
  return (
    <View style={[styles.card, styles.cardProgress]}>
      <CardTitle icon="⚙" color={COLORS.media} text={block.title} />
      {(showFrac || block.currentStep) ? (
        <View style={styles.progressMeta}>
          {showFrac ? (
            <Text style={styles.progressFrac}>
              {idx} / {tot}
            </Text>
          ) : null}
          {block.currentStep ? (
            <View style={styles.progressCurrentWrap}>
              <MarkdownText
                text={block.currentStep}
                style={styles.progressCurrent}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {block.steps?.length ? (
        <View style={styles.stepList}>
          {block.steps.map((s, i) => (
            <StepRow key={`${s.label}-${i}`} step={s} />
          ))}
        </View>
      ) : null}
      {/* Sprint 3.10 ② · 6px amber→coral 渐变进度条 + meta 横排（spec .progress-bar / .progress-meta）*/}
      {showFrac ? (
        <View style={styles.progressBarWrap}>
          <Svg width="100%" height={6} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="pbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor="#D49B7A" />
                <Stop offset="100%" stopColor={COLORS.accent} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height={6} rx={3} fill="rgba(224,213,194,0.6)" />
            <Rect
              width={`${Math.min(100, Math.round(((idx as number) / (tot as number)) * 100))}%`}
              height={6}
              rx={3}
              fill="url(#pbGrad)"
            />
          </Svg>
          <View style={styles.progressBarMeta}>
            <Text style={styles.progressBarMetaLeft}>
              {idx} of {tot}
            </Text>
            <Text style={styles.progressBarMetaRight}>
              {block.hint || `${tot && idx ? Math.max(0, (tot - idx)) : '·'} step left`}
            </Text>
          </View>
        </View>
      ) : null}
      {!showFrac ? <CardHint text={block.hint} /> : null}
    </View>
  );
}

function StepRow({ step }: { step: UIBlockStep }) {
  const isDone = step.state === 'done';
  const isNow = step.state === 'now';
  return (
    <View style={[styles.stepRow, isNow && styles.stepRowNow]}>
      {isDone ? (
        // Sprint 3.3 · done → 红蜡封 small ✓
        <View style={styles.stepWaxWrap}>
          <WaxSeal size="small" letter="✓" />
        </View>
      ) : isNow ? (
        // Sprint 3.10 ⑤ · now marker = amber bg + 4px coral 0.25 ring 光晕（spec 还原）
        <View style={styles.stepNowRing}>
          <View style={styles.stepNowDot} />
        </View>
      ) : (
        <View style={[styles.stepDot, styles.stepDotTodo]}>
          <Text style={styles.stepDotText}>·</Text>
        </View>
      )}
      <View style={styles.stepLabelWrap}>
        <MarkdownText
          text={step.label}
          style={
            // Sprint 3.10 ⑤ · done 文字 line-through · now 加粗 · todo 弱化
            isDone
              ? { ...styles.stepLabel, ...styles.stepLabelDone }
              : isNow
                ? { ...styles.stepLabel, ...styles.stepLabelNow }
                : { ...styles.stepLabel, ...styles.stepLabelMute }
          }
        />
      </View>
    </View>
  );
}
