import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { COLORS, FONT_CN } from '../../theme';
import { PATH_ENVELOPE, VIEW_H, VIEW_W } from './voicePath';

/**
 * VoiceEnvelope · 长按/点击 ▶ 播放原始语音时的扫描包络（C 区 · Sprint 3.15.2 重写）
 *
 * 之前用 react-native-svg `<ClipPath>` + reanimated AnimatedRect width，
 * 4 帧 pixel diff（emu）验证 Android 上 clipPath 不会随 animated width 重 mask。
 * 改用 React state 50ms 驱动 + 普通 View overflow:hidden 物理切割，确保跨平台。
 *
 * 双层渲染：
 *  - 底层 envelope (peach 0.42) 整段可见
 *  - 顶层 envelope (coral 0.85) 用普通 View overflow:hidden + width 切到 progress * 容器宽
 *  - playhead 2px 竖线 (burnt) 跟随末端横扫
 *
 * 默认 6s 一周期 linear infinite。受控 progress 参数（0~1）可绕开自循环。
 *
 * 来源：docs/her/voice-viz-lab.html C 区
 *   - .env-fg clip-path: inset(0 100% 0 0) → inset(0 0 0 0) 6s linear infinite
 *   - .head left: 0% → 100% 6s linear infinite
 */
type Props = {
  active?: boolean;
  durationMs?: number;
  height?: number;
  progress?: number;
};

export function VoiceEnvelope({
  active = true,
  durationMs = 6000,
  height = VIEW_H,
  progress: controlled,
}: Props) {
  const [layoutW, setLayoutW] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (controlled !== undefined) {
      setProgress(controlled);
      return;
    }
    if (!active) {
      setProgress(0);
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setProgress((elapsed % durationMs) / durationMs);
    }, 50);
    return () => clearInterval(interval);
  }, [active, durationMs, controlled]);

  const scanW = layoutW * progress;
  const headLeft = scanW;

  return (
    <View
      style={{ width: '100%', height, position: 'relative', overflow: 'hidden' }}
      pointerEvents="none"
      onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}
    >
      {/* 底层 peach 包络（整段可见） */}
      {layoutW > 0 ? (
        <Svg
          width={layoutW}
          height={height}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
        >
          <Path d={PATH_ENVELOPE} fill={COLORS.peach} opacity={0.42} />
        </Svg>
      ) : null}
      {/* 顶层 coral 扫描层 · 普通 View width 跟 progress state 走（每 50ms 重渲染）*/}
      {layoutW > 0 && scanW > 0 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height,
            width: scanW,
            overflow: 'hidden',
          }}
          pointerEvents="none"
        >
          <Svg
            width={layoutW}
            height={height}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
          >
            <Path d={PATH_ENVELOPE} fill={COLORS.accent} opacity={0.85} />
          </Svg>
        </View>
      ) : null}
      {/* playhead · 跟随扫描末端的竖线 */}
      {layoutW > 0 ? (
        <View
          style={[styles.head, { height, left: headLeft }]}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}

type CardProps = {
  quote?: string;
  startTime?: string;
  endTime?: string;
  active?: boolean;
};

export function VoiceEnvelopeCard({
  quote = '"如果我要在端上跑一个轻量翻译模型..."',
  startTime = '0:00',
  endTime = '0:14',
  active = true,
}: CardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.quoteWrap}>
        <View style={styles.quoteBar} />
        <Text style={styles.quoteText}>{quote}</Text>
      </View>
      <VoiceEnvelope active={active} />
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{startTime}</Text>
        <Text style={styles.timeText}>{endTime}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 14, width: '100%' },
  quoteWrap: { flexDirection: 'row', paddingLeft: 0, marginBottom: 14 },
  quoteBar: {
    width: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    marginRight: 12,
    marginVertical: 6,
  },
  quoteText: {
    flex: 1,
    fontFamily: FONT_CN,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 26,
    color: COLORS.ink,
  },
  head: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: COLORS.accentHi,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  timeText: { fontFamily: FONT_CN, fontSize: 11, color: COLORS.mauve, letterSpacing: 0.4 },
});
