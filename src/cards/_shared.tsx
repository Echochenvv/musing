/**
 * 4 类 UI Block Card 共用的子组件
 *  · CardTitle — 卡片头（icon + 标题，title 走 MarkdownText 渲染）
 *  · CardHint  — 卡片底 hint（小字提示，走 MarkdownText）
 *  · OptionRow — Propose/Ask 共用的选项行（id + 描述 + 推荐星 + Sprint 3.1 蜡封角标）
 */

import { Pressable, Text, View } from 'react-native';

import { WaxSeal } from '../components/her/WaxSeal';
import type { UIBlockOption } from '../uiBlock';
import { styles, MarkdownText } from '../DetailScreen';

// Sprint 3.12 ③ · 对齐 spec .uicard .card-head：32px circle 背景色 + 16px serif charcoal title
export function CardTitle({
  icon,
  color,
  text,
}: {
  icon: string;
  color: string;
  text?: string;
}) {
  if (!text) return null;
  // 把 color 转成 alpha 0.18 作为 icon 圆背景（spec 例：rgba(232,90,79,.14) coral 半透）
  return (
    <View style={styles.cardTitleRow}>
      <View
        style={[
          styles.cardTitleIconWrap,
          { backgroundColor: hexToAlpha(color, 0.18) },
        ]}
      >
        <Text style={[styles.cardTitleIcon, { color }]}>{icon}</Text>
      </View>
      <View style={styles.cardTitleTextWrap}>
        <MarkdownText
          text={text}
          style={styles.cardTitle}
        />
      </View>
    </View>
  );
}

// 把任意 #rrggbb / rgba()/COLORS hex 安全转成 rgba 半透色（用于 icon 圆背景）
function hexToAlpha(c: string, a: number): string {
  if (c.startsWith('rgba(') || c.startsWith('rgb(')) return c;
  if (c.startsWith('#')) {
    const h = c.length === 4
      ? c.slice(1).split('').map((x) => x + x).join('')
      : c.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return c;
}

export function CardHint({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <View style={styles.cardHintWrap}>
      <MarkdownText text={text} style={styles.cardHintText} />
    </View>
  );
}

export function OptionRow({
  opt,
  recommended,
  onPress,
}: {
  opt: UIBlockOption;
  recommended?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        recommended && styles.optionRowRecommended,
        pressed && styles.optionRowPressed,
      ]}
    >
      <Text
        style={[
          styles.optionId,
          recommended && styles.optionIdRecommended,
        ]}
      >
        {opt.id || '·'}
      </Text>
      <View style={styles.optionDescWrap}>
        <MarkdownText text={opt.desc} style={styles.optionDesc} />
      </View>
      {recommended ? <Text style={styles.optionStar}>★ 推荐</Text> : null}
      {recommended ? (
        <View style={styles.optionWaxCorner} pointerEvents="none">
          <WaxSeal size="small" />
        </View>
      ) : null}
    </Pressable>
  );
}
