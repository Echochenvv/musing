/**
 * ProposeCard — agent 提方案等用户拍板
 *  · 用 OptionRow 渲染选项 · recommended 字段高亮一项
 *  · 设计稿来源：~/.work/swo-204-uiblock/design.html
 *  · Sprint 3.1（DEV-PLAN §5.3）：recommended 存在时卡片右上角挂 small 蜡封；OptionRow 自带 mini 蜡封
 */

import { View } from 'react-native';

import { WaxSeal } from '../components/her/WaxSeal';
import type { UIBlock } from '../uiBlock';
import { styles } from '../DetailScreen';
import { COLORS } from '../theme';
import { CardTitle, CardHint, OptionRow } from './_shared';

export function ProposeCard({
  block,
  onPickOption,
}: {
  block: UIBlock;
  onPickOption?: (label: string) => void;
}) {
  const hasRecommended = !!block.recommended;
  return (
    <View style={[styles.card, styles.cardPropose, hasRecommended && styles.cardWithWax]}>
      {hasRecommended ? (
        <View style={styles.cardWaxCorner} pointerEvents="none">
          <WaxSeal size="small" />
        </View>
      ) : null}
      <CardTitle icon="📋" color={COLORS.accentHi} text={block.title} />
      {block.options?.length ? (
        <View style={styles.optionList}>
          {block.options.map((opt, idx) => (
            <OptionRow
              key={`${opt.id}-${idx}`}
              opt={opt}
              recommended={!!opt.id && opt.id === block.recommended}
              onPress={
                opt.id ? () => onPickOption?.(`选 ${opt.id}`) : undefined
              }
            />
          ))}
        </View>
      ) : null}
      <CardHint text={block.hint} />
    </View>
  );
}
