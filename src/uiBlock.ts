/**
 * UI Block 协议解析器
 *
 * 协议来源：musing agent instructions #15「输出 UI block（前端协议）」
 * 出处：multica issue issue（2026-05-07 落地）
 *
 * 协议格式（agent 在评论末尾追加）：
 *
 *   === UI ===
 *   intent: propose|ask|progress|done   （必填）
 *   title: 短标题
 *   recommended: A
 *   options:
 *     - A: 延迟优先（91% 准确）
 *     - B: 折中（95% 准确）
 *   hint: 卡底小字
 *   nextSuggestions:                     （done 用）
 *     - 装新包看效果
 *     - 跑回归用例
 *   summary:                              （done 用）
 *     - 📦 APK: app-release.apk
 *     - ✏️ 改动: +452 / -18 行
 *   steps:                                （progress 用）
 *     - done: 拆 origin 区
 *     - now:  bundle 编译中
 *     - todo: APK 装机
 *   stepIndex: 3                          （progress 用）
 *   totalSteps: 5                         （progress 用）
 *   currentStep: bundle 编译中            （progress 用）
 *   === /UI ===
 *
 * 容错原则：
 *   - 缺字段不崩（按 intent 收敛字段集，缺失 = undefined）
 *   - 未知字段忽略（向前兼容协议扩展）
 *   - intent 无效或 block 不闭合 → 返回 null（前端不渲染卡片）
 */

export type UIBlockIntent = 'propose' | 'ask' | 'progress' | 'done';

export type UIBlockOption = {
  id: string;
  desc: string;
};

export type UIBlockSummaryItem = {
  icon?: string;
  label?: string;
  value: string;
};

export type UIBlockStepState = 'done' | 'now' | 'todo';

export type UIBlockStep = {
  state: UIBlockStepState;
  label: string;
};

export type UIBlock = {
  intent: UIBlockIntent;
  title?: string;
  hint?: string;
  recommended?: string;
  options?: UIBlockOption[];
  nextSuggestions?: string[];
  summary?: UIBlockSummaryItem[];
  steps?: UIBlockStep[];
  stepIndex?: number;
  totalSteps?: number;
  currentStep?: string;
};

const BLOCK_RE = /^===\s*UI\s*===\s*$/;
const BLOCK_END_RE = /^===\s*\/UI\s*===\s*$/;

/**
 * 从评论原文里抽出 UI block，返回剥离后的正文 + 解析结果。
 * 若没匹配到 block，uiBlock = null，textWithoutBlock = 原文。
 */
export function extractUIBlock(content: string): {
  textWithoutBlock: string;
  uiBlock: UIBlock | null;
} {
  if (!content) return { textWithoutBlock: content, uiBlock: null };
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BLOCK_RE.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return { textWithoutBlock: content, uiBlock: null };
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (BLOCK_END_RE.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  if (endIdx === -1) {
    // 没闭合，按未识别处理（不剥）
    return { textWithoutBlock: content, uiBlock: null };
  }
  const blockBody = lines.slice(startIdx + 1, endIdx).join('\n');
  const uiBlock = parseUIBlockBody(blockBody);
  // 剥离 block + 上下空行
  const before = lines.slice(0, startIdx).join('\n').replace(/\n+$/, '');
  const after = lines.slice(endIdx + 1).join('\n').replace(/^\n+/, '');
  const textWithoutBlock = [before, after].filter(Boolean).join('\n\n');
  return { textWithoutBlock, uiBlock };
}

/**
 * 解析 block 内部 YAML-like 文本。导出供测试。
 */
export function parseUIBlockBody(body: string): UIBlock | null {
  const lines = body.split('\n');
  // 用「字段头」（顶格 `key:`）切段，每段尾部可能跟若干以 2/4 空格缩进的列表项 / 续行
  type Section = { key: string; inline: string; items: string[] };
  const sections: Section[] = [];
  let cur: Section | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const head = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/.exec(line);
    if (head && !/^\s/.test(line)) {
      cur = { key: head[1].toLowerCase(), inline: head[2], items: [] };
      sections.push(cur);
      continue;
    }
    if (cur) {
      // 列表项：去掉前导空白 + `-`
      const item = line.replace(/^\s+/, '').replace(/^-\s*/, '');
      if (item) cur.items.push(item);
    }
  }

  const map: Record<string, Section> = {};
  for (const s of sections) map[s.key] = s;

  const intentRaw = (map.intent?.inline || '').trim().toLowerCase();
  const intent: UIBlockIntent | null =
    intentRaw === 'propose' || intentRaw === 'ask' ||
    intentRaw === 'progress' || intentRaw === 'done'
      ? (intentRaw as UIBlockIntent)
      : null;
  if (!intent) return null;

  const block: UIBlock = { intent };

  const inline = (k: string): string | undefined => {
    const v = map[k]?.inline?.trim();
    return v ? v : undefined;
  };

  block.title = inline('title');
  block.hint = inline('hint');
  block.recommended = inline('recommended');
  block.currentStep = inline('currentstep');
  const idx = inline('stepindex');
  const tot = inline('totalsteps');
  if (idx && /^\d+$/.test(idx)) block.stepIndex = parseInt(idx, 10);
  if (tot && /^\d+$/.test(tot)) block.totalSteps = parseInt(tot, 10);

  if (map.options?.items?.length) {
    const opts: UIBlockOption[] = [];
    for (const it of map.options.items) {
      // 形如 "A: 描述" / "A - 描述" / "A：描述"
      const m = /^([A-Za-z0-9]+)\s*[:：\-]\s*(.+)$/.exec(it);
      if (m) opts.push({ id: m[1], desc: m[2].trim() });
      else opts.push({ id: '', desc: it });
    }
    block.options = opts;
  }

  if (map.nextsuggestions?.items?.length) {
    block.nextSuggestions = map.nextsuggestions.items.map((s) => s.trim());
  }

  if (map.summary?.items?.length) {
    block.summary = map.summary.items.map(parseSummaryItem);
  }

  if (map.steps?.items?.length) {
    const steps: UIBlockStep[] = [];
    for (const it of map.steps.items) {
      const m = /^(done|now|todo)\s*[:：\-]\s*(.+)$/i.exec(it);
      if (m) {
        steps.push({
          state: m[1].toLowerCase() as UIBlockStepState,
          label: m[2].trim(),
        });
      } else {
        // 没有状态前缀则当 todo
        steps.push({ state: 'todo', label: it });
      }
    }
    block.steps = steps;
  }

  return block;
}

/**
 * 解析 summary 单项。支持两种语法：
 *   "📦 APK: app-release.apk"  → { icon:'📦', label:'APK', value:'app-release.apk' }
 *   "改动: +452 / -18"          → { label:'改动', value:'+452 / -18' }
 *   "纯文本"                    → { value:'纯文本' }
 */
function parseSummaryItem(raw: string): UIBlockSummaryItem {
  const text = raw.trim();
  // 先尝试 emoji 前缀（最多 4 字符表情）
  const emojiM = /^([^\w\s]{1,4})\s+(.*)$/u.exec(text);
  let icon: string | undefined;
  let rest = text;
  if (emojiM && /\p{Extended_Pictographic}/u.test(emojiM[1])) {
    icon = emojiM[1];
    rest = emojiM[2];
  }
  const kvM = /^([^:：]+)\s*[:：]\s*(.+)$/.exec(rest);
  if (kvM) {
    return { icon, label: kvM[1].trim(), value: kvM[2].trim() };
  }
  return { icon, value: rest };
}
