import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { COLORS, FONT_SERIF_BOLD } from '../../theme';

/**
 * WaxSeal · 红蜡封印章（Her 物件 · Sprint 2.6）
 *
 * 三档尺寸：small=24 / large=42 / huge=60
 * 视觉：radial-gradient(circle at 35% 30%, #E85A4F, #9B3525) +
 * inset dashed 白色虚线圆 + drop shadow + 旋转 -12°
 *
 * Sprint 3 接入位置（DEV-PLAN §5.3）：
 *  - 3.1 ProposeCard 右上 small wax 标 recommended option
 *  - 3.3 ProgressCard 步骤 done 标记替换为 mini wax
 *  - 3.4 DoneCard 信纸右上 huge M 大蜡封
 *
 * 来源：docs/her/v2-musing-her.html .wax / .wax.large / .wax.huge
 */
type Size = 'small' | 'large' | 'huge';

type Props = {
  /** 尺寸档位，默认 small */
  size?: Size;
  /** 蜡封中心字符（默认 'M'，Musing 首字母）*/
  letter?: string;
  /** 旋转角度，默认 -12 (deg)；步骤 done marker 用 -12 也很合适 */
  rotate?: number;
  /** 是否显示 inset 虚线圆，默认 true（small 也保留，spec 一致）*/
  showDashed?: boolean;
};

const SIZE_MAP: Record<Size, { px: number; font: number }> = {
  small: { px: 24, font: 10 },
  large: { px: 42, font: 18 },
  huge: { px: 60, font: 24 },
};

const COLOR_HI = '#E85A4F'; // spec light end (coral)
const COLOR_LO = '#9B3525'; // spec dark end (deep red shadow)

export function WaxSeal({
  size = 'small',
  letter = 'M',
  rotate = -12,
  showDashed = true,
}: Props) {
  const { px, font } = SIZE_MAP[size];
  const wrap: ViewStyle = {
    width: px,
    height: px,
    transform: [{ rotate: `${rotate}deg` }],
    alignItems: 'center',
    justifyContent: 'center',
    // drop shadow（与 spec 一致 0 2px 6px rgba(0,0,0,.18))
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  };

  return (
    <View style={wrap}>
      <Svg
        width={px}
        height={px}
        viewBox="0 0 100 100"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id="waxGrad" cx="35%" cy="30%" r="80%" fx="35%" fy="30%">
            <Stop offset="0%" stopColor={COLOR_HI} stopOpacity={1} />
            <Stop offset="100%" stopColor={COLOR_LO} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill="url(#waxGrad)" />
        {showDashed ? (
          <Circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity={0.2}
            strokeWidth={1.5}
            strokeDasharray="2,3"
          />
        ) : null}
      </Svg>
      <Text
        style={[
          styles.letter,
          { fontSize: font, lineHeight: px },
        ]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  letter: {
    color: COLORS.bgSub,
    fontFamily: FONT_SERIF_BOLD,
    fontStyle: 'italic',
    fontWeight: '600',
    textAlign: 'center',
  },
});
