import React, { useEffect } from 'react';
import { View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { COLORS } from '../../theme';

/**
 * RippleAura · 录音中 3 道错位同心圆涟漪（Her 物件 · Sprint 2.2）
 *
 * 3 个圆环（border-only）从中心 scale 0.7 → 3.5 同时 fade out，2.4s ease-out，
 * 错位起始 0 / 0.8 / 1.6 秒，颜色 coral / peach / amber。
 *
 * 用法：包在 EarpieceMic 周围或 mic 触发态下渲染：
 *   <View><RippleAura active={isRecording} /><EarpieceMic /></View>
 *
 * 不挡交互（pointerEvents=none）。active=false 时 0 渲染开销（只渲染容器）。
 *
 * 来源：docs/her/voice-viz-lab.html `.recording .ring`
 */
type Props = {
  /** 单环基准 size（px），等同 EarpieceMic 直径，默认 50 */
  size?: number;
  /** 是否激活动画（与 spec .recording 状态对齐），默认 true */
  active?: boolean;
};

const DURATION = 2400;
const MIN_SCALE = 0.7;
const MAX_SCALE = 3.5;
const MAX_BORDER = 2.5;
const MIN_BORDER = 0.5;
const PEAK_OPACITY = 0.85;

export function RippleAura({ size = 50, active = true }: Props) {
  const t1 = useSharedValue(0);
  const t2 = useSharedValue(0);
  const t3 = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      t1.value = 0;
      t2.value = 0;
      t3.value = 0;
      return;
    }
    const cfg = { duration: DURATION, easing: Easing.out(Easing.quad) };
    t1.value = withRepeat(withTiming(1, cfg), -1, false);
    t2.value = withDelay(800, withRepeat(withTiming(1, cfg), -1, false));
    t3.value = withDelay(1600, withRepeat(withTiming(1, cfg), -1, false));
  }, [active, t1, t2, t3]);

  const containerSize = size * MAX_SCALE;
  const offset = (containerSize - size) / 2;

  // 单环动画样式 · 三个环只是 t / 颜色不同
  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t1.value }],
    opacity: PEAK_OPACITY * (1 - t1.value),
    borderWidth: MAX_BORDER - (MAX_BORDER - MIN_BORDER) * t1.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t2.value }],
    opacity: PEAK_OPACITY * (1 - t2.value),
    borderWidth: MAX_BORDER - (MAX_BORDER - MIN_BORDER) * t2.value,
  }));
  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: MIN_SCALE + (MAX_SCALE - MIN_SCALE) * t3.value }],
    opacity: PEAK_OPACITY * (1 - t3.value),
    borderWidth: MAX_BORDER - (MAX_BORDER - MIN_BORDER) * t3.value,
  }));

  const wrap: ViewStyle = {
    width: containerSize,
    height: containerSize,
    alignItems: 'center',
    justifyContent: 'center',
  };
  const ringBase: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    borderStyle: 'solid',
    left: offset,
    top: offset,
  };

  return (
    <View style={wrap} pointerEvents="none">
      {active ? (
        <>
          <Animated.View
            style={[ringBase, { borderColor: COLORS.accent }, ring1Style]}
          />
          <Animated.View
            style={[ringBase, { borderColor: COLORS.peach }, ring2Style]}
          />
          <Animated.View
            style={[ringBase, { borderColor: COLORS.amber }, ring3Style]}
          />
        </>
      ) : null}
    </View>
  );
}
