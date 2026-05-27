/**
 * Multica REST 客户端 — 手机端直调 multica API
 *
 * 契约（全部抓自真实 CLI 请求 · 2026-04-30）：
 *   POST {serverUrl}/api/issues
 *   GET  {serverUrl}/api/issues/{identifier}
 *   GET  {serverUrl}/api/issues/{identifier}/task-runs
 *   GET  {serverUrl}/api/issues/{identifier}/comments
 *   POST {serverUrl}/api/issues/{identifier}/comments   body: { content }
 *
 *   共用 headers：
 *     Authorization: Bearer {token}
 *     X-Workspace-Id: {workspaceId}
 *     Content-Type: application/json (POST)
 *
 *   path param 用 **identifier**（issue）或 uuid 皆可；我们用 identifier，和 CLI 一致。
 */

export type AssigneeType = 'agent' | 'member';
export type AuthorType = 'agent' | 'member';

export type MulticaConfig = {
  serverUrl: string; // e.g. https://your-multica-server.example.com
  token: string; // Bearer token (mul_...)
  workspaceId: string; // UUID
  /** 默认指派人（新建 issue 时兜底用） */
  defaultAssigneeId?: string;
  defaultAssigneeType?: AssigneeType;
};

export type MulticaIssue = {
  id: string;
  identifier: string; // 人类可读，例 issue
  number: number;
  title: string;
  status: string;
  assigneeId?: string | null;
  assigneeType?: AssigneeType | null;
};

export type MulticaIssueDetail = MulticaIssue & {
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MulticaTaskRun = {
  id: string;
  issueId: string;
  agentId: string;
  status: string; // pending / dispatched / running / completed / failed
  createdAt: string;
  dispatchedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  /** agent 结构化产出摘要；字段由 agent 自定义，常见 output/pr_url/session_id/work_dir */
  result?: Record<string, unknown> | null;
};

export type MulticaComment = {
  id: string;
  issueId: string;
  authorId: string;
  authorType: AuthorType;
  content: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  /** 附件数组，形态由服务端定；v1 前端透传展示 */
  attachments?: unknown[];
  reactions?: unknown[];
};

export class MulticaClient {
  constructor(private config: MulticaConfig) {}

  private baseUrl(): string {
    return this.config.serverUrl.replace(/\/$/, '');
  }

  private headers(withContentType = false): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.config.token}`,
      'X-Workspace-Id': this.config.workspaceId,
    };
    if (withContentType) h['Content-Type'] = 'application/json';
    return h;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts?: { body?: unknown; label?: string },
  ): Promise<T> {
    const resp = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: this.headers(method === 'POST'),
      body: opts?.body != null ? JSON.stringify(opts.body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(
        `multica ${opts?.label ?? path} 失败 HTTP ${resp.status}: ${text.slice(0, 200)}`,
      );
    }
    return (await resp.json()) as T;
  }

  async createIssue(input: {
    title: string;
    description?: string;
    /** 覆盖默认指派人；不传则用 config.defaultAssignee* */
    assigneeId?: string;
    assigneeType?: AssigneeType;
  }): Promise<MulticaIssue> {
    const assigneeId = input.assigneeId ?? this.config.defaultAssigneeId;
    const assigneeType =
      input.assigneeType ?? this.config.defaultAssigneeType ?? 'agent';
    const body: Record<string, unknown> = {
      title: input.title,
      description: input.description ?? '',
    };
    if (assigneeId) {
      body.assignee_id = assigneeId;
      body.assignee_type = assigneeType;
    }
    const data = await this.request<any>('POST', '/api/issues', {
      body,
      label: 'createIssue',
    });
    return {
      id: data.id,
      identifier: data.identifier,
      number: data.number,
      title: data.title,
      status: data.status,
      assigneeId: data.assignee_id ?? null,
      assigneeType: data.assignee_type ?? null,
    };
  }

  /** 拉 issue 详情 · 用于详情页顶部展示状态和原始想法 */
  async getIssue(identifier: string): Promise<MulticaIssueDetail> {
    const data = await this.request<any>(
      'GET',
      `/api/issues/${encodeURIComponent(identifier)}`,
      { label: 'getIssue' },
    );
    return {
      id: data.id,
      identifier: data.identifier,
      number: data.number,
      title: data.title,
      status: data.status,
      description: data.description ?? null,
      assigneeId: data.assignee_id ?? null,
      assigneeType: data.assignee_type ?? null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /** agent 执行历史 · 用于详情页中段时间线 + 产出摘要 */
  async listRuns(identifier: string): Promise<MulticaTaskRun[]> {
    const data = await this.request<any>(
      'GET',
      `/api/issues/${encodeURIComponent(identifier)}/task-runs`,
      { label: 'listRuns' },
    );
    const arr: any[] = Array.isArray(data) ? data : (data?.runs ?? []);
    return arr.map((r) => ({
      id: r.id,
      issueId: r.issue_id,
      agentId: r.agent_id,
      status: r.status,
      createdAt: r.created_at,
      dispatchedAt: r.dispatched_at ?? null,
      startedAt: r.started_at ?? null,
      completedAt: r.completed_at ?? null,
      error: r.error ?? null,
      result: r.result ?? null,
    }));
  }

  /** 评论列表 · 按 createdAt 升序返回；最早的在前 */
  async listComments(identifier: string): Promise<MulticaComment[]> {
    const data = await this.request<any>(
      'GET',
      `/api/issues/${encodeURIComponent(identifier)}/comments`,
      { label: 'listComments' },
    );
    const arr: any[] = Array.isArray(data) ? data : (data?.comments ?? []);
    return arr
      .map((c) => ({
        id: c.id,
        issueId: c.issue_id,
        authorId: c.author_id,
        authorType: c.author_type as AuthorType,
        content: c.content,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        parentId: c.parent_id ?? null,
        attachments: c.attachments ?? [],
        reactions: c.reactions ?? [],
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** 拉 issue 列表 · 首页 focus 时调用刷新卡片状态 */
  async listIssues(): Promise<MulticaIssue[]> {
    const data = await this.request<any>('GET', '/api/issues', {
      label: 'listIssues',
    });
    const arr: any[] = Array.isArray(data) ? data : (data?.issues ?? []);
    return arr.map((d) => ({
      id: d.id,
      identifier: d.identifier,
      number: d.number,
      title: d.title,
      status: d.status,
      assigneeId: d.assignee_id ?? null,
      assigneeType: d.assignee_type ?? null,
    }));
  }

  /** 发评论 · 详情页底部追问框调用；成功后调用方应 re-listComments 刷新 */
  async addComment(
    identifier: string,
    content: string,
  ): Promise<MulticaComment> {
    const data = await this.request<any>(
      'POST',
      `/api/issues/${encodeURIComponent(identifier)}/comments`,
      { body: { content }, label: 'addComment' },
    );
    return {
      id: data.id,
      issueId: data.issue_id,
      authorId: data.author_id,
      authorType: data.author_type as AuthorType,
      content: data.content,
      createdAt: data.created_at,
      updatedAt: data.updated_at ?? data.created_at,
      parentId: data.parent_id ?? null,
      attachments: data.attachments ?? [],
      reactions: data.reactions ?? [],
    };
  }
}

/**
 * 从 thought 文本生成 issue 标题：前 30 字 + "..."
 * 若原文 <= 30 字则不加省略号
 */
export function deriveIssueTitle(text: string): string {
  const clean = (text || '').trim();
  if (!clean) return '（空白想法）';
  if (clean.length <= 30) return clean;
  return clean.slice(0, 30) + '...';
}
