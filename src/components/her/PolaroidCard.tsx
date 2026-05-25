import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { COLORS } from '../../theme';
import { WaxSeal } from './WaxSeal';

/**
 * PolaroidCard · 主屏 done thought 拍立得照片容器（Her 物件 · Sprint 3.6）
 *
 * 视觉来源：docs/her/v2-musing-her.html `.thought-card.polaroid`
 *  - background: linear-gradient(180deg, #FFFCF4, #FAF3E7)
 *  - border 1px #E5DCC8 + radius 4
 *  - padding 14 / 14 / 22（底部多 8px 留白做"照片底白边"）
 *  - transform: rotate(-1.2deg)
 *  - 双层 box-shadow: 棕色长投 + 暖色短投
 *  - ::before 顶部胶带条（60×14, 棕褐 0.4 alpha, rotate(-2deg), multiply）
 *  - 右上角 wax seal 出头（top: -14, right: 14）
 *
 * RN 不支持 ::before / mix-blend-mode → 用绝对定位 View 复刻胶带，
 * 用 react-native-svg LinearGradient 喂 cream 渐变。
 */
type Props = {
  children: ReactNode;
  /** 蜡封字符，默认 'M'；不要蜡封传 null */
  wax?: string | null;
  /** 旋转角度（deg），默认 -1.2°，传 0 = 不歪 */
  rotate?: number;
  /** 容器外样式（margin 等） */
  style?: ViewStyle;
};

const TAPE_WIDTH = 60;
const TAPE_HEIGHT = 14;

export function PolaroidCard({
  children,
  wax = 'M',
  rotate = -1.2,
  style,
}: Props) {
  return (
    <View style={[styles.outer, { transform: [{ rotate: `${rotate}deg` }] }, style]}>
      {/* cream 上下渐变背景层（svg 喂） */}
      <View style={styles.bg} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="polGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#FFFCF4" stopOpacity={1} />
              <Stop offset="100%" stopColor="#FAF3E7" stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#polGrad)" />
        </Svg>
      </View>

      {/* 顶部棕色胶带条（spec ::before · multiply 近似为低 alpha） */}
      <View style={styles.tape} pointerEvents="none" />

      {/* children 内容（保持原 card 结构 / 文字 / 操作） */}
      <View style={styles.inner}>{children}</View>

      {/* 右上角 wax seal 出头 */}
      {wax ? (
        <View style={styles.waxCorner} pointerEvents="none">
          <WaxSeal size="small" letter={wax} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5DCC8',
    borderRadius: 4,
    overflow: 'visible',
    // 双层阴影：棕色长投 + 暖色短投
    shadowColor: '#9B5A28',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
  },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tape: {
    position: 'absolute',
    top: 6,
    left: '50%',
    width: TAPE_WIDTH,
    height: TAPE_HEIGHT,
    marginLeft: -TAPE_WIDTH / 2,
    backgroundColor: 'rgba(212,155,122,0.35)',
    borderRadius: 2,
    transform: [{ rotate: '-2deg' }],
    zIndex: 2,
  },
  inner: {
    paddingHorizontal: 14,
    paddingTop: 22, // 给胶带条让位
    paddingBottom: 22, // spec 14 14 22 · 加宽底边做照片白边
  },
  waxCorner: {
    position: 'absolute',
    top: -14,
    right: 14,
    zIndex: 3,
  },
});

// silence unused import warning when COLORS not used
void COLORS;
