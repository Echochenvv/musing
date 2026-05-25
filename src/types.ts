/**
 * Musing 共享类型定义（App 和各 screen 之间的共识）
 *
 * 注意 AsyncStorage key 是 `thoughts_v1`，历史数据字段永远向后兼容：
 * 新增字段必须可选（`?:`），旧记录不会丢。
 */

export type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export type Thought = {
  id: string;
  createdAt: number;
  durationMs: number;
  audioUri: string;
  text: string;

  // multica 集成
  sendStatus?: SendStatus;
  issueIdentifier?: string; // 例 "issue"
  issueId?: string;
  sendError?: string;

  // 回流闭环（2026-04-30 新增 · 向后兼容）
  /** 上次同步到的 issue 状态（multica 原值）*/
  issueStatus?: string;
  /** 上次同步时间戳（ms）*/
  lastSyncedAt?: number;
  /** 上次打开详情时看到的评论数，用于"有新回复"红点 */
  lastSeenCommentCount?: number;
  /** 从 multica 拉到的最新评论数 */
  commentCount?: number;
};
