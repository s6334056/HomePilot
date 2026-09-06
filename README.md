# HomePilot

HomePilot is a personal AI assistant platform that connects a home PC, smartphone, and Even Realities G2 smart glasses.

HomePilotは、自宅PC・スマートフォン・Even Realities G2スマートグラスを接続し、ファイル操作・AI Agent・音声入力などを一体化した個人向けAIアシスタント基盤です。

---

## English

## 1. Overview

HomePilot is a personal AI assistant platform designed to let the user access and operate a home PC from multiple devices.

The main idea is simple:

- Access files on a home PC from a web browser.
- Use an AI Agent from the same interface.
- Use the same Agent from a smartphone.
- Use the Agent and file explorer from Even Realities G2 smart glasses.
- Send voice input from both smartphone and G2.
- Use OpenCode as the Agent execution layer.
- Use either cloud-based or locally hosted LLMs through OpenCode.

HomePilot is primarily designed as a personal system rather than a general-purpose SaaS product.

The project was developed with a strong emphasis on:

- zero-cost development
- free/open-source infrastructure where practical
- AI-assisted software development
- simple architecture
- real-device testing
- incremental implementation and verification

---

## 2. Main Features

### 2.1 File Explorer

HomePilot provides a file explorer for files stored on the home PC.

The Explorer can be used from:

- PC browser
- Smartphone browser / PWA
- Even Realities G2

The home PC filesystem is accessed through the HomePilot Gateway.

---

### 2.2 AI Agent

HomePilot integrates with OpenCode to provide an AI Agent interface.

The Agent supports:

- New sessions
- Existing sessions
- Message history
- Model selection
- Agent responses
- Streaming updates through SSE
- Permission requests
- Question requests
- Processing state
- Unread state

The same OpenCode session can be accessed from multiple HomePilot clients.

---

### 2.3 Context-aware Agent

HomePilot can pass the current Explorer / File Viewer context to the Agent.

For example, when the user asks the Agent about a selected file, HomePilot can provide information such as:

- Current directory
- Selected item
- Selected file
- File content when appropriate
- Current screen

This allows the Agent to understand what the user is currently looking at.

---

### 2.4 Even Realities G2 Support

HomePilot includes an EvenHub application for Even Realities G2 smart glasses.

The G2 application provides:

- Explorer
- File Viewer
- Agent Session List
- Model selection
- Agent Chat
- Voice input
- Processing state
- Unread state
- Context-aware Agent interaction
- Navigation between Explorer and Agent screens

The G2 UI is designed around the interaction capabilities of the glasses, including:

- Tap
- Double Tap
- Long Press
- Scroll
- Context Menu

---

### 2.5 Voice Input

HomePilot supports voice input from both smartphone/PWA and G2.

For PWA:

```text
Microphone
    ↓
MediaRecorder
    ↓
HomePilot Gateway
    ↓
Speech Worker
    ↓
Whisper
    ↓
Transcript
    ↓
Agent input
```

For G2:

```text
G2 microphone
    ↓
PCM audio
    ↓
HomePilot Gateway
    ↓
Speech Worker
    ↓
Whisper
    ↓
Transcript
    ↓
G2 confirmation
    ↓
OpenCode Agent
```

The G2 voice interaction is designed as:

```text
Idle
 ↓
Long Press
 ↓
Recording
 ↓
Release / 60 sec timeout
 ↓
Transcribing
 ↓
Confirmation
 ├─ Tap       → Send
 └─ DoubleTap → Cancel
```

---

### 2.6 Cloud LLM and Local LLM

HomePilot does not directly implement an LLM inference engine.

Instead, OpenCode acts as the Agent execution layer.

This makes it possible to use:

- cloud-based LLMs
- locally hosted LLMs

through the same HomePilot Agent interface, depending on the OpenCode configuration.

Local LLM support is therefore treated as an execution environment rather than a separate HomePilot Agent implementation.

---

## 3. Architecture

The overall architecture is roughly:

```text
                           HomePilot
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        PC Browser       Smartphone         Even G2
             │                │                │
             └────────────────┼────────────────┘
                              │
                              ▼
                    HomePilot PWA / EvenHub
                              │
                              ▼
                     Cloudflare / Tunnel
                              │
                              ▼
                     HomePilot Gateway
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        Home PC FS        OpenCode        Speech Worker
                              │                │
                              ▼                ▼
                         Cloud LLM /        Whisper
                         Local LLM
```

The HomePilot Gateway runs on the home PC and provides controlled access to:

- Home PC filesystem
- OpenCode Server
- Speech transcription

The Gateway is intentionally kept separate from the frontend.

---

## 4. Main Components

The repository is currently organized into several major components.

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   │   └── PWA / main web application
│   │
│   └── evenhub/
│       └── Even Realities G2 application
│
├── gateway/
│   └── Home PC local Gateway
│
├── speech-worker/
│   └── Speech transcription service
│
├── launcher/
│   └── Local launcher / startup support
│
└── tools/
    └── Development tools
```

The `explorer/cloudflare` application contains the main Explorer and Agent UI.

The `explorer/evenhub` application is the EvenHub-side bootstrap/package for G2.

---

## 5. Communication Flow

### 5.1 File Access

```text
PC / Smartphone / G2
        ↓
    HomePilot
        ↓
      Gateway
        ↓
   Home PC filesystem
```

The Gateway currently listens on:

```text
127.0.0.1:51887
```

The filesystem root used by the development environment is configured on the Gateway side.

---

### 5.2 Agent Communication

```text
HomePilot
    ↓
Gateway
    ↓
OpenCode Server
    ↓
LLM
    ↓
OpenCode Server
    ↓
Gateway
    ↓
HomePilot
```

HomePilot uses the Gateway as the controlled proxy to OpenCode.

OpenCode API behavior was verified against the actual server rather than relying solely on the generated API documentation.

---

### 5.3 Speech Communication

```text
PWA / G2
   ↓
Gateway
   ↓
Speech Worker
   ↓
Whisper
   ↓
Transcript
```

The Gateway exposes the speech endpoint:

```text
/api/speech/transcribe
```

---

## 6. Agent State Synchronization

HomePilot maintains Agent state across PWA and G2.

Important states include:

### Processing

The Agent is currently working on a session.

Displayed on G2 as:

```text
○
```

### Unread

A new Agent result is available and the user has not yet confirmed it.

Displayed on G2 as:

```text
●
```

Processing has priority over unread:

```text
○  processing
●  unread
   normal
```

The PWA and G2 share persistent session state through browser local storage where appropriate.

The unread concept is based on the user's last confirmed state rather than on which device originally started the Agent session.

This allows, for example:

```text
PC / Smartphone
      ↓
OpenCode Agent
      ↓
new result
      ↓
G2
      ↓
● unread
```

---

## 7. G2 Navigation Concept

The G2 application is designed around the limited interaction model of smart glasses.

Typical navigation is:

```text
Explorer
   │
   ├─ Tap ───────────────→ Folder / File
   │
   ├─ File Viewer
   │
   └─ Agent
         │
         ├─ Session List
         │      │
         │      └─ Tap → Chat
         │
         └─ Chat
```

Agent navigation preserves the previous Explorer/File Viewer page so that the user can return to the context from which the Agent was opened.

---

## 8. Development Status

The major planned functionality of HomePilot has been implemented.

Current major capabilities include:

- PC Explorer
- Smartphone/PWA Explorer
- G2 Explorer
- File Viewer
- OpenCode Agent integration
- Agent sessions
- Agent messages
- SSE updates
- Permission handling
- Question handling
- Context-aware Agent interaction
- Responsive PWA UI
- G2 Agent UI
- G2 navigation
- Processing state
- Processing recovery
- Unread state
- Cross-device unread synchronization
- PWA voice input
- G2 voice input
- Cloud LLM usage
- Local LLM usage through OpenCode

The project is now primarily in the **real-world usage / maintenance / refinement** stage.

Further improvements may be made based on actual daily use.

---

## 9. Development Environment

The project was developed primarily on Windows.

Typical development tools include:

- Windows 11
- Node.js / npm
- Git
- GitHub
- React
- Vite
- TypeScript
- Cloudflare
- Cloudflare Tunnel
- OpenCode
- EvenHub
- Even Realities G2

The project intentionally avoids requiring a paid cloud infrastructure stack for normal development.

---

## 10. Running HomePilot

HomePilot consists of several independently runnable components.

The basic local development environment uses:

### PWA

```text
http://localhost:5174
```

### EvenHub

```text
http://localhost:5173
```

### HomePilot Gateway

```text
http://127.0.0.1:51887
```

The Gateway connects HomePilot to the local filesystem and OpenCode Server.

Detailed setup instructions are documented separately.

See:

- [`SETUP.md`](SETUP.md)
- [`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 11. Local Development / Test

### PWA

```powershell
cd explorer\cloudflare
npm install
npm run dev
```

Open:

```text
http://localhost:5174
```

### EvenHub

```powershell
cd explorer\evenhub
npm install
npm run dev
```

### EvenHub Simulator

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

The Gateway displays its generated authentication token when it starts.

For details about the complete test environment, smartphone/G2 testing, Cloudflare Tunnel, and OpenCode configuration, see `SETUP.md`.

---

## 12. Production Build / Deployment

### PWA

Build the production bundle:

```powershell
cd explorer\cloudflare
npm run build
```

The production files are generated in:

```text
explorer\cloudflare\dist
```

The generated files can be deployed to the configured Cloudflare hosting environment.

### EvenHub

Build and package the G2 application:

```powershell
cd explorer\evenhub
npm run pack
```

This generates:

```text
HomePilotExplorer.ehpk
```

The generated `.ehpk` package can be uploaded to the EvenHub Portal for deployment to the G2 environment.

Detailed deployment procedures are documented in `SETUP.md`.

---

## 13. Repository Documentation

The repository documentation is divided into three documents.

### README.md

High-level project overview.

This document explains:

- What HomePilot is
- Main features
- Architecture
- Current status
- Basic test/build information

### SETUP.md

Practical environment setup and operation guide.

It covers:

- Required software
- Gateway setup
- OpenCode setup
- Cloudflare Tunnel
- Speech Worker
- PWA
- EvenHub
- G2
- Local testing
- Production deployment
- Troubleshooting

### DEVELOPMENT.md

Development history and development methodology.

It covers:

- Project history
- Phase structure
- Architecture decisions
- Important technical findings
- AI-assisted development
- ChatGPT / OpenCode / MiMo roles
- Zero-cost development methodology
- Lessons learned
- Known limitations
- Future ideas

---

## 14. Development Philosophy

HomePilot was developed as a personal project with an emphasis on **zero-cost AI-assisted development**.

The development process intentionally separates the roles of AI tools.

### ChatGPT

ChatGPT was primarily used as:

- Discussion partner
- Investigation partner
- Design partner
- Architecture reviewer
- Problem-solving partner
- Debugging / analysis partner
- Implementation planner

### OpenCode / MiMo

OpenCode / MiMo was primarily used as:

- Implementation agent
- Code modification agent
- Build/debug assistant
- Refactoring assistant

### Human

The human developer remained responsible for:

- Final design decisions
- Running the application
- Real-device testing
- Evaluating behavior
- Confirming implementation results
- Git commits
- Deciding what should and should not be changed

The basic development loop was:

```text
Think
  ↓
Discuss
  ↓
Design
  ↓
Specify
  ↓
Implement
  ↓
Build
  ↓
Test
  ↓
Observe
  ↓
Discuss again
  ↓
Improve
```

This approach made it possible to build HomePilot without relying on a large paid development infrastructure.

More detailed development methodology is documented in `DEVELOPMENT.md`.

---

## 15. Project Philosophy

HomePilot is not intended to be a polished commercial product.

It is a personal engineering project exploring the combination of:

- Web applications
- PWA
- Local network services
- Cloudflare
- AI Agents
- Cloud LLMs
- Local LLMs
- Speech recognition
- Smart glasses
- AI-assisted software development

The project also serves as a practical experiment in determining how far a single developer can go by combining traditional software engineering experience with modern AI development tools.

---

## 16. Current Limitations

HomePilot is a personal experimental system and therefore has several limitations.

Examples include:

- The Gateway must be running on the home PC for filesystem and Agent access.
- OpenCode availability depends on the local OpenCode environment.
- Local LLM behavior depends heavily on the selected model and local inference environment.
- Smart-glasses behavior can be affected by the G2 / EvenHub environment.
- Network connectivity affects remote access.
- Some features are intentionally optimized for the author's personal environment rather than general deployment.

In particular, errors observed while using local LLMs may originate from the local model/inference environment rather than HomePilot itself.

---

## 17. License / Usage

This repository is primarily maintained as a personal development project and technical portfolio.

The code is provided for reference and experimentation.

Before deploying HomePilot in another environment, review the configuration, authentication, network exposure, and security settings carefully.

Do not expose the HomePilot Gateway directly to the public Internet without appropriate security controls.

---

## 18. Related Documentation

- `SETUP.md` — Environment setup, operation, testing and deployment
- `DEVELOPMENT.md` — Development history, architecture decisions and AI-assisted development methodology

---

# 日本語

## 1. 概要

HomePilotは、自宅PC・スマートフォン・Even Realities G2スマートグラスを接続して利用する、個人向けAIアシスタント基盤です。

主な目的は、

- 自宅PCのファイルをブラウザから操作する
- 同じ環境からAI Agentを利用する
- スマートフォンからAgentを利用する
- Even Realities G2からExplorerとAgentを利用する
- スマートフォンとG2から音声入力する
- OpenCodeをAgent実行基盤として利用する
- OpenCodeを通してクラウドLLMやLocal LLMを利用する

ことです。

HomePilotは、一般向けSaaSではなく、主に個人利用を目的としたシステムとして開発しています。

開発では特に、

- ゼロ円開発
- 可能な限り無料・OSSのインフラ利用
- AIを活用したソフトウェア開発
- シンプルな構成
- 実機による検証
- 小さく実装して確認する開発

を重視しています。

---

## 2. 主な機能

### 2.1 ファイルExplorer

自宅PCに保存されているファイルをExplorerから閲覧できます。

利用可能な環境：

- PCブラウザ
- スマートフォンブラウザ / PWA
- Even Realities G2

自宅PCのファイルシステムにはHomePilot Gatewayを経由してアクセスします。

---

### 2.2 AI Agent

OpenCodeと連携してAI Agentを利用できます。

対応している主な機能：

- 新規Session
- 既存Session
- メッセージ履歴
- モデル選択
- Agent回答
- SSEによるストリーミング更新
- Permission要求
- Question要求
- Processing状態
- Unread状態

複数のHomePilotクライアントから同じOpenCode Sessionを利用できます。

---

### 2.3 コンテキスト付きAgent

ExplorerやFile Viewerで現在表示・選択している情報をAgentへ引き継ぐことができます。

例えば、

- 現在のディレクトリ
- 選択項目
- 選択ファイル
- 必要に応じたファイル内容
- 現在の画面

などをAgentへ渡します。

これにより、

「今見ているファイルについて説明して」

のような操作が可能になります。

---

### 2.4 Even Realities G2対応

EvenHubを利用してEven Realities G2に対応しています。

G2では、

- Explorer
- File Viewer
- Agent Session List
- Model Select
- Agent Chat
- 音声入力
- Processing表示
- Unread表示
- コンテキスト付きAgent
- Explorer / Agent間のナビゲーション

を利用できます。

G2固有の操作体系に合わせ、

- Tap
- Double Tap
- Long Press
- Scroll
- Context Menu

を利用しています。

---

### 2.5 音声入力

スマートフォン/PWAとG2の両方から音声入力できます。

PWAでは、

```text
マイク
 ↓
MediaRecorder
 ↓
HomePilot Gateway
 ↓
Speech Worker
 ↓
Whisper
 ↓
文字起こし
 ↓
Agent入力
```

という流れです。

G2では、

```text
G2マイク
 ↓
PCM音声
 ↓
HomePilot Gateway
 ↓
Speech Worker
 ↓
Whisper
 ↓
文字起こし
 ↓
G2上で確認
 ↓
OpenCode Agent
```

という流れです。

G2では、

```text
Idle
 ↓
Long Press
 ↓
録音
 ↓
Release / 60秒
 ↓
文字起こし
 ↓
確認
 ├─ Tap       → 送信
 └─ DoubleTap → キャンセル
```

という操作体系になっています。

---

### 2.6 Cloud LLM / Local LLM

HomePilot自身がLLM推論エンジンを実装しているわけではありません。

OpenCodeをAgent実行基盤として利用し、その先のLLM環境を切り替えられる構成になっています。

そのため、

- Cloud LLM
- Local LLM

のどちらもHomePilotのAgent UIから利用できます。

Local LLMについては、HomePilot側で別のAgent機能を実装するのではなく、OpenCodeから利用可能なLLM実行環境の一つとして扱っています。

---

## 3. アーキテクチャ

全体構成は概ね以下のようになっています。

```text
                           HomePilot
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
           PC             Smartphone        Even G2
             │                │                │
             └────────────────┼────────────────┘
                              │
                              ▼
                    HomePilot PWA / EvenHub
                              │
                              ▼
                     Cloudflare / Tunnel
                              │
                              ▼
                     HomePilot Gateway
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        自宅PC FS          OpenCode        Speech Worker
                              │                │
                              ▼                ▼
                         Cloud LLM /        Whisper
                         Local LLM
```

HomePilot Gatewayは自宅PC上で動作し、

- 自宅PCファイルシステム
- OpenCode Server
- 音声文字起こし

へのアクセスを仲介します。

FrontendとGatewayを分離することで、自宅PC上の機能とWeb/G2側のUIを分離しています。

---

## 4. 主なコンポーネント

現在のリポジトリは主に以下の構成です。

```text
HomePilot/
├── explorer/
│   ├── cloudflare/
│   │   └── PWA / メインWebアプリ
│   │
│   └── evenhub/
│       └── Even Realities G2アプリ
│
├── gateway/
│   └── 自宅PC上で動作するGateway
│
├── speech-worker/
│   └── 音声文字起こしサービス
│
├── launcher/
│   └── ローカル起動補助
│
└── tools/
    └── 開発用ツール
```

`explorer/cloudflare` がExplorerおよびAgent UIの中心です。

`explorer/evenhub` はG2側のブートストラップおよび実機用パッケージを担当します。

---

## 5. 通信経路

### 5.1 ファイルアクセス

```text
PC / Smartphone / G2
        ↓
    HomePilot
        ↓
      Gateway
        ↓
   自宅PCファイル
```

Gatewayの開発環境での待受ポートは、

```text
127.0.0.1:51887
```

です。

ファイルシステムのルートはGateway側で設定されています。

---

### 5.2 Agent通信

```text
HomePilot
    ↓
Gateway
    ↓
OpenCode Server
    ↓
LLM
    ↓
OpenCode Server
    ↓
Gateway
    ↓
HomePilot
```

HomePilotではOpenCodeへのアクセスをGateway経由にしています。

OpenCode APIについては、OpenCodeのドキュメントだけに依存せず、実際に動作確認したAPIを基準として実装しています。

---

### 5.3 音声通信

```text
PWA / G2
   ↓
Gateway
   ↓
Speech Worker
   ↓
Whisper
   ↓
文字起こし
```

Gatewayには以下の音声文字起こしエンドポイントがあります。

```text
/api/speech/transcribe
```

---

## 6. Agent状態同期

HomePilotではPWAとG2の間でAgent状態を共有します。

代表的な状態は以下です。

### Processing

Agentが現在処理中であることを示します。

G2では、

```text
○
```

で表示します。

### Unread

新しいAgent結果が存在し、ユーザーがまだ確認していないことを示します。

G2では、

```text
●
```

で表示します。

Processingを優先するため、

```text
○  Processing
●  Unread
   Normal
```

という関係になります。

PWAとG2では、必要な状態をlocalStorageなどの永続領域を利用して共有しています。

Unreadは、

> 「どの端末からAgentを実行したか」

ではなく、

> 「ユーザーが最後に確認した時点より後に、新しいAgent結果があるか」

を基準としています。

そのため、例えば、

```text
PC / Smartphone
      ↓
OpenCode Agent
      ↓
新しい結果
      ↓
G2
      ↓
● Unread
```

という動作が可能です。

---

## 7. G2ナビゲーション

G2ではスマートグラス固有の操作体系に合わせて画面遷移を設計しています。

概念的には、

```text
Explorer
   │
   ├─ Tap ───────────────→ Folder / File
   │
   ├─ File Viewer
   │
   └─ Agent
         │
         ├─ Session List
         │      │
         │      └─ Tap → Chat
         │
         └─ Chat
```

となっています。

Agentを起動する前のExplorer / File Viewerを保持し、Agent利用後に元のコンテキストへ戻れるようにしています。

---

## 8. 開発状況

HomePilotで当初想定していた主要機能は、現在ほぼ実装完了しています。

主な完成機能：

- PC Explorer
- Smartphone/PWA Explorer
- G2 Explorer
- File Viewer
- OpenCode Agent連携
- Agent Session
- Agent Message
- SSE
- Permission処理
- Question処理
- Context付きAgent
- レスポンシブPWA UI
- G2 Agent UI
- G2ナビゲーション
- Processing状態
- Processing復旧
- Unread状態
- PWA / G2間Unread同期
- PWA音声入力
- G2音声入力
- Cloud LLM利用
- OpenCode経由のLocal LLM利用

現在は、主に**実運用しながら改善していく段階**です。

今後の改善は、実際に日常利用する中で発見した使い勝手や問題を中心に行う予定です。

---

## 9. 開発環境

主にWindows環境で開発しています。

主な開発ツール：

- Windows 11
- Node.js / npm
- Git
- GitHub
- React
- Vite
- TypeScript
- Cloudflare
- Cloudflare Tunnel
- OpenCode
- EvenHub
- Even Realities G2

通常の開発において、可能な限り有料のクラウド開発基盤を必要としない構成を目指しています。

---

## 10. HomePilotの起動

HomePilotはいくつかのコンポーネントに分かれて動作します。

基本的なローカル開発環境では、

### PWA

```text
http://localhost:5174
```

### EvenHub

```text
http://localhost:5173
```

### HomePilot Gateway

```text
http://127.0.0.1:51887
```

を使用します。

Gatewayは自宅PCのファイルシステムおよびOpenCode Serverとの接続を担当します。

詳細なセットアップ方法は以下を参照してください。

- [`SETUP.md`](SETUP.md)
- [`DEVELOPMENT.md`](DEVELOPMENT.md)

---

## 11. ローカル開発・動作確認

### PWA

```powershell
cd explorer\cloudflare
npm install
npm run dev
```

ブラウザで、

```text
http://localhost:5174
```

を開きます。

### EvenHub

```powershell
cd explorer\evenhub
npm install
npm run dev
```

### EvenHubシミュレータ

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

Gateway起動時には認証用Tokenが表示されます。

スマートフォン・G2実機・Cloudflare Tunnel・OpenCodeを含めた詳細な動作確認手順は `SETUP.md` に記載します。

---

## 12. 本番ビルド・デプロイ

### PWA

本番用ビルド：

```powershell
cd explorer\cloudflare
npm run build
```

生成物：

```text
explorer\cloudflare\dist
```

生成されたファイルを、設定しているCloudflareのホスティング環境へデプロイします。

### EvenHub

G2用アプリをビルド・パッケージング：

```powershell
cd explorer\evenhub
npm run pack
```

以下のパッケージが生成されます。

```text
HomePilotExplorer.ehpk
```

生成された`.ehpk`をEvenHub PortalへアップロードしてG2環境へデプロイします。

詳細なデプロイ手順は `SETUP.md` に記載します。

---

## 13. ドキュメント構成

リポジトリ直下の主要ドキュメントは以下の3つです。

### README.md

プロジェクト全体の概要。

- HomePilotとは何か
- 主な機能
- アーキテクチャ
- 現在の状態
- 基本的なテスト・ビルド方法

を説明します。

### SETUP.md

環境構築・起動・動作確認・デプロイの実用マニュアル。

以下を扱います。

- 必要ソフトウェア
- Gateway設定
- OpenCode設定
- Cloudflare Tunnel
- Speech Worker
- PWA
- EvenHub
- G2
- ローカル動作確認
- 本番デプロイ
- トラブルシューティング

### DEVELOPMENT.md

HomePilotの開発記録・開発方法・技術的判断をまとめます。

以下を扱います。

- 開発の経緯
- Phase構成
- アーキテクチャ上の判断
- 重要な技術的発見
- AIを利用した開発
- ChatGPT / OpenCode / MiMoの役割
- ゼロ円開発の方法
- 開発中に得た知見
- 既知の制約
- 今後のアイデア

---

## 14. 開発思想

HomePilotは、**ゼロ円でのAI支援開発**を強く意識して開発しました。

AIツールには役割を分担させています。

### ChatGPT

主に、

- 相談役
- 検討役
- 調査役
- 設計役
- アーキテクチャレビュー
- 問題分析
- デバッグ分析
- 実装計画

として利用しました。

### OpenCode / MiMo

主に、

- 実装
- コード修正
- ビルド・デバッグ支援
- リファクタリング

を担当させました。

### 人間

最終的には人間が、

- 設計判断
- 実行
- 実機テスト
- 動作評価
- 実装結果の確認
- Git commit
- 変更範囲の判断

を担当します。

基本的な開発ループは、

```text
考える
 ↓
相談する
 ↓
設計する
 ↓
仕様化する
 ↓
実装する
 ↓
Buildする
 ↓
テストする
 ↓
観察する
 ↓
再度相談する
 ↓
改善する
```

という流れです。

一つのAIにすべてを丸投げするのではなく、

> **AIにそれぞれ得意な役割を担当させ、人間が最終判断と実機検証を行う**

という方法を採用しました。

詳しい開発方法については `DEVELOPMENT.md` にまとめます。

---

## 15. プロジェクトの位置付け

HomePilotは、完成された商用製品を目指したものではありません。

以下の技術を組み合わせて、

- Web Application
- PWA
- Local Network Service
- Cloudflare
- AI Agent
- Cloud LLM
- Local LLM
- Speech Recognition
- Smart Glasses
- AI-assisted Development

をどこまで個人開発で組み合わせられるかを試す、個人開発プロジェクトです。

また、

> **従来型のソフトウェア開発経験と、現代のAI開発ツールを組み合わせることで、一人の開発者がどこまで大規模な個人開発を行えるか**

を実際に検証するプロジェクトでもあります。

---

## 16. 現在の制約

HomePilotは個人利用を前提とした実験的なシステムであるため、いくつかの制約があります。

例えば、

- ファイルやAgentを利用するには自宅PC上のGatewayが必要
- OpenCodeの利用可否はローカルのOpenCode環境に依存
- Local LLMの挙動は利用するモデルや推論環境に大きく依存
- G2 / EvenHub環境によってスマートグラス側の挙動が変化する可能性がある
- ネットワーク環境によってリモートアクセスの可否が変わる
- 個人環境に最適化しているため、そのまま一般ユーザー向けに配布できるものではない

特にLocal LLMで発生するエラーについては、HomePilot側ではなく、利用しているLocal LLMや推論環境そのものに起因する場合があります。

---

## 17. 利用・ライセンスについて

本リポジトリは主に個人開発および技術検証・技術ポートフォリオを目的として公開しています。

コードは参考・実験用途を想定しています。

別の環境へHomePilotを移植・導入する場合は、

- 認証
- ネットワーク公開範囲
- Gateway
- OpenCode
- Cloudflare
- G2
- 各種Secret

などの設定を十分に確認してください。

特にHomePilot Gatewayを適切なセキュリティ対策なしに直接インターネットへ公開しないでください。

---

## 18. 関連ドキュメント

- `SETUP.md` — 環境構築・起動・動作確認・デプロイ
- `DEVELOPMENT.md` — 開発経緯・設計判断・AI支援開発の方法
