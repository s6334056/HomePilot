# HomePilot Setup Guide

This document describes how to prepare, configure, run, test, and deploy HomePilot.

このドキュメントでは、HomePilotをゼロからセットアップし、起動・動作確認・実機確認・本番デプロイまで行うための手順を説明します。

---

# English

## 1. Purpose

HomePilot consists of several components that run on different environments.

The basic architecture is:

```text
PC / Smartphone / Even Realities G2
                │
                ▼
        HomePilot PWA / EvenHub
                │
                ▼
         HomePilot Gateway
                │
        ┌───┴────┐
        ▼                ▼
   Home PC Files      OpenCode
                          │
                          ▼
                    Cloud / Local LLM
```

For voice input:

```text
PWA / G2
   │
   ▼
Gateway
   │
   ▼
Cloudflare Speech Worker
   │
   ▼
Workers AI / Whisper
```

A normal development environment therefore requires several services to be available at the same time.

---

## 2. Prerequisites

HomePilot was developed primarily on Windows.

The following software is required or used depending on the feature being tested.

### Required for normal development

- Windows 11
- Git
- Node.js
- npm
- A modern web browser

### Required for HomePilot Gateway

- Node.js
- HomePilot repository
- A local filesystem directory to expose to HomePilot

### Required for Agent functionality

- OpenCode Server
- An available LLM provider
- Cloud or Local LLM configuration

### Required for voice input

- Cloudflare account
- Cloudflare Workers / Workers AI
- Wrangler

### Required for G2 development

- EvenHub environment
- Even Realities G2
- EvenHub SDK / CLI as required by the project

### Required for Quick Tunnel / remote device testing

- `cloudflared.exe`

---

## 3. Clone the Repository

Clone the repository:

```powershell
git clone <HomePilot repository>
cd HomePilot
```

Install dependencies separately for each Node.js application.

HomePilot does not use a single root-level npm workspace.

The main application directories are:

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   └── evenhub/
├── gateway/
├── launcher/
├── speech-worker/
└── tools/
```

---

## 4. Recommended Directory Layout

The current launcher assumes the following general layout:

```text
HomePilot/
├── explorer/
├── gateway/
├── launcher/
├── speech-worker/
└── tools/
    └── cloudflared.exe
```

The launcher looks for `cloudflared.exe` at:

```text
tools\cloudflared.exe
```

The Gateway listens on:

```text
127.0.0.1:51887
```

OpenCode Server is expected at:

```text
127.0.0.1:4096
```

These values are part of the current implementation.

---

## 5. Home PC Test Directory

For development, create a dedicated directory for HomePilot to expose.

Example:

```powershell
mkdir C:\HomePilotTest
echo "Hello HomePilot" > C:\HomePilotTest\test.txt
mkdir C:\HomePilotTest\docs
```

The Gateway must be configured so that this directory becomes the HomePilot filesystem root.

Do not use an unrestricted system directory as the Gateway root.

The Gateway explicitly protects access outside the configured root.

---

## 6. HomePilot Gateway

The Gateway is the local service running on the home PC.

It provides controlled access to:

- Home PC filesystem
- OpenCode
- Speech Worker

The Gateway currently listens on:

```text
http://127.0.0.1:51887
```

### Manual startup

```powershell
cd gateway
npm install
npm start
```

The Gateway generates an authentication token when it starts.

The token is required by the PWA/G2 client.

---

## 7. Gateway API Basic Test

After starting the Gateway, verify that it is responding.

Example:

```powershell
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/health
```

Verify the configured filesystem root:

```powershell
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/fs/root
```

Verify directory access:

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\HomePilotTest"
```

Verify file access:

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/file?path=C:\HomePilotTest\test.txt"
```

Verify authentication:

```powershell
curl http://127.0.0.1:51887/api/health
```

This request should fail because no authorization token is supplied.

Also verify that access outside the configured root is rejected:

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\Windows"
```

The request should not be allowed.

---

## 8. Launcher

HomePilot provides a launcher under:

```text
launcher/
```

The launcher can start the major local services together.

The launcher supports:

- HomePilot Gateway
- Quick Tunnel
- OpenCode Server
- Local LLM loading through LM Studio

The Windows entry point is:

```text
launcher\start-homepilot.bat
```

Run:

```powershell
cd launcher
start-homepilot.bat
```

A root directory can also be specified:

```powershell
start-homepilot.bat C:\HomePilotTest
```

The launcher expects:

```text
launcher\.env
```

The repository provides:

```text
launcher\.env.example
```

as a template.

---

## 9. Launcher Configuration

Create:

```text
launcher\.env
```

based on:

```text
launcher\.env.example
```

Typical configuration:

```text
ROOT_PATH=C:\HomePilotTest

HOMEPILOT_WORKER_URL=https://<your-worker>.workers.dev

HOMEPILOT_WORKER_SECRET_TOKEN=<your-secret>

LOCAL_MODEL=<optional-local-model-id>
```

The current launcher validates the Worker URL and Worker secret before starting.

`LOCAL_MODEL` is optional.

If it is specified, the launcher checks LM Studio and attempts to load the requested model before starting OpenCode.

The current implementation expects LM Studio at:

```text
http://127.0.0.1:1234
```

---

## 10. OpenCode Server

HomePilot uses OpenCode as its Agent execution layer.

The current launcher expects:

```text
http://127.0.0.1:4096
```

OpenCode must therefore be installed and configured separately.

The exact model configuration depends on the OpenCode environment.

HomePilot communicates with OpenCode through the Gateway.

The HomePilot implementation is based on API routes verified against the actual OpenCode server.

Do not assume that every route shown in an OpenCode-generated API document is necessarily identical to the behavior of the installed server version.

---

## 11. Local LLM with LM Studio

HomePilot can use a Local LLM through OpenCode.

The current launcher supports loading a Local LLM through LM Studio.

The expected LM Studio server is:

```text
http://127.0.0.1:1234
```

If `LOCAL_MODEL` is specified in `launcher\.env`, the launcher checks:

```text
/api/v1/models
```

and verifies that the requested model exists.

Example:

```text
LOCAL_MODEL=qwen3.5-2b
```

The actual model identifier must match a model exposed by the installed LM Studio environment.

Local LLM stability depends heavily on:

- model
- quantization
- available RAM
- inference backend
- context size
- LM Studio configuration

Errors generated by the Local LLM environment should therefore not automatically be interpreted as HomePilot errors.

---

## 12. PWA Development Server

The main PWA is located at:

```text
explorer/cloudflare/
```

Install dependencies:

```powershell
cd explorer\cloudflare
npm install
```

Start the development server:

```powershell
npm run dev
```

The current Vite configuration uses:

```text
http://localhost:5174
```

The server is bound to:

```text
0.0.0.0
```

so that other devices on the local network can access the development server when network/firewall settings allow it.

---

## 13. PWA Gateway Configuration

The PWA communicates with the Gateway using the Gateway URL and authentication token.

When configuring the PWA for a local Gateway environment, make sure the client-side configuration points to:

```text
http://127.0.0.1:51887
```

when running locally on the same PC.

For smartphone or G2 testing, use the appropriate reachable Gateway URL provided by the HomePilot environment.

The Gateway authentication token must match the token printed by the Gateway.

---

## 14. PWA Local Test

Start the Gateway first.

Then start the PWA:

```powershell
cd explorer\cloudflare
npm run dev
```

Open:

```text
http://localhost:5174
```

Basic verification:

1. The Explorer loads.
2. The configured HomePilot root directory is displayed.
3. Directories can be opened.
4. Files can be selected.
5. Text files can be viewed.
6. Agent UI can be opened.
7. OpenCode sessions can be listed.
8. A new Agent message can be sent.
9. Agent responses are received.
10. Processing state changes correctly.
11. Session state updates correctly.

---

## 15. PWA Production Build

Build the production version:

```powershell
cd explorer\cloudflare
npm run build
```

The build process performs TypeScript compilation and Vite production bundling.

The generated files are placed under:

```text
explorer\cloudflare\dist
```

Preview the production build locally if required:

```powershell
npm run preview
```

---

## 16. Smartphone Test

For smartphone testing, the development server must be reachable from the smartphone.

First determine the PC's LAN address.

For example:

```text
http://192.168.0.2:5174/
```

The exact address depends on the local network.

The smartphone must be able to reach the PC and the required Gateway endpoint.

If browser security requirements make HTTPS necessary, use a temporary Cloudflare Quick Tunnel.

---

## 17. Cloudflare Quick Tunnel

For temporary HTTPS access to the PWA development server:

```powershell
cd tools
cloudflared.exe tunnel --url http://192.168.0.2:5174/
```

Cloudflare generates a temporary URL similar to:

```text
https://xxxxxxxxxxxxxxxx.trycloudflare.com
```

Open that URL from the smartphone.

This is useful when testing:

- smartphone camera access
- PWA microphone access
- G2-related remote loading
- HTTPS-dependent browser APIs

The Quick Tunnel URL is temporary and should not be treated as the production URL.

---

## 18. EvenHub Development

The G2 application is located at:

```text
explorer/evenhub/
```

Install dependencies:

```powershell
cd explorer\evenhub
npm install
```

Start the development server:

```powershell
npm run dev
```

The current development server uses:

```text
http://localhost:5173
```

The EvenHub bootstrap application connects to the HomePilot PWA environment.

---

## 19. EvenHub Simulator

Start the simulator with:

```powershell
cd explorer\evenhub
npm run simulator
```

The current npm script launches the EvenHub simulator against:

```text
http://localhost:5173/?simulator=true
```

Use the simulator for fast UI/navigation verification before testing on the physical G2.

---

## 20. EvenHub QR Testing

The EvenHub project provides QR-related scripts.

The current package scripts include:

```powershell
npm run qr
```

and:

```powershell
npm run qr:sim
```

These can be used to generate QR codes for the EvenHub environment.

For a specific PWA URL, the EvenHub CLI can also be used directly.

Example:

```powershell
npx evenhub qr --url "https://<your-pwa-url>/"
```

---

## 21. G2 Real Device Test

After the simulator works, test on the physical Even Realities G2.

Recommended test order:

### Explorer

- Scroll
- Tap folder
- Tap file
- Open File Viewer
- Double Tap back
- Context Menu
- Return to parent
- Refresh

### Agent Session List

- Open Agent
- Refresh sessions
- Tap session
- Double Tap back
- Context Menu
- Processing indicator
- Unread indicator

### Agent Chat

- Send normal message
- Receive Agent response
- Verify streaming / state updates
- Verify completion
- Double Tap back to Session List

### Voice Input

- Long Press
- Record
- Release
- Wait for transcription
- Tap to confirm/send
- Double Tap to cancel
- Verify the Agent receives the message

---

## 22. Processing / Unread Verification

The G2 processing/unread state is an important part of the HomePilot design.

Verify at least these cases.

### Case 1: G2 starts an Agent task

```text
Send
 ↓
○ processing
 ↓
Agent completes
 ↓
● unread
```

### Case 2: G2 starts processing, then G2 is closed

```text
G2
 ↓
processing
 ↓
close G2
 ↓
Agent completes
 ↓
restart G2
 ↓
● unread
```

### Case 3: G2 starts processing, then G2 is closed while Agent is still working

```text
G2
 ↓
processing
 ↓
close G2
 ↓
restart G2
 ↓
○ processing
```

### Case 4: PC / smartphone starts the Agent

```text
PC / Smartphone
 ↓
Agent
 ↓
completion
 ↓
G2 refresh
 ↓
● unread
```

### Case 5: Read the unread session

```text
● unread
 ↓
open session
 ↓
normal
 ↓
restart G2
 ↓
normal
```

These tests verify that unread is based on the user's last confirmed state rather than the device that initiated the Agent request.

---

## 23. Speech Worker

The speech worker is located at:

```text
speech-worker/
```

It is a Cloudflare Worker using Workers AI.

The current configuration defines an AI binding named:

```text
AI
```

The worker uses Whisper for speech transcription.

Install dependencies:

```powershell
cd speech-worker
npm install
```

---

## 24. Speech Worker Local Development

Start Wrangler:

```powershell
cd speech-worker
npm run dev
```

The current worker uses a local development endpoint similar to:

```text
http://127.0.0.1:8787
```

The first run may require Cloudflare authentication because the Worker AI binding accesses Cloudflare resources.

A test audio file can be posted directly to the local Worker.

Example:

```powershell
curl.exe -X POST `
  -H "Content-Type: audio/mp4" `
  --data-binary "@C:\path\to\test.m4a" `
  http://127.0.0.1:8787/
```

---

## 25. Speech Worker Deployment

Deploy the Worker:

```powershell
cd speech-worker
npx wrangler deploy
```

The project also provides:

```powershell
npm run deploy
```

which runs:

```text
wrangler deploy
```

After changing the Worker, verify the deployment if necessary:

```powershell
npx wrangler deployments list
```

A source code change does not automatically mean that the deployed Cloudflare Worker has changed.

Always deploy explicitly after modifying the Worker.

---

## 26. HomePilot Gateway → Speech Worker Configuration

The Gateway forwards speech requests to the configured Speech Worker.

The launcher uses:

```text
HOMEPILOT_WORKER_URL
HOMEPILOT_WORKER_SECRET_TOKEN
```

These are configured in:

```text
launcher\.env
```

Example:

```text
HOMEPILOT_WORKER_URL=https://<your-worker>.workers.dev
HOMEPILOT_WORKER_SECRET_TOKEN=<your-secret>
```

The same secret must be configured consistently with the deployed Worker.

Do not commit the actual secret to Git.

---

## 27. PWA Voice Test

Once the Gateway and Speech Worker are available:

1. Open HomePilot PWA.
2. Open Agent.
3. Start microphone input.
4. Speak.
5. Stop recording.
6. Wait for transcription.
7. Verify the transcript is inserted into the Agent input.
8. Send the message normally.
9. Verify the Agent receives the message.
10. Verify the Agent response.

The voice transcript is intentionally confirmed by the user before sending.

---

## 28. G2 Voice Test

With the G2 connected:

```text
Idle
 ↓
Long Press
 ↓
Recording
 ↓
Release
 ↓
Transcribing
 ↓
Confirmation
```

Then:

```text
Tap
 ↓
Send to Agent
```

or:

```text
Double Tap
 ↓
Cancel
```

The microphone permission required by the G2 application must be enabled.

---

## 29. Production PWA Deployment

Build the PWA:

```powershell
cd explorer\cloudflare
npm run build
```

The result is:

```text
explorer\cloudflare\dist
```

Deploy the generated application to the configured Cloudflare hosting environment.

The actual production URL is environment-specific.

After deployment, verify:

- PWA loads
- Gateway connection works
- Authentication works
- Explorer works
- Agent works
- SSE works
- Voice works
- Smartphone access works
- G2 bootstrap points to the correct PWA URL

---

## 30. G2 Production Package

Build and package the EvenHub application:

```powershell
cd explorer\evenhub
npm run pack
```

The current package script performs:

```text
npm run build
    ↓
evenhub pack
    ↓
HomePilotExplorer.ehpk
```

The generated package is:

```text
HomePilotExplorer.ehpk
```

Upload the `.ehpk` package through the EvenHub Portal for the G2 environment.

---

## 31. Complete Local Startup

For normal development, the recommended startup order is:

```text
1. LM Studio (if using Local LLM)
2. HomePilot launcher
3. PWA development server
4. EvenHub development server
5. EvenHub simulator / G2
```

The HomePilot launcher can start the local backend-side services together:

```text
Gateway
Quick Tunnel
OpenCode
Local Model loading (optional)
```

The PWA and EvenHub frontend development servers are started separately.

---

## 32. Complete Production-like Test

Before treating a deployment as valid, verify the complete chain:

```text
PC / Smartphone / G2
        ↓
      PWA
        ↓
     Gateway
        ↓
     OpenCode
        ↓
       LLM
        ↓
     OpenCode
        ↓
     Gateway
        ↓
      PWA/G2
```

For voice:

```text
G2 / Smartphone
        ↓
      Gateway
        ↓
 Speech Worker
        ↓
     Whisper
        ↓
   Transcript
        ↓
      Agent
```

---

## 33. Troubleshooting

### Gateway does not start

Check:

- Node.js is installed.
- Port `51887` is not already in use.
- The configured root directory exists.
- `launcher\.env` contains the required Worker configuration.

The launcher reports if the Gateway fails to start within its startup timeout.

---

### PWA cannot access files

Check:

1. Gateway is running.
2. Gateway token is correct.
3. Gateway root directory exists.
4. PWA is configured for Gateway access.
5. The requested file is inside the configured root.
6. Windows firewall/network settings are not blocking the connection.

---

### Agent cannot connect

Check:

1. OpenCode Server is running.
2. OpenCode is listening on `127.0.0.1:4096`.
3. Gateway is running.
4. The Gateway can reach OpenCode.
5. The configured LLM provider is available.

---

### Local LLM cannot start

Check:

1. LM Studio is running.
2. LM Studio Server is enabled.
3. LM Studio is listening on `127.0.0.1:1234`.
4. The configured model exists.
5. `LOCAL_MODEL` exactly matches the model identifier.
6. The machine has sufficient resources.

---

### Voice transcription fails

Check:

1. Speech Worker is deployed.
2. Gateway has the correct `HOMEPILOT_WORKER_URL`.
3. Gateway has the correct `HOMEPILOT_WORKER_SECRET_TOKEN`.
4. Cloudflare authentication/deployment is valid.
5. The audio format is supported.
6. The Worker is actually deployed after the latest source change.

---

### G2 does not connect

Check:

1. EvenHub application is running.
2. The configured PWA URL is reachable.
3. The PWA is available from the G2 environment.
4. Network connectivity is available.
5. G2 permissions are configured.
6. The correct `.ehpk` package is installed for production testing.

---

## 34. Security Notes

HomePilot is a personal system and is not designed to expose the Gateway directly to the public Internet.

The Gateway provides access to the configured home filesystem and Agent infrastructure.

Important rules:

- Do not publish Gateway authentication tokens.
- Do not commit `.env` files containing secrets.
- Do not expose `51887` directly to the Internet.
- Do not expose OpenCode `4096` directly to the Internet.
- Use controlled tunnel/proxy access.
- Restrict the Gateway root directory.
- Treat Cloudflare Worker secrets as credentials.

The repository's public version should never contain real authentication tokens or personal environment paths.

---

## 35. Maintenance Checklist

When changing HomePilot, use this basic checklist.

### Frontend change

```text
npm run build
```

for:

```text
explorer/cloudflare
explorer/evenhub
```

as appropriate.

### Gateway change

Run:

```text
npm start
```

or:

```text
npm run dev
```

and verify the API.

### Speech Worker change

Run:

```text
npm run test
npm run deploy
npx wrangler deployments list
```

as appropriate.

### G2 change

Test:

```text
Simulator
 ↓
Real G2
```

Do not rely solely on the simulator for microphone, lifecycle, or hardware-specific behavior.

---

## 36. Quick Reference

### PWA

```powershell
cd explorer\cloudflare
npm install
npm run dev
```

```text
http://localhost:5174
```

### EvenHub

```powershell
cd explorer\evenhub
npm install
npm run dev
```

```text
http://localhost:5173
```

### Simulator

```powershell
cd explorer\evenhub
npm run simulator
```

### Gateway

```powershell
cd gateway
npm install
npm start
```

```text
http://127.0.0.1:51887
```

### Speech Worker

```powershell
cd speech-worker
npm install
npm run dev
```

### Speech Worker deployment

```powershell
cd speech-worker
npm run deploy
```

### PWA production build

```powershell
cd explorer\cloudflare
npm run build
```

### G2 package

```powershell
cd explorer\evenhub
npm run pack
```

### Quick Tunnel

```powershell
cd tools
cloudflared.exe tunnel --url http://192.168.0.2:5174/
```

---

# 日本語

## 1. 目的

HomePilotは複数のコンポーネントから構成されており、それぞれ異なる環境で動作します。

基本構成は以下です。

```text
PC / Smartphone / Even Realities G2
                │
                ▼
        HomePilot PWA / EvenHub
                │
                ▼
         HomePilot Gateway
                │
        ┌───┴────┐
        ▼                ▼
   自宅PCファイル       OpenCode
                          │
                          ▼
                    Cloud / Local LLM
```

音声入力では、

```text
PWA / G2
   │
   ▼
Gateway
   │
   ▼
Cloudflare Speech Worker
   │
   ▼
Workers AI / Whisper
```

となります。

そのため、通常の開発環境では複数のサービスを起動する必要があります。

---

## 2. 前提ソフトウェア

HomePilotは主にWindows環境で開発しています。

### 通常の開発に必要

- Windows 11
- Git
- Node.js
- npm
- 最新のWebブラウザ

### HomePilot Gatewayに必要

- Node.js
- HomePilotリポジトリ
- HomePilotから公開するローカルディレクトリ

### Agent機能に必要

- OpenCode Server
- 利用可能なLLM
- Cloud / Local LLMの設定

### 音声入力に必要

- Cloudflareアカウント
- Cloudflare Workers / Workers AI
- Wrangler

### G2開発に必要

- EvenHub環境
- Even Realities G2
- プロジェクトで必要なEvenHub SDK / CLI

### Quick Tunnelによる実機テストに必要

- `cloudflared.exe`

---

## 3. リポジトリの取得

リポジトリをcloneします。

```powershell
git clone <HomePilot repository>
cd HomePilot
```

HomePilotはルートにnpm workspaceを構成していません。

各Node.jsアプリケーションごとに依存関係をインストールします。

主なディレクトリ：

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   └── evenhub/
├── gateway/
├── launcher/
├── speech-worker/
└── tools/
```

---

## 4. 推奨ディレクトリ構成

現在のLauncherは概ね以下の構成を前提としています。

```text
HomePilot/
├── explorer/
├── gateway/
├── launcher/
├── speech-worker/
└── tools/
    └── cloudflared.exe
```

Launcherは以下の場所からcloudflaredを起動します。

```text
tools\cloudflared.exe
```

Gateway：

```text
127.0.0.1:51887
```

OpenCode Server：

```text
127.0.0.1:4096
```

これらは現在の実装で使用している値です。

---

## 5. HomePilot用テストディレクトリ

開発時はHomePilotから公開する専用ディレクトリを作ることを推奨します。

例：

```powershell
mkdir C:\HomePilotTest
echo "Hello HomePilot" > C:\HomePilotTest\test.txt
mkdir C:\HomePilotTest\docs
```

Gatewayのroot directoryとしてこのディレクトリを指定します。

システム全体をrootとして指定するような使い方は避けてください。

Gatewayは設定されたrootの外側へのアクセスを制限します。

---

## 6. HomePilot Gateway

Gatewayは自宅PC上で動作するローカルサービスです。

主に、

- 自宅PCファイルシステム
- OpenCode
- Speech Worker

へのアクセスを仲介します。

現在の待受：

```text
http://127.0.0.1:51887
```

### 手動起動

```powershell
cd gateway
npm install
npm start
```

起動すると認証用Tokenが生成されます。

PWA/G2からGatewayへ接続する際に、このTokenを使用します。

---

## 7. Gateway APIの基本確認

Gateway起動後、正常に応答することを確認します。

```powershell
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/health
```

Filesystem root：

```powershell
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/fs/root
```

ディレクトリ：

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\HomePilotTest"
```

ファイル：

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/file?path=C:\HomePilotTest\test.txt"
```

認証なし：

```powershell
curl http://127.0.0.1:51887/api/health
```

これは認証なしなので失敗することを確認します。

root外アクセス：

```powershell
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\Windows"
```

こちらも許可されないことを確認します。

---

## 8. Launcher

HomePilotには、

```text
launcher/
```

があります。

Launcherを利用すると主要なローカルサービスをまとめて起動できます。

対象：

- HomePilot Gateway
- Quick Tunnel
- OpenCode Server
- LM Studio経由のLocal LLM読み込み

Windows用の起動ファイル：

```text
launcher\start-homepilot.bat
```

起動：

```powershell
cd launcher
start-homepilot.bat
```

root directoryを指定することもできます。

```powershell
start-homepilot.bat C:\HomePilotTest
```

Launcherでは、

```text
launcher\.env
```

を使用します。

テンプレート：

```text
launcher\.env.example
```

---

## 9. Launcher設定

以下を作成します。

```text
launcher\.env
```

`launcher\.env.example`を元に設定してください。

例：

```text
ROOT_PATH=C:\HomePilotTest

HOMEPILOT_WORKER_URL=https://<your-worker>.workers.dev

HOMEPILOT_WORKER_SECRET_TOKEN=<your-secret>

LOCAL_MODEL=<optional-local-model-id>
```

現在のLauncherではWorker URLとWorker Secretを必須としてチェックしています。

`LOCAL_MODEL`は任意です。

指定した場合、LauncherはLM Studioに接続してモデルの存在を確認し、そのモデルを読み込んでからOpenCodeを起動します。

現在のLM Studio接続先：

```text
http://127.0.0.1:1234
```

---

## 10. OpenCode Server

HomePilotのAgent実行基盤にはOpenCodeを使用します。

現在のLauncherは、

```text
http://127.0.0.1:4096
```

をOpenCode Serverとして使用します。

OpenCode自体は別途インストール・設定してください。

利用するLLMはOpenCode側の環境に依存します。

HomePilotからOpenCodeへはGatewayを経由してアクセスします。

OpenCode APIについては、OpenCodeの自動生成ドキュメントだけを鵜呑みにせず、実際に動作確認したAPIをHomePilot側の基準としています。

---

## 11. LM Studio / Local LLM

HomePilotではOpenCodeを経由してLocal LLMを利用できます。

LauncherはLM Studioに接続してLocal LLMをロードできます。

接続先：

```text
http://127.0.0.1:1234
```

`launcher\.env`に、

```text
LOCAL_MODEL=qwen3.5-2b
```

のように指定します。

ただし、実際に指定するIDはLM Studio側で公開されているモデルIDと一致させる必要があります。

Local LLMの安定性は、

- モデル
- 量子化
- RAM
- 推論バックエンド
- Context Size
- LM Studio設定

などに大きく依存します。

したがってLocal LLMで発生したエラーが、必ずしもHomePilot側の問題とは限りません。

---

## 12. PWA開発サーバー

メインPWAは、

```text
explorer/cloudflare/
```

にあります。

依存関係をインストール：

```powershell
cd explorer\cloudflare
npm install
```

開発サーバー起動：

```powershell
npm run dev
```

現在のURL：

```text
http://localhost:5174
```

Viteは、

```text
0.0.0.0
```

でListenするため、ネットワーク設定・Firewallが許可していれば、同一LAN上の別端末からアクセスできます。

---

## 13. PWAとGatewayの設定

PWAはGatewayのURLと認証Tokenを利用してGatewayへ接続します。

PC上でPWAとGatewayを同時に動かす場合は、

```text
http://127.0.0.1:51887
```

を利用します。

スマートフォンやG2から接続する場合は、その端末から到達可能なGateway URLを利用してください。

Gatewayの認証Tokenは、起動時にGatewayが表示するTokenと一致させます。

---

## 14. PWAローカル動作確認

まずGatewayを起動します。

次にPWA：

```powershell
cd explorer\cloudflare
npm run dev
```

ブラウザ：

```text
http://localhost:5174
```

以下を確認します。

1. Explorerが表示される
2. HomePilot root directoryが表示される
3. フォルダを開ける
4. ファイルを選択できる
5. テキストファイルを閲覧できる
6. Agent画面を開ける
7. OpenCode Sessionを取得できる
8. Agentメッセージを送信できる
9. Agent回答を受信できる
10. Processing状態が変化する
11. Session状態が更新される

---

## 15. PWA本番ビルド

```powershell
cd explorer\cloudflare
npm run build
```

TypeScriptのビルドとViteのproduction buildが実行されます。

生成物：

```text
explorer\cloudflare\dist
```

必要に応じてローカル確認：

```powershell
npm run preview
```

---

## 16. スマートフォン動作確認

スマートフォンから確認する場合、PC上の開発サーバーへスマートフォンからアクセスできる必要があります。

PCのLAN IPを確認します。

例えば、

```text
http://192.168.0.2:5174/
```

のようになります。

実際のIPアドレスは環境によって異なります。

スマートフォンからPCおよび必要なGatewayへ到達できることを確認してください。

HTTPSが必要なブラウザAPIを利用する場合は、Cloudflare Quick Tunnelを利用できます。

---

## 17. Cloudflare Quick Tunnel

PWA開発サーバーへ一時的なHTTPS URLを付ける場合：

```powershell
cd tools
cloudflared.exe tunnel --url http://192.168.0.2:5174/
```

すると、

```text
https://xxxxxxxxxxxxxxxx.trycloudflare.com
```

のような一時URLが生成されます。

スマートフォンからこのURLへアクセスできます。

主に、

- スマートフォンカメラ
- PWAマイク
- G2からのリモート読み込み
- HTTPSが必要なブラウザAPI

などのテストに利用できます。

Quick TunnelのURLは一時的なものなので、本番URLとして扱わないでください。

---

## 18. EvenHub開発

G2側アプリは、

```text
explorer/evenhub/
```

にあります。

依存関係：

```powershell
cd explorer\evenhub
npm install
```

開発サーバー：

```powershell
npm run dev
```

現在のURL：

```text
http://localhost:5173
```

EvenHub bootstrapからHomePilot PWAへ接続します。

---

## 19. EvenHub Simulator

シミュレータ：

```powershell
cd explorer\evenhub
npm run simulator
```

現在のnpm scriptでは、

```text
http://localhost:5173/?simulator=true
```

を対象にEvenHub Simulatorを起動します。

G2実機テスト前の高速なUI・画面遷移確認に利用します。

---

## 20. EvenHub QR

現在のpackage.jsonには、

```powershell
npm run qr
```

および、

```powershell
npm run qr:sim
```

があります。

特定のPWA URLに対して直接QRを生成する場合は、

```powershell
npx evenhub qr --url "https://<your-pwa-url>/"
```

のように実行します。

---

## 21. G2実機テスト

シミュレータで問題がなければ、Even Realities G2実機で確認します。

### Explorer

- Scroll
- Folder Tap
- File Tap
- File Viewer
- Double Tapで戻る
- Context Menu
- Parent移動
- Refresh

### Agent Session List

- Agentを開く
- Session Refresh
- Session Tap
- Double Tapで戻る
- Context Menu
- Processing表示
- Unread表示

### Agent Chat

- 通常メッセージ送信
- Agent回答受信
- ストリーミング/状態更新
- 完了確認
- Double TapでSession Listへ戻る

### Voice

- Long Press
- 録音
- Release
- 文字起こし
- Tapで送信
- Double Tapでキャンセル

---

## 22. Processing / Unread確認

G2のProcessing / Unreadは重要な状態管理機能です。

最低限、以下を確認します。

### Case 1

```text
送信
 ↓
○ processing
 ↓
Agent完了
 ↓
● unread
```

### Case 2

```text
G2から送信
 ↓
processing
 ↓
G2終了
 ↓
Agent完了
 ↓
G2再起動
 ↓
● unread
```

### Case 3

```text
G2から送信
 ↓
processing
 ↓
G2終了
 ↓
Agent処理中
 ↓
G2再起動
 ↓
○ processing
```

### Case 4

```text
PC / Smartphone
 ↓
Agent
 ↓
完了
 ↓
G2 Refresh
 ↓
● unread
```

### Case 5

```text
● unread
 ↓
Sessionを開く
 ↓
normal
 ↓
G2再起動
 ↓
normal
```

この確認により、

> 「どの端末からAgentを実行したか」

ではなく、

> 「ユーザーが最後に確認した時点より後にAgent結果があるか」

というUnread仕様が正しく機能していることを確認できます。

---

## 23. Speech Worker

音声文字起こしWorkerは、

```text
speech-worker/
```

にあります。

Cloudflare Workers AIを利用しています。

現在の設定では、

```text
AI
```

というAI bindingを利用します。

Whisperによる音声文字起こしを行います。

依存関係：

```powershell
cd speech-worker
npm install
```

---

## 24. Speech Workerローカル動作確認

```powershell
cd speech-worker
npm run dev
```

ローカルでは概ね、

```text
http://127.0.0.1:8787
```

で動作します。

初回起動時にはCloudflareへの認証が必要になる場合があります。

音声ファイルを直接POSTして確認することもできます。

例：

```powershell
curl.exe -X POST `
  -H "Content-Type: audio/mp4" `
  --data-binary "@C:\path\to\test.m4a" `
  http://127.0.0.1:8787/
```

---

## 25. Speech Workerデプロイ

Workerのデプロイ：

```powershell
cd speech-worker
npx wrangler deploy
```

または、

```powershell
npm run deploy
```

でも実行できます。

デプロイ後、必要に応じて、

```powershell
npx wrangler deployments list
```

で実際のデプロイ状態を確認します。

Workerは、

> ソースコードを変更した

だけではCloudflare上のWorkerが更新されたことにはなりません。

必ず明示的にdeployしてください。

---

## 26. Gateway → Speech Worker設定

Gatewayは設定されたSpeech Workerへ音声データを転送します。

Launcherでは、

```text
HOMEPILOT_WORKER_URL
HOMEPILOT_WORKER_SECRET_TOKEN
```

を利用します。

`launcher\.env`：

```text
HOMEPILOT_WORKER_URL=https://<your-worker>.workers.dev
HOMEPILOT_WORKER_SECRET_TOKEN=<your-secret>
```

Worker側とGateway側でSecretが一致している必要があります。

実際のSecretをGitへcommitしないでください。

---

## 27. PWA音声入力テスト

GatewayとSpeech Workerが利用可能になった状態で、

1. HomePilot PWAを開く
2. Agentを開く
3. マイク入力開始
4. 発話
5. 録音停止
6. 文字起こしを待つ
7. Agent入力欄に文字が入ることを確認
8. 通常の送信操作
9. Agentへ届くことを確認
10. Agent回答を確認

します。

音声入力結果は、ユーザーが確認してから通常のAgent送信を行う仕様です。

---

## 28. G2音声入力テスト

G2では、

```text
Idle
 ↓
Long Press
 ↓
Recording
 ↓
Release
 ↓
Transcribing
 ↓
Confirmation
```

です。

送信：

```text
Tap
 ↓
Agentへ送信
```

キャンセル：

```text
Double Tap
 ↓
Cancel
```

G2側のマイク権限が有効になっている必要があります。

---

## 29. PWA本番デプロイ

PWAをbuild：

```powershell
cd explorer\cloudflare
npm run build
```

生成物：

```text
explorer\cloudflare\dist
```

これを設定しているCloudflareのホスティング環境へデプロイします。

実際のproduction URLは環境によって異なります。

デプロイ後は、

- PWA表示
- Gateway接続
- 認証
- Explorer
- Agent
- SSE
- Voice
- Smartphone
- G2 bootstrap

を確認します。

---

## 30. G2本番パッケージ

G2用アプリ：

```powershell
cd explorer\evenhub
npm run pack
```

現在のpackage scriptでは、

```text
npm run build
    ↓
evenhub pack
    ↓
HomePilotExplorer.ehpk
```

となります。

生成物：

```text
HomePilotExplorer.ehpk
```

この`.ehpk`をEvenHub PortalへアップロードしてG2環境へ反映します。

---

## 31. 通常のローカル起動順

通常の開発では、以下の順番を推奨します。

```text
1. LM Studio（Local LLMを利用する場合）
2. HomePilot Launcher
3. PWA開発サーバー
4. EvenHub開発サーバー
5. EvenHub Simulator / G2
```

HomePilot Launcherは、

```text
Gateway
Quick Tunnel
OpenCode
Local Model読み込み（任意）
```

などのBackend側サービスをまとめて起動できます。

PWAとEvenHubのFrontend開発サーバーは別途起動します。

---

## 32. 本番相当の全体テスト

デプロイ後は、以下の一連の通信が通ることを確認します。

```text
PC / Smartphone / G2
        ↓
      PWA
        ↓
     Gateway
        ↓
     OpenCode
        ↓
       LLM
        ↓
     OpenCode
        ↓
     Gateway
        ↓
      PWA/G2
```

音声：

```text
G2 / Smartphone
        ↓
      Gateway
        ↓
 Speech Worker
        ↓
     Whisper
        ↓
   Transcript
        ↓
      Agent
```

---

## 33. トラブルシューティング

### Gatewayが起動しない

確認：

- Node.jsがインストールされているか
- `51887`が使用中ではないか
- root directoryが存在するか
- `launcher\.env`に必要なWorker設定があるか

LauncherではGateway起動のタイムアウトもチェックしています。

---

### PWAからファイルが見えない

以下を確認：

1. Gatewayが起動している
2. Gateway Tokenが正しい
3. Gateway rootが存在する
4. PWAがGateway接続モードになっている
5. 対象ファイルがroot内にある
6. Windows Firewall / ネットワーク設定に問題がない

---

### Agentに接続できない

以下を確認：

1. OpenCode Serverが起動している
2. `127.0.0.1:4096`でListenしている
3. Gatewayが起動している
4. GatewayからOpenCodeへ接続できる
5. OpenCode側のLLMが利用可能

---

### Local LLMが起動しない

以下を確認：

1. LM Studioが起動している
2. LM Studio Serverが有効
3. `127.0.0.1:1234`でListenしている
4. 指定モデルが存在する
5. `LOCAL_MODEL`が正しい
6. PCのリソースに余裕がある

---

### 音声文字起こしが失敗する

以下を確認：

1. Speech Workerがdeploy済み
2. `HOMEPILOT_WORKER_URL`が正しい
3. `HOMEPILOT_WORKER_SECRET_TOKEN`が正しい
4. Cloudflareの認証/デプロイが正常
5. 音声形式が対応している
6. 最新のWorker変更を実際にdeployしている

---

### G2が接続できない

以下を確認：

1. EvenHubアプリが起動している
2. PWA URLが到達可能
3. G2環境からPWAへ接続できる
4. ネットワークが正常
5. G2権限が設定されている
6. 本番では正しい`.ehpk`がインストールされている

---

## 34. セキュリティ上の注意

HomePilotは個人利用を前提としており、Gatewayを直接インターネットへ公開する設計ではありません。

Gatewayからは、

- 自宅PCファイル
- Agent基盤

へアクセスできるため、十分注意してください。

### 必ず守ること

- Gateway Tokenを公開しない
- Secret入り`.env`をcommitしない
- `51887`を直接Internet公開しない
- OpenCode `4096`を直接Internet公開しない
- Tunnel / Proxyなど管理された経路を利用する
- Gateway rootを必要最小限にする
- Cloudflare Worker Secretを認証情報として扱う

公開用リポジトリに、

- 実Token
- Secret
- 個人環境のパス
- 個人情報

を含めないでください。

---

## 35. メンテナンス時チェックリスト

HomePilotを変更した場合は、以下を基本とします。

### Frontend変更

必要に応じて、

```text
explorer/cloudflare
explorer/evenhub
```

それぞれで、

```text
npm run build
```

を実行します。

### Gateway変更

```text
npm start
```

または、

```text
npm run dev
```

で起動してAPIを確認します。

### Speech Worker変更

```text
npm run test
npm run deploy
npx wrangler deployments list
```

を必要に応じて実行します。

### G2変更

```text
Simulator
 ↓
Real G2
```

の順番で確認します。

マイク・ライフサイクル・ハードウェア依存動作については、シミュレータだけで判断しないでください。

---

## 36. クイックリファレンス

### PWA

```powershell
cd explorer\cloudflare
npm install
npm run dev
```

```text
http://localhost:5174
```

### EvenHub

```powershell
cd explorer\evenhub
npm install
npm run dev
```

```text
http://localhost:5173
```

### Simulator

```powershell
cd explorer\evenhub
npm run simulator
```

### Gateway

```powershell
cd gateway
npm install
npm start
```

```text
http://127.0.0.1:51887
```

### Speech Worker

```powershell
cd speech-worker
npm install
npm run dev
```

### Speech Worker Deploy

```powershell
cd speech-worker
npm run deploy
```

### PWA Production Build

```powershell
cd explorer\cloudflare
npm run build
```

### G2 Package

```powershell
cd explorer\evenhub
npm run pack
```

### Quick Tunnel

```powershell
cd tools
cloudflared.exe tunnel --url http://192.168.0.2:5174/
```


