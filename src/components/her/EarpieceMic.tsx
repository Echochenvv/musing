import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from 'react-native-svg';

import { COLORS } from '../../theme';

/**
 * EarpieceMic · 耳钉金属球 mic（Her 物件 · Sprint 2.1）
 *
 * 静态金属球：
 * - 主体径向渐变（35% 30% 偏移光源）：#FFB7A7 → coral #E85A4F → burnt #C8553D
 * - 中心内深暗影：rgba(40,15,8,.18) 中心 → 透明 70%
 * - 左上高光椭圆：rgba(255,240,225,.6)
 * - drop shadow：coral 0.45 alpha 8px 偏移（Android elevation / iOS shadow）
 * - 可选 socket：外围 1.2x peach 凹槽 halo
 *
 * 来源：docs/her/v2-musing-her.html `.earpiece` / `.earpiece-socket`
 */
type Props = {
  /** 金属球直径（px），默认 50 */
  size?: number;
  /** 是否绘外围 socket halo（默认 true） */
  socket?: boolean;
};

export function EarpieceMic({ size = 50, socket = true }: Props) {
  const ballSize = size;
  const socketSize = ballSize * 1.2;
  const total = socket ? socketSize : ballSize;
  const cx = total / 2;
  const cy = total / 2;
  const r = ballSize / 2;
  // inner shadow inset 8px 等比例缩放（spec 50px 球 → 8px 内缩 ≈ 16% 半径削减）
  const insetRatio = 0.16;
  const innerR = r * (1 - insetRatio);

  const wrap: ViewStyle = {
    width: total,
    height: total,
    alignItems: 'center',
    justifyContent: 'center',
    // 模拟 spec 0 8px 22px coral glow drop shadow
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 11,
    elevation: 8,
  };

  return (
    <View style={wrap}>
      <Svg width={total} height={total}>
        <Defs>
          {/* socket halo · 外围 peach 微光 */}
          <RadialGradient id="emSocket" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.15} />
            <Stop offset="60%" stopColor={COLORS.peach} stopOpacity={0.08} />
            <Stop offset="100%" stopColor={COLORS.peach} stopOpacity={0} />
          </RadialGradient>
          {/* 主体 metallic · cx=35% cy=30% 偏离中心模拟光源在左上 */}
          <RadialGradient id="emBody" cx="35%" cy="30%" r="70%">
            <Stop offset="0%" stopColor="#FFB7A7" />
            <Stop offset="55%" stopColor={COLORS.accent} />
            <Stop offset="100%" stopColor={COLORS.accentHi} />
          </RadialGradient>
          {/* 内部深度暗影 · 中心暗（spec ::before 等比例） */}
          <RadialGradient id="emDepth" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#280F08" stopOpacity={0.18} />
            <Stop offset="70%" stopColor="#280F08" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* socket halo（如果启用） */}
        {socket && (
          <Circle cx={cx} cy={cy} r={socketSize / 2} fill="url(#emSocket)" />
        )}
        {/* 主体 metallic */}
        <Circle cx={cx} cy={cy} r={r} fill="url(#emBody)" />
        {/* 内部深度暗影（inset 16% 半径） */}
        <Circle cx={cx} cy={cy} r={innerR} fill="url(#emDepth)" />
        {/* 左上高光椭圆（spec ::after 22-44% 18-42% blur 2px → 用透明白填充近似） */}
        <Ellipse
          cx={cx - r * 0.28}
          cy={cy - r * 0.32}
          rx={r * 0.34}
          ry={r * 0.24}
          fill="#FFF0E1"
          fillOpacity={0.6}
        />
      </Svg>
    </View>
  );
}
