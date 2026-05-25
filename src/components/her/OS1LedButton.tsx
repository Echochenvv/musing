import React, { useEffect } from 'react';
import { Pressable, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * OS1LedButton · 顶栏 OS1 LED 替换返回箭头（Her 物件 · Sprint 2.3）
 *
 * 40px 圆形按钮（cream-w 底 + beige 边 + soft shadow），中心一颗 10px LED：
 * - LED 主体径向渐变 cx=30% cy=30% · #FFB07A → coral → burnt
 * - LED 外发光（shadowColor=coral, shadowRadius=4, opacity 0.7） + 内深暗影
 * - 3s ease-in-out 慢呼吸：opacity 0.55 ↔ 1 + scale 0.9 ↔ 1.08
 *
 * 替代 DetailScreen.tsx 顶栏的 "←" Text 返回箭头。点击触发 onPress（外部接 BackHandler）。
 *
 * 来源：docs/her/v2-musing-her.html `.os1-led-btn` / `.os1-led-btn .led`
 *      + `@keyframes led-breath`
 */
type Props = {
  /** 按钮直径（px），默认 40 */
  size?: number;
  /** LED 直径（px），默认 10 */
  ledSize?: number;
  onPress?: () => void;
  hitSlop?: number;
  /** 按下态额外样式（默认 opacity 0.7） */
};

export function OS1LedButton({
  size = 40,
  ledSize = 10,
  onPress,
  hitSlop = 12,
}: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    // 3s 完整呼吸周期：1500ms 单向 + 反向回弹（withRepeat reverse=true）
    t.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [t]);

  // 0% → opacity 0.55 + scale 0.9 ; 100% → opacity 1 + scale 1.08
  const ledAnimStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * t.value,
    transform: [{ scale: 0.9 + 0.18 * t.value }],
  }));

  const wrap: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: COLORS.bgSub,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    // soft shadow（spec var(--shadow-soft) 近似）
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  };

  // LED 容器外发光（spec box-shadow:0 0 8px rgba(232,90,79,.7)）
  const ledWrap: ViewStyle = {
    width: ledSize,
    height: ledSize,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 4,
    elevation: 4,
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      style={({ pressed }) => [wrap, pressed ? { opacity: 0.7 } : null]}
    >
      <Animated.View style={[ledWrap, ledAnimStyle]}>
        <Svg width={ledSize} height={ledSize}>
          <Defs>
            <RadialGradient id="ledBody" cx="30%" cy="30%" r="70%">
              <Stop offset="0%" stopColor="#FFB07A" />
              <Stop offset="50%" stopColor={COLORS.accent} />
              <Stop offset="100%" stopColor={COLORS.accentHi} />
            </RadialGradient>
          </Defs>
          <Circle
            cx={ledSize / 2}
            cy={ledSize / 2}
            r={ledSize / 2}
            fill="url(#ledBody)"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
