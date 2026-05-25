import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * BlindsLight · 木质百叶窗光（Her 视觉底座）
 *
 * Sprint 3.25 · issue · 用户原话「百叶窗展示横线没有问题，但是不要改变背景色，只需要横线」
 *   → 删除底层 amber LinearGradient 矩形（之前给 200px 区域加暖色背景层 = "改变背景色"）
 *   → 删除 sprint 3.22 stripes y-fade（回到 spec 原版均匀 opacity=0.42）
 *   → 现在只剩纯横线，背景由 ScreenBg 完整透出，颗粒度对齐 spec
 *
 * 顶部 200px 横向木纹斜光带——下午四点 Theodore 公寓的暖意。
 * - 横向重复线条（3px on / 15px off，每 18px 一周期）
 * - 整体 opacity 默认 0.32（背景态），intense=true 时 0.55（进行中强渲染）
 *
 * 静态 SVG，纯装饰，pointerEvents="none"。
 *
 * 来源：docs/her/v2-musing-her.html `.screen .blinds`
 *   spec: repeating-linear-gradient(0deg, amber 0 3px, transparent 3px 18px)
 *   spec 还包了底层 amber 渐变层，但用户明确不要 → 这里只实现 spec 的 stripes 部分。
 */
type Props = {
  height?: number;
  intense?: boolean;
};

export function BlindsLight({ height = 200, intense = false }: Props) {
  const VBW = 1000; // viewBox 横向单位（preserveAspectRatio="none" 拉伸到屏幕宽）
  const stripeStep = 18;
  const stripeThick = 3;

  const stripes = [];
  for (let y = 0; y < height; y += stripeStep) {
    stripes.push(
      <Rect
        key={`b-${y}`}
        x={0}
        y={y}
        width={VBW}
        height={stripeThick}
        fill={COLORS.amber}
        opacity={0.42}
      />,
    );
  }

  const wrap: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height,
    opacity: intense ? 0.55 : 0.32,
  };

  return (
    <View style={wrap} pointerEvents="none">
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VBW} ${height}`}
        preserveAspectRatio="none"
      >
        {stripes}
      </Svg>
    </View>
  );
}
