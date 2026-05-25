/**
 * 共用语音可视化 path · VoiceEnvelope (C 区) + VoiceSignature (E 区)
 *
 * 来源：docs/her/voice-viz-lab.html
 *   - C 区 .env-stage path d (env-bg + env-fg)
 *   - E 区 .silhouette-stage path d
 *
 * 共用 viewBox 0 0 400 80。两条 path 形态不同（envelope 是音量包络
 * 上下双轨，signature 是声纹海拔单峰填充），但渲染抓手相同：
 * 单 svg + 单 path，envelope 加 clip 扫描动画/scan head，signature 加渐变 fill。
 */

export const VIEW_W = 400;
export const VIEW_H = 80;

// C 区 envelope · 上下双轨包络 · 适合 playback 扫描
export const PATH_ENVELOPE =
  'M0,40 ' +
  'C20,38 30,30 40,32 C50,35 60,15 70,18 C80,22 90,8 100,12 ' +
  'C110,16 120,28 130,25 C140,22 150,10 160,14 C170,18 180,32 190,30 ' +
  'C200,28 210,18 220,20 C230,23 240,38 250,35 C260,32 270,14 280,16 ' +
  'C290,18 300,28 310,30 C320,32 330,22 340,24 C350,26 360,36 370,34 ' +
  'C380,32 390,40 400,40 ' +
  'L400,80 L0,80 Z';

// E 区 signature · 锯齿状声纹海拔 · 适合 done 静态贴
export const PATH_SIGNATURE =
  'M0,55 ' +
  'L8,52 L14,42 L20,46 L26,30 L32,38 L40,18 L46,28 L54,12 L62,20 ' +
  'L68,8 L76,18 L84,32 L92,22 L100,42 L108,34 L116,52 L124,40 L132,58 L140,46 ' +
  'L148,28 L156,38 L164,18 L172,28 L182,14 L190,24 L198,8 L206,18 L214,28 L222,22 ' +
  'L230,40 L238,32 L246,52 L254,42 L262,58 L270,46 L278,32 L286,42 L294,22 L302,32 ' +
  'L312,16 L320,26 L328,40 L336,30 L344,48 L352,38 L360,28 L368,38 L376,52 L384,46 ' +
  'L392,58 L400,52 L400,80 L0,80 Z';
