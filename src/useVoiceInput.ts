/**
 * useVoiceInput · 语音输入 hook（Musing 主链路的复用抓手）
 *
 * 封装：@siteed/audio-studio 录音 + 讯飞 IAT 流式转字 + 计时
 * 详情页追问、未来其他输入场景都用这个 hook
 *
 * 使用方式：
 *   const voice = useVoiceInput({ onFinal: (text) => setDraft(text) });
 *   voice.start();      // 开始录音
 *   voice.stop();       // 停止
 *   voice.isRecording   // 状态
 *   voice.elapsed       // 已录时长 ms
 *   voice.liveText      // 实时转字
 *
 * 注意：
 * - 每个 useVoiceInput 调用会独立持有 IATClient 实例；但底层 useAudioRecorder
 *   来自 @siteed/audio-studio，同一 app session 内多处调用可能冲突，当前只在
 *   DetailScreen 里用（App 主屏的录音走 App.tsx 自己的 useAudioRecorder 实例，
 *   两处不会同时 active：主屏录音时详情页未 mount，反之亦然）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioModule } from 'expo-audio';
import { useAudioRecorder } from '@siteed/audio-studio';
import { IATClient } from './iflytek-iat';

export type VoiceInputResult = {
  text: string;
  durationMs: number;
  audioUri: string;
};

export type VoiceInputHandle = {
  isRecording: boolean;
  elapsed: number; // ms
  liveText: string;
  start: () => Promise<void>;
  stop: () => Promise<VoiceInputResult | null>;
};

export type VoiceInputOpts = {
  iflytek: { appid: string; apiKey: string; apiSecret: string };
  /** 转字完成后（stop 成功后）触发 */
  onFinal?: (result: VoiceInputResult) => void;
  /** 录音/IAT 异常 */
  onError?: (e: Error) => void;
};

export function useVoiceInput(opts: VoiceInputOpts): VoiceInputHandle {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState('');

  const iatRef = useRef<IATClient | null>(null);
  const isFirstFrameRef = useRef(true);
  const startAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalTextRef = useRef('');

  const { startRecording, stopRecording } = useAudioRecorder();

  // unmount 清理：如果组件被卸载时还在录音，停掉避免 native 资源泄露
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (iatRef.current) {
        try {
          iatRef.current.close();
        } catch {}
        iatRef.current = null;
      }
    };
  }, []);

  const start = useCallback(async () => {
    try {
      // 0. 配置守卫：未填讯飞凭据 → 提前报错，引导去设置页（避免 IAT 崩在 buildAuthUrl）
      if (
        !opts.iflytek.appid ||
        !opts.iflytek.apiKey ||
        !opts.iflytek.apiSecret
      ) {
        opts.onError?.(
          new Error(
            '讯飞凭据未配置。打开右上角 ⚙️ 设置页，把 APPID / API Key / API Secret 填上。',
          ),
        );
        return;
      }

      // 1. 确认麦克风权限（首次调用时系统会弹授权）
      const mic = await AudioModule.requestRecordingPermissionsAsync();
      if (!mic.granted) {
        opts.onError?.(new Error('麦克风权限被拒'));
        return;
      }

      // 2. 建 IAT WebSocket
      finalTextRef.current = '';
      setLiveText('');
      isFirstFrameRef.current = true;

      const client = new IATClient(
        {
          appid: opts.iflytek.appid,
          apiKey: opts.iflytek.apiKey,
          apiSecret: opts.iflytek.apiSecret,
        },
        {
          onResult: ({ text, isFinal }) => {
            setLiveText(text);
            if (isFinal) finalTextRef.current = text;
          },
          onError: (err) => {
            opts.onError?.(err);
          },
        },
      );
      iatRef.current = client;
      await client.connect();

      // 3. 开 PCM 录音，onAudioStream 把 base64 帧投给 IAT
      await startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 40, // 讯飞推荐 40-60ms
        onAudioStream: async (event) => {
          const data = event.data;
          if (typeof data !== 'string') return;
          const isFirst = isFirstFrameRef.current;
          isFirstFrameRef.current = false;
          iatRef.current?.sendAudioFrame(data, isFirst, false);
        },
      });

      startAtRef.current = Date.now();
      setElapsed(0);
      setIsRecording(true);
      tickRef.current = setInterval(() => {
        setElapsed(Date.now() - startAtRef.current);
      }, 100);
    } catch (e: any) {
      opts.onError?.(e);
    }
  }, [opts, startRecording]);

  const stop = useCallback(async (): Promise<VoiceInputResult | null> => {
    try {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setIsRecording(false);

      // 1. 停 PCM 录音拿 wav
      let fileUri = '';
      try {
        const result = await stopRecording();
        fileUri = result?.fileUri ?? '';
      } catch {}

      // 2. 发尾帧让 IAT 收尾
      iatRef.current?.finish();

      // 3. 等 IAT 最终结果
      await new Promise((r) => setTimeout(r, 800));
      iatRef.current?.close();
      iatRef.current = null;

      const durationMs = Date.now() - startAtRef.current;
      const text = finalTextRef.current || liveText || '';
      const res: VoiceInputResult = { text, durationMs, audioUri: fileUri };
      setLiveText('');
      finalTextRef.current = '';
      opts.onFinal?.(res);
      return res;
    } catch (e: any) {
      opts.onError?.(e);
      return null;
    }
  }, [opts, stopRecording, liveText]);

  return { isRecording, elapsed, liveText, start, stop };
}
