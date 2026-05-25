/**
 * AskCard — agent 问用户决策（与 ProposeCard 结构同，意图不同）
 *
 * Sprint 3.10 ① · 移除 SineBand 头部 —— speaking-now 改为 DetailScreen
 * convo 区独立块（spec .speaking-now 是与 AskCard 同列平排的独立条，
 * 不绑死在 AskCard 内，progress / done 时也能复用）
 */

import { View } from 'react-native';

import type { UIBlock } from '../uiBlock';
import { styles } from '../DetailScreen';
import { COLORS } from '../theme';
import { CardTitle, CardHint, OptionRow } from './_shared';

export function AskCard({
  block,
  onPickOption,
}: {
  block: UIBlock;
  onPickOption?: (label: string) => void;
}) {
  return (
    <View style={[styles.card, styles.cardAsk]}>
      <CardTitle icon="❓" color={COLORS.accentHi} text={block.title} />
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
