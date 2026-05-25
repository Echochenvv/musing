/**
 * UI Block 卡片渲染信号
 *
 * 抓手：取**最新一条**评论的 UI block 作为单点真理，
 * 4 类 Card 互斥渲染，没块就不渲染（前端按设计稿规约）。
 *
 * 与 src/uiBlock.ts 配套，由 DetailScreen.tsx 在 CommentRow 渲染时消费。
 */

import { extractUIBlock, UIBlock } from './uiBlock';
import { MulticaComment } from './multica';

/**
 * 取最新一条评论的 UI block。
 * comments 已按 createdAt 升序，所以最末项即最新。
 * 不区分 author（agent / member 都允许带 block，方便测试 mock）。
 */
export function latestUIBlock(
  comments: MulticaComment[] | null | undefined,
): { uiBlock: UIBlock; commentId: string } | null {
  if (!comments || comments.length === 0) return null;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    const { uiBlock } = extractUIBlock(c.content || '');
    if (uiBlock) return { uiBlock, commentId: c.id };
  }
  return null;
}
