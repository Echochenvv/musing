import React, { ReactNode, useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Line,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * LetterPaper · 手写信纸容器（Her 物件 · Sprint 2.6）
 *
 * 视觉来源：docs/her/v2-musing-her.html .letter
 *  - 上下 cream 渐变 (#FCF5E6 → #F5E9D0)
 *  - 横向信纸格 27px 一行（rgba(176,139,139,.12)）
 *  - 左 34px 处一条 coral 0.2 的纵向 margin line
 *  - 1px #E2D2B6 边 + 14px 圆角
 *  - 外阴影 + inset 高光
 *
 * RN 不支持 repeating-linear-gradient → 用 react-native-svg `<Pattern>`
 * 实现 27px 横线 + coral margin line + 上下 LinearGradient 一并喂在 SVG 背景层。
 */
type Props = {
  children: ReactNode;
  /** 容器 padding，默认 18 / 20 / 20（spec 完全对齐）*/
  padding?: { top?: number; right?: number; bottom?: number; left?: number };
  /** 行高 px，默认 27（spec 26+1）*/
  lineSpacing?: number;
  /** 左 margin line offset px，默认 34 */
  marginX?: number;
  /** 容器外样式覆写（width / margin 等）*/
  style?: ViewStyle;
  /** 容器外圆角，默认 14 */
  radius?: number;
};

export function LetterPaper({
  children,
  padding,
  lineSpacing = 27,
  marginX = 34,
  style,
  radius = 14,
}: Props) {
  const pad = useMemo(
    () => ({
      top: padding?.top ?? 18,
      right: padding?.right ?? 20,
      bottom: padding?.bottom ?? 20,
      left: padding?.left ?? 20,
    }),
    [padding],
  );

  return (
    <View
      style={[
        styles.wrap,
        { borderRadius: radius },
        style,
      ]}
    >
      {/* 背景：cream 上下渐变 + 横线 pattern + coral margin line · 用 svg 一层渲全 */}
      <Svg
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
        preserveAspectRatio="none"
      >
        <Defs>
          {/* 上下 cream 渐变 */}
          <LinearGradient id="paperGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FCF5E6" stopOpacity={1} />
            <Stop offset="100%" stopColor="#F5E9D0" stopOpacity={1} />
          </LinearGradient>
          {/* 横向信纸格 · 27px 一行 · 写在 path 上（pattern 复用）*/}
          <Pattern
            id="ruling"
            x={0}
            y={0}
            width={100}
            height={lineSpacing}
            patternUnits="userSpaceOnUse"
          >
            <Line
              x1="0"
              y1={lineSpacing - 0.5}
              x2="100"
              y2={lineSpacing - 0.5}
              stroke="#B08B8B"
              strokeOpacity={0.12}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        {/* 渐变底 */}
        <Rect width="100%" height="100%" fill="url(#paperGrad)" />
        {/* 横线 */}
        <Rect width="100%" height="100%" fill="url(#ruling)" />
        {/* coral margin line · 左 34px */}
        <Line
          x1={marginX}
          y1={0}
          x2={marginX}
          y2="100%"
          stroke={COLORS.accent}
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      </Svg>
      <View
        style={{
          paddingTop: pad.top,
          paddingRight: pad.right,
          paddingBottom: pad.bottom,
          paddingLeft: pad.left,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2D2B6',
    backgroundColor: '#FCF5E6',
    // 外阴影（spec 0 4px 14px rgba(155,90,40,.12)）
    shadowColor: '#9B5A28',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    position: 'relative',
  },
});
