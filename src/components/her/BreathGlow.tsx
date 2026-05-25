import React, { useEffect } from 'react';
import type { DimensionValue, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * BreathGlow · 暖色呼吸光球（Her 视觉底座）
 *
 * 一颗 radial-gradient 暖色光球，5s 周期呼吸：
 * - opacity 0.45 ↔ 0.85
 * - scale   0.85 ↔ 1.10
 *
 * 默认 280px、屏幕居中。仅做装饰，pointerEvents="none"。
 *
 * 来源：docs/her/voice-viz-lab.html (panel A · she's here)
 */
type Props = {
  size?: number;
  top?: DimensionValue;
  left?: DimensionValue;
  /** Sprint 3.18 · detail 页满屏 cards 遮蔽多 → 提供 strong 模式拉满 opacity */
  intensity?: 'normal' | 'strong';
};

export function BreathGlow({ size = 280, top, left, intensity = 'normal' }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    // 2500ms 单向 + 反向回弹 = 5s 完整呼吸周期
    t.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t]);

  // Sprint 3.18 · strong = detail 页用，opacity 拉到 0.7-1.0；normal 保留主屏 0.45-0.85
  const oMin = intensity === 'strong' ? 0.7 : 0.45;
  const oMax = intensity === 'strong' ? 1.0 : 0.85;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: oMin + (oMax - oMin) * t.value,
    transform: [{ scale: 0.85 + (1.1 - 0.85) * t.value }],
  }));

  const containerStyle: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    ...(top !== undefined ? { top } : { top: '50%', marginTop: -size / 2 }),
    ...(left !== undefined ? { left } : { left: '50%', marginLeft: -size / 2 }),
  };

  return (
    <Animated.View
      style={[containerStyle, animatedStyle]}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`breathGlow-${intensity}`} cx="50%" cy="50%" r="50%">
            <Stop
              offset="0%"
              stopColor={COLORS.accent}
              stopOpacity={intensity === 'strong' ? 0.6 : 0.45}
            />
            <Stop
              offset="50%"
              stopColor={COLORS.peach}
              stopOpacity={intensity === 'strong' ? 0.4 : 0.25}
            />
            <Stop offset="80%" stopColor={COLORS.peach} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#breathGlow-${intensity})`} />
      </Svg>
    </Animated.View>
  );
}
