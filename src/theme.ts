/**
 * Musing visual tokens · single source of truth
 *
 * Warm "Her" palette — coral / cream / peach / mauve.
 * See `docs/her/v2-musing-her.html` for the live final design.
 */

export const COLORS = {
  // 底层（Her cream 暖化）
  bg: '#F5E6D3', // warm cream · 主背景
  bgSub: '#FAF3E7', // cream-white · card surface（比 bg 更白，制造抬升感）
  border: '#E0D5C2', // 暖米色描边
  codeSurface: '#E3D9C5', // 代码块底（保留原值，暖系本就和谐）
  ink: '#2C2826', // charcoal · 永不纯黑
  inkSub: '#6B5F58', // warm gray · 次文字
  inkMute: '#B08B8B', // mauve · 弱提示/列表标签

  // 主品牌色（Theodore 衬衫 coral red）
  accent: '#E85A4F',
  accentHi: '#C8553D', // 录音中 burnt coral

  // 状态语义色
  success: '#8A9B6F', // 暖化绿（不再用 #788c5d 冷绿）
  media: '#7BA0BE', // 仅在屏内/playback 蓝
  danger: '#C8553D', // 同 accentHi

  // 半透明派生（pill 底色用，coral 派生升级）
  accentBg: 'rgba(232, 90, 79, 0.12)',
  mediaBg: 'rgba(123, 160, 190, 0.14)',
  successBg: 'rgba(138, 155, 111, 0.16)',
  dangerBg: 'rgba(200, 85, 61, 0.10)',

  // === 新增 5 个语义 token（Her 物件层用）===
  peach: '#F4B89D', // 装饰、hero 高光
  rose: '#E8B4A0', // me-bubble 渐变
  amber: '#D49B7A', // progress / 强调 / blinds 木纹
  mauve: '#B08B8B', // 次要文本/分隔（与 inkMute 同值，语义分层）
  paper: '#FBF1E0', // 信纸 letter 容器底
} as const;

export const FONT_SERIF_BOLD = 'SourceSerif4-Semibold';
export const FONT_CN = 'LXGWNeoXiHei';

/**
 * 把 multica issue 的 status 字符串映射为显示态
 * multica 已知状态：todo / in_progress / in_review / done / cancelled
 */
export type PillVariant = 'todo' | 'doing' | 'review' | 'done' | 'muted';

export function pillFromStatus(status: string | null | undefined): {
  variant: PillVariant;
  label: string;
} {
  switch ((status || '').toLowerCase()) {
    case 'todo':
    case 'backlog':
      return { variant: 'todo', label: '待处理' };
    case 'in_progress':
    case 'doing':
      return { variant: 'doing', label: '处理中' };
    case 'in_review':
    case 'review':
      return { variant: 'review', label: '待确认' };
    case 'done':
    case 'completed':
      return { variant: 'done', label: '已完成' };
    case 'cancelled':
    case 'canceled':
      return { variant: 'muted', label: '已取消' };
    default:
      return { variant: 'muted', label: status || '未知' };
  }
}

export function pillColors(variant: PillVariant): {
  fg: string;
  bg: string;
  border?: string;
} {
  switch (variant) {
    case 'todo':
      return { fg: COLORS.inkMute, bg: 'transparent', border: COLORS.inkMute };
    case 'doing':
      // issue · spec docs/her/v2-musing-her.html .pill.progress (amber 暖橙)
      // 旧值 media blue 与 v2 home 列表 progress 卡冲突
      return {
        fg: '#9a6b48', // spec line 117
        bg: 'rgba(212,155,122,0.20)',
      };
    case 'review':
      return { fg: COLORS.accent, bg: COLORS.accentBg };
    case 'done':
      return { fg: COLORS.success, bg: COLORS.successBg };
    case 'muted':
    default:
      return { fg: COLORS.inkMute, bg: COLORS.bgSub };
  }
}

/**
 * 相对时间（"刚才 / 2 分钟前 / 2 小时前 / 昨天 / MM-DD"）
 */
export function relativeTime(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return '刚才';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const days = Math.floor(hr / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  const d = new Date(t);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
