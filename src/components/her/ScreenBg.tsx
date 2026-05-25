import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * ScreenBg · 整屏暖色 radial gradient 底座
 *
 * 1:1 对齐 spec docs/her/v2-musing-her.html line 82-85 的 .screen background：
 *   radial-gradient(circle at 80% -20%, rgba(244,184,157,.55), transparent 60%),  // 右上 peach 高光
 *   radial-gradient(circle at  0% 100%, rgba(212,155,122,.32), transparent 55%),  // 左下 amber 暖影
 *   var(--cream);                                                                  // 底色 #F5E6D3
 *
 * 之前 home 屏只挂了一颗 BreathGlow，整屏色彩偏单调；spec 用双层 radial 把光线方向
 * （右上来 → 左下落）和暖色叠层做出来，是 Her v2 视觉底座的关键。
 */
export function ScreenBg() {
  return (
    <View style={styles.fill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient
            id="bgPeach"
            cx="80%"
            cy="-20%"
            rx="60%"
            ry="60%"
          >
            <Stop offset="0%" stopColor={COLORS.peach} stopOpacity={0.55} />
            <Stop offset="100%" stopColor={COLORS.peach} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id="bgAmber"
            cx="0%"
            cy="100%"
            rx="55%"
            ry="55%"
          >
            <Stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.32} />
            <Stop offset="100%" stopColor={COLORS.amber} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={COLORS.bg} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgPeach)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgAmber)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});
