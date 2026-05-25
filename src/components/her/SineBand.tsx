import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { COLORS, FONT_SERIF_BOLD } from '../../theme';

/**
 * SineBand · 4 道叠加正弦缓动柔波带（Her 物件 · Sprint 2.4）
 *
 * Sprint 3.25 · issue · 用户原话「4 道流动 sine 没有流动，目前是静态的」
 *   → 从 react-native-reanimated v4 切到 RN Animated API
 *   原因：reanimated v4 的 useAnimatedProps 把 sharedValue 应用到 SVG G 的 x prop
 *   在当前 release build / Hermes 环境下不生效（musing CLAUDE.md 提到的 Hermes 字节码 worklet 坑）。
 *   RN Animated.Value + Animated.createAnimatedComponent(G) 是 known good 姿势。
 *   useNativeDriver: false（SVG x prop 不支持 native driver，只能 JS 端 tick）。
 *
 * agent typing 时显示，对话区上方亮起。4 层 sine 路径横向错位流动，
 * 周期 6/9/13/17 秒，l2/l4 反向。颜色 coral/peach/amber/rose。
 *
 * 来源：docs/her/voice-viz-lab.html B 区
 *   - viewBox 400×130，path 在 -200~600 区间，translateX(-200) 一周期
 *   - durations 6/9/13/17s，linear infinite
 *   - l2/l4 reverse direction
 */

const AnimatedG = Animated.createAnimatedComponent(G);

type Props = {
  /** 是否激活动画，默认 true */
  active?: boolean;
  /** 高度，默认 130（与 spec viewBox 一致） */
  height?: number;
  /** 是否显示 "samantha is speaking…" 提示，默认 true */
  showLabel?: boolean;
};

const VB_W = 400;
const VB_H = 130;
const SHIFT = 200; // CSS translateX(-200px)，svg 用同等 viewBox 单位

const PATH_L1 =
  'M-200,65 Q-150,25 -100,65 T0,65 T100,65 T200,65 T300,65 T400,65 T500,65 T600,65';
const PATH_L2 =
  'M-200,65 Q-160,40 -120,65 T-40,65 T40,65 T120,65 T200,65 T280,65 T360,65 T440,65 T520,65 T600,65';
const PATH_L3 =
  'M-200,65 Q-180,50 -160,65 T-120,65 T-80,65 T-40,65 T0,65 T40,65 T80,65 T120,65 T160,65 T200,65 T240,65 T280,65 T320,65 T360,65 T400,65 T440,65 T480,65 T520,65 T560,65 T600,65';
const PATH_L4 =
  'M-200,65 Q-130,15 -60,65 T80,65 T220,65 T360,65 T500,65 T640,65';

function useFlow(durationMs: number, reverse: boolean, active: boolean) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    // RN Animated 不支持 SVG x prop 的 native driver，必须 JS 端 tick
    const anim = Animated.loop(
      Animated.timing(value, {
        toValue: reverse ? SHIFT : -SHIFT,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [active, durationMs, reverse, value]);
  return value;
}

function BlinkDot() {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [value]);
  const opacity = value.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.2],
  });
  return <Animated.View style={[styles.blink, { opacity }]} />;
}

export function SineBand({
  active = true,
  height = VB_H,
  showLabel = true,
}: Props) {
  const t1 = useFlow(6000, false, active);
  const t2 = useFlow(9000, true, active);
  const t3 = useFlow(13000, false, active);
  const t4 = useFlow(17000, true, active);

  const wrap: ViewStyle = { width: '100%' };

  return (
    <View style={wrap} pointerEvents="none">
      {showLabel ? (
        <View style={styles.labelRow}>
          {active ? (
            <BlinkDot />
          ) : (
            <View style={[styles.blink, { opacity: 0.3 }]} />
          )}
          <Text style={styles.labelText}>samantha is speaking…</Text>
        </View>
      ) : null}
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
      >
        <AnimatedG x={t1}>
          <Path
            d={PATH_L1}
            stroke={COLORS.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
        </AnimatedG>
        <AnimatedG x={t2}>
          <Path
            d={PATH_L2}
            stroke={COLORS.peach}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={0.7}
          />
        </AnimatedG>
        <AnimatedG x={t3}>
          <Path
            d={PATH_L3}
            stroke={COLORS.amber}
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
            opacity={0.55}
          />
        </AnimatedG>
        <AnimatedG x={t4}>
          <Path
            d={PATH_L4}
            stroke={COLORS.rose}
            strokeWidth={1.2}
            strokeLinecap="round"
            fill="none"
            opacity={0.45}
          />
        </AnimatedG>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    marginBottom: 4,
  },
  blink: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  labelText: {
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontWeight: '600',
    fontSize: 11.5,
    color: COLORS.accentHi,
    letterSpacing: 0.4,
  },
});
