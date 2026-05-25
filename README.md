# Musing

A voice-first thought capture app: speak a thought → live transcribed → posted as a tracker issue → optional AI agent processing → conversational follow-up.

> 中文：「说一句话 → 转成文字 → 落为 tracker issue → 指派给 agent 处理 → 详情页对话式追问」的语音想法采集 app。

The app's "Her"-aesthetic visual layer (voice waveforms, polaroid card, OS1 LED button, blinds light, wax seal) is inspired by Spike Jonze's _Her_ (2013).

## Architecture

```
Phone speaks → iFlytek IAT (streaming WS) → AsyncStorage (local-first)
            → user taps ✈️ Send
            → POST {MULTICA_SERVER_URL}/api/issues  (assigned to agent)
            → agent or autopilot processes the issue
            → comments stream back into the detail screen
```

## Tech stack

- React Native 0.81 + Expo SDK 54 (new architecture / Fabric / TurboModule)
- Recording: `@siteed/audio-studio`
- Transcription: 讯飞 IAT (iFlytek streaming WebSocket, persistent session)
- Backend: a Linear-style issue tracker that exposes a REST API. The reference contract is captured at the top of `src/multica.ts`. Any tracker that implements the same `/api/issues`, `/api/issues/:id`, `/api/issues/:id/comments`, `/api/issues/:id/task-runs` shape works — wire your own server URL via the in-app Settings screen.
- Local store: `@react-native-async-storage/async-storage`

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials (in-app Settings page)

Musing intentionally has **no `.env` support**. Every install must be configured at runtime via the in-app Settings screen — credentials never live in the source tree or the APK.

After installing the app, tap the **⚙️ gear icon** at the top-right of the home screen and fill in:

| Section | Fields |
|---|---|
| **iFlytek IAT** | APPID / API Key / API Secret. Register at <https://www.xfyun.cn>, create an "实时语音转写" app. |
| **Multica** | Server URL / Bearer token (`mul_...`) / Workspace UUID. |
| **Default assignee** | Agent or member UUID that newly created issues are assigned to (and Agent / Member toggle). |

Tap **测试连接 (Test connection)** to verify, then **保存 (Save)** to persist.

Storage:

- Sensitive fields (API keys, tokens) → OS-level encrypted store (iOS Keychain / Android Keystore).
- Non-sensitive fields (server URL, IDs) → AsyncStorage.
- Nothing is uploaded anywhere; values stay on the device.

> Reinstalling the app on Android clears the encrypted store (Android lifecycle), so you'll re-enter the values once after a reinstall. Keep your config notes somewhere safe.

### 3. Develop

```bash
./dev.sh              # start Metro (LAN mode, auto-detects host IP)
./dev.sh connect      # adb-connect over Wi-Fi (phone needs Wireless Debugging on)
./dev.sh launch       # send the deep link so the app loads the LAN bundle
```

### 4. Release build

```bash
cd android && ./gradlew :app:assembleRelease
```

The release APK lives at `android/app/build/outputs/apk/release/app-release.apk`.

## Project layout

```
App.tsx                    # Home screen: recording + thought cards + send
src/
  DetailScreen.tsx         # Detail screen: status pill + timeline + chat + compose
  HerLabScreen.tsx         # Dev-only "Her Lab" component gallery
  multica.ts               # Tracker REST client (REST contract documented inline)
  iflytek-iat.ts           # iFlytek IAT WebSocket client (streaming + continuous session)
  useVoiceInput.ts         # Voice input hook (record + transcribe + timer)
  uiBlock.ts               # UI-block protocol parser for agent comment cards
  cardSignal.ts            # propose / ask / progress / done card dispatch
  theme.ts                 # Brand color & font tokens
  types.ts                 # Shared types
  cards/                   # 4 card components rendered from agent UI blocks
  components/her/          # "Her" visual primitives (BreathGlow, BlindsLight,
                           #  EarpieceMic, RippleAura, SineBand, VoiceEnvelope,
                           #  WaxSeal, LetterPaper, PolaroidCard, OS1LedButton, …)
  config.ts                # Runtime credential store (SecureStore + AsyncStorage)
  SettingsScreen.tsx       # ⚙️ Settings page (in-app credential entry)
assets/fonts/              # Source Serif 4 SemiBold + LXGW Neo XiHei
docs/her/                  # "Her" visual design notes & sprint references
dev.sh / snap.sh           # Dev / screenshot helpers
```

## UI-block protocol

The detail screen renders four card types based on a structured block agents append to their comments:

```
=== UI ===
intent: propose | ask | progress | done
title: <short title>
options:
  - A: <option text>
  - B: <option text>
recommended: A
hint: <small hint text>
=== /UI ===
```

See `src/uiBlock.ts` for the full schema (`steps` / `stepIndex` / `summary` / `nextSuggestions` for `progress` and `done`).

## License

[MIT](./LICENSE) — see `LICENSE` for the full text.

## Acknowledgements

- _Her_ (2013, dir. Spike Jonze) for the visual mood
- 霞鹜新楷 — [LXGW Neo XiHei](https://github.com/lxgw/LxgwNeoXiHei) (open-source SC font)
- Adobe — [Source Serif 4](https://github.com/adobe-fonts/source-serif) (SIL Open Font License)
- 讯飞 IAT — speech-to-text service
