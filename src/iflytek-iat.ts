/**
 * 讯飞 IAT（Interactive Automatic Transcription）WebSocket 客户端
 * 协议文档: https://www.xfyun.cn/doc/asr/voicedictation/API.html
 *
 * 输入：PCM 16kHz 16bit mono 音频分片（base64 编码）
 * 输出：流式 partial/final 中文文字
 */

import { sha256 } from 'js-sha256';
import { Base64 } from 'js-base64';

export type IflytekConfig = {
  appid: string;
  apiKey: string;
  apiSecret: string;
};

type IATResult = {
  text: string;
  isFinal: boolean;
};

export type IATEventHandlers = {
  onResult?: (r: IATResult) => void;
  onError?: (err: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

// HMAC-SHA256（js-sha256 提供）
function hmacSha256Base64(secret: string, message: string): string {
  const hmacFn = (sha256 as unknown as { hmac: { arrayBuffer: (k: string, m: string) => ArrayBuffer } }).hmac;
  const sig = hmacFn.arrayBuffer(secret, message);
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return Base64.btoa(binary);
}

/**
 * 生成讯飞鉴权后的 WebSocket URL
 * 协议：wss://iat-api.xfyun.cn/v2/iat?host=...&date=...&authorization=...
 */
export function buildAuthUrl(apiKey: string, apiSecret: string): string {
  const host = 'iat-api.xfyun.cn';
  const path = '/v2/iat';
  const date = new Date().toUTCString(); // RFC1123 格式
  const signatureOrigin =
    `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signatureSha = hmacSha256Base64(apiSecret, signatureOrigin);

  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signatureSha}"`;
  const authorization = Base64.btoa(authorizationOrigin);

  const params = new URLSearchParams({
    authorization,
    date,
    host,
  });
  return `wss://${host}${path}?${params.toString()}`;
}

/**
 * IAT 客户端：建立连接，分片发 PCM，接收识别结果
 */
/**
 * 讯飞 IAT 是"单句识别"协议：vad_eos 或 status=2 到了这个 WebSocket 就结束。
 * 为了让 thoughts-app 拿到无缝的"连续长转写"，我们包一层会话管理：
 *   - segments 跨 session 累积（sessionOffset 做全局 sn 偏移）
 *   - 服务端 status=2 或 WebSocket 关闭时，只要用户还没主动 stop，自动重连开新 session
 *   - finish() 由 UI 层调用，才是真正结束
 */
export class IATClient {
  private ws: WebSocket | null = null;
  // 全局 sn → 文本片段，跨多个 session 累积
  private segments: Map<number, string> = new Map();
  // 每开一个新 session，把该 session 的 sn=1 映射到 sessionOffset+1，避免 session 间 sn 冲突
  private sessionOffset = 0;
  private isStopping = false; // 用户主动 finish 之后，不再自动重连
  private isFirstFrameInSession = true;
  // 单 session 已见过的最大 sn，用于 finalize 后把下一个 session offset 推过去
  private maxSnInSession = 0;
  // 重连 gap 期间的 PCM 帧暂存，WebSocket 就绪后 flush。最多保留 2 秒避免爆内存。
  private pendingFrames: string[] = [];
  private static MAX_PENDING = 50; // 50 帧 × 40ms = 2s

  constructor(
    private config: IflytekConfig,
    private handlers: IATEventHandlers = {},
  ) {}

  /** 打开连接并准备接收第一帧（首帧会在 sendAudioFrame 时带配置发出） */
  connect(): Promise<void> {
    this.isStopping = false;
    return this.openSession();
  }

  private openSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = buildAuthUrl(this.config.apiKey, this.config.apiSecret);
      this.ws = new WebSocket(url);
      this.isFirstFrameInSession = true;
      this.maxSnInSession = 0;

      this.ws.onopen = () => {
        this.handlers.onOpen?.();
        // 把重连 gap 里缓冲的帧一次性 flush 出去（第一帧带配置）
        const pending = this.pendingFrames;
        this.pendingFrames = [];
        for (const frame of pending) {
          this.sendAudioFrame(frame, false, false);
        }
        resolve();
      };
      this.ws.onmessage = (ev) => this.handleMessage(ev.data);
      this.ws.onerror = (ev: any) => {
        const err = new Error(
          `讯飞 IAT WebSocket 错误: ${ev?.message ?? 'unknown'}`,
        );
        this.handlers.onError?.(err);
        reject(err);
      };
      this.ws.onclose = () => {
        this.handlers.onClose?.();
        // 非主动停止时自动重连，让连续讲话不中断
        if (!this.isStopping) {
          this.sessionOffset += this.maxSnInSession;
          this.openSession().catch((e) => this.handlers.onError?.(e));
        }
      };
    });
  }

  /**
   * 发一帧 PCM（base64 编码）
   * isFirst/isLast 是"用户视角"的录音开始/结束——对 API 来说每个 session 都有独立首帧。
   * 我们用 isFirstFrameInSession 来管 session 级首帧，对 UI 透明。
   */
  sendAudioFrame(pcmBase64: string, _isFirstUserFrame: boolean, isLast: boolean) {
    // 重连期间 WebSocket 还在 CONNECTING → 缓冲，否则这段语音会被丢掉
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!this.isStopping && pcmBase64) {
        this.pendingFrames.push(pcmBase64);
        if (this.pendingFrames.length > IATClient.MAX_PENDING) {
          this.pendingFrames.shift();
        }
      }
      return;
    }
    const isFirstFrame = this.isFirstFrameInSession;
    this.isFirstFrameInSession = false;

    const frame: any = {
      data: {
        status: isFirstFrame ? 0 : isLast ? 2 : 1,
        format: 'audio/L16;rate=16000',
        audio: pcmBase64,
        encoding: 'raw',
      },
    };
    if (isFirstFrame) {
      frame.common = { app_id: this.config.appid };
      frame.business = {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 10000, // 讯飞上限 10s，给用户更长的思考时间
        dwa: 'wpgs',
      };
    }
    this.ws.send(JSON.stringify(frame));
  }

  /** UI 调用：真正结束录音 */
  finish() {
    this.isStopping = true;
    this.sendAudioFrame('', false, true);
  }

  /** 强制关闭 */
  close() {
    this.isStopping = true;
    this.ws?.close();
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      if (msg.code !== 0) {
        this.handlers.onError?.(
          new Error(`讯飞返回错误 code=${msg.code} sid=${msg.sid} ${msg.message}`),
        );
        return;
      }
      const data = msg.data;
      if (!data?.result) return;

      const wsArr = data.result.ws || [];
      const segmentText = wsArr
        .map((w: any) => (w.cw || []).map((c: any) => c.w).join(''))
        .join('');

      const localSn: number = data.result.sn ?? 0;
      const globalSn = this.sessionOffset + localSn;
      if (localSn > this.maxSnInSession) this.maxSnInSession = localSn;

      const pgs = data.result.pgs;
      if (pgs === 'rpl') {
        const [from, to] = (data.result.rg || [localSn, localSn]) as [
          number,
          number,
        ];
        for (let i = from; i <= to; i++) {
          this.segments.delete(this.sessionOffset + i);
        }
      }
      this.segments.set(globalSn, segmentText);

      const joined = Array.from(this.segments.keys())
        .sort((a, b) => a - b)
        .map((k) => this.segments.get(k)!)
        .join('');
      // 只有 UI 主动 stop 后的 status=2 才算"真正 final"；中间自动重连的 final 只是 session 边界
      const isTrulyFinal = data.status === 2 && this.isStopping;
      this.handlers.onResult?.({ text: joined, isFinal: isTrulyFinal });
    } catch (e: any) {
      this.handlers.onError?.(new Error(`解析讯飞响应失败: ${e?.message ?? e}`));
    }
  }
}
