/**
 * DoneCard — 任务闭环（Sprint 3 灵魂卡）
 *
 * Sprint 3.4 重写：
 *  · 整体容器从 styles.card 换成 <LetterPaper>（手写信纸 + 27px 横线 + coral margin line）
 *  · 右上角悬挂 <WaxSeal huge letter="M">（60px 大蜡封 -12° 旋）
 *  · summary + suggest 之后，底部挂 <VoiceSignature> 当作品签名
 *  · summary[] 展开为 SummaryRow · nextSuggestions 展示为 chip
 */

import { Pressable, Text, View } from 'react-native';

import { LetterPaper } from '../components/her/LetterPaper';
import { VoiceSignature } from '../components/her/VoiceSignature';
import { WaxSeal } from '../components/her/WaxSeal';
import type { UIBlock, UIBlockSummaryItem } from '../uiBlock';
import { styles, MarkdownText } from '../DetailScreen';
import { CardHint } from './_shared';

export function DoneCard({
  block,
  onPickOption,
}: {
  block: UIBlock;
  onPickOption?: (label: string) => void;
}) {
  return (
    <View style={styles.doneStage}>
      <LetterPaper style={styles.doneLetter}>
        {/* Sprint 3.10 ③ · letterhead 三件套（spec .letter .head + .company + .rule）*/}
        <Text style={styles.letterHead}>
          <Text style={styles.letterHeadOrnate}>⊹ </Text>
          beautiful handwritten letters · by musing
          <Text style={styles.letterHeadOrnate}> ⊹</Text>
        </Text>
        {block.title ? (
          <View style={{ paddingRight: 56 }}>
            <MarkdownText text={block.title} style={styles.letterCompany} />
          </View>
        ) : null}
        <View style={styles.letterRule} />

        {block.summary?.length ? (
          <View style={styles.summaryBox}>
            {block.summary.map((s, i) => (
              <SummaryRow key={i} item={s} />
            ))}
          </View>
        ) : null}

        {block.nextSuggestions?.length ? (
          <View style={styles.suggestRow}>
            {block.nextSuggestions.map((sug, i) => (
              <Pressable
                key={`${sug}-${i}`}
                onPress={() => onPickOption?.(sug)}
                style={({ pressed }) => [
                  styles.suggestChip,
                  pressed && styles.suggestChipPressed,
                ]}
              >
                <Text style={styles.suggestText} numberOfLines={1}>
                  {sug}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <CardHint text={block.hint} />

        {/* Sprint 3.4 + 3.10 ⑧ · 信纸底部 VoiceSignature 嵌入式（去 plate 装饰，加 sig-label + monospace stats）*/}
        <View style={styles.doneSignatureWrap}>
          <VoiceSignature embedded />
        </View>
      </LetterPaper>

      {/* Sprint 3.4 · 信纸右上角 huge 蜡封 M 出头 */}
      <View style={styles.doneWaxCorner} pointerEvents="none">
        <WaxSeal size="huge" letter="M" />
      </View>
    </View>
  );
}

function SummaryRow({ item }: { item: UIBlockSummaryItem }) {
  // Sprint 3.10 ⑥ · spec letter-summary：左 lbl(warm-gray italic) + 右 val(burnt 加粗) space-between · 行间 dashed mauve
  return (
    <View style={styles.summaryRowSpaced}>
      <Text style={styles.summaryLblSpec}>
        {item.icon ? `${item.icon} ` : ''}
        {item.label || '·'}
      </Text>
      <View style={styles.summaryValSpecWrap}>
        <MarkdownText text={item.value} style={styles.summaryValSpec} />
      </View>
    </View>
  );
}
