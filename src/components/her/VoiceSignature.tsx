import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { COLORS, FONT_CN, FONT_SERIF_BOLD } from '../../theme';
import { PATH_SIGNATURE, VIEW_H, VIEW_W } from './voicePath';

/**
 * VoiceSignature · DoneCard 闭环卡片底部声纹海拔静态签名（Her 物件 · Sprint 2.5 · E 区）
 *
 * 单 svg + 单 path · 不动 · 作为"作品签名"。
 * 颜色：上 coral 0.85 → 下 peach 0.65 垂直渐变（spec stop 点完全复刻）。
 *
 * 来源：docs/her/voice-viz-lab.html E 区
 *   - .silhouette-stage .plate · 暖色 plate 容器 + 蜡封小红点 + M 章
 *   - svg.silh viewBox 0 0 400 80 + linearGradient 0%/100%
 *
 * Sprint 3 接到 DoneCard 底部时可以传 title / duration / wordCount / stats 自定义。
 */
type Props = {
  /** plate 顶部右上的标题（设计稿是 "letter to Lucia · v3"）*/
  title?: string;
  /** 时长 + 字数（"0:38 · 318 words"）*/
  meta?: string;
  /** 底部 stat（默认三段 spec 文案）*/
  stats?: string[];
  /** 是否显示蜡封 M 红章，默认 true */
  showStamp?: boolean;
  /** signature svg 高度，默认 80 */
  height?: number;
  /**
   * Sprint 3.10 ⑧ · embedded 模式：去 plate 装饰 + dashed top border + sig-label
   * "⌖ voice signature" + monospace stat-row（用于 DoneCard 信纸内嵌）
   */
  embedded?: boolean;
};

export function VoiceSignature({
  title = 'letter to Lucia · v3',
  meta = '0:38 · 318 words',
  stats = ['tone · gentle 64%', 'pace · 92 wpm', 'pauses · 7'],
  showStamp = true,
  height = VIEW_H,
  embedded = false,
}: Props) {
  const svgEl = (
    <Svg
      width="100%"
      height={embedded ? 42 : height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
    >
      <Defs>
        <LinearGradient id="silhGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.85} />
          <Stop offset="100%" stopColor={COLORS.peach} stopOpacity={0.55} />
        </LinearGradient>
      </Defs>
      <Path d={PATH_SIGNATURE} fill="url(#silhGrad)" />
    </Svg>
  );

  if (embedded) {
    return (
      <View style={styles.embedded}>
        <Text style={styles.sigLabel}>⌖ voice signature</Text>
        {svgEl}
        <View style={styles.statRowEmbedded}>
          {stats.map((s, i) => (
            <Text key={i} style={styles.statTextMono}>
              {s}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.plateWrap}>
      <View style={styles.plate}>
        {showStamp ? (
          <View style={styles.stamp}>
            <Text style={styles.stampText}>M</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={styles.metaTitle}>{title}</Text>
          <Text style={styles.metaSub}>{meta}</Text>
        </View>
        {svgEl}
        <View style={styles.statRow}>
          {stats.map((s, i) => (
            <Text key={i} style={styles.statText}>
              {s}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plateWrap: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  plate: {
    backgroundColor: COLORS.bgSub,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    paddingBottom: 14,
    paddingTop: 18,
    shadowColor: COLORS.accentHi,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: 'relative',
  },
  stamp: {
    position: 'absolute',
    top: -6,
    right: 18,
    width: 36,
    height: 24,
    transform: [{ rotate: '-12deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: {
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    color: COLORS.bgSub,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: COLORS.accent,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  metaTitle: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accentHi,
  },
  metaSub: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 12,
    color: COLORS.inkSub,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  statText: {
    fontFamily: FONT_CN,
    fontSize: 11,
    color: COLORS.mauve,
    letterSpacing: 0.4,
  },
  // Sprint 3.10 ⑧ · embedded 模式（DoneCard 信纸内嵌）
  embedded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(176,139,139,0.3)',
    borderStyle: 'dashed',
  },
  sigLabel: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontSize: 10.5,
    color: COLORS.mauve,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statRowEmbedded: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statTextMono: {
    fontFamily: 'Courier', // RN 内置 monospace（spec SF Mono fallback）
    fontSize: 9.5,
    color: COLORS.mauve,
    letterSpacing: 0.4,
  },
});
