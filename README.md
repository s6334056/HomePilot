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

HomePilot exposes two file systems, and both are browsable from the PC browser, the
Smartphone browser / PWA and the G2.

#### Home PC files (through the Gateway)

Files stored on the home PC are exposed through the HomePilot Gateway. The Gateway runs
on the home PC and restricts access to a configured root directory.

On this side, HomePilot can:

- Browse folders and files
- View text files, with reading position restored
- Create folders and new text files
- Rename, move, copy and delete items
- Upload files and folders, including whole folders
- Download a single file, several files, or a folder as a ZIP archive
- Edit a text file in the viewer and save it back in place

#### Local FileSystem (inside the app)

The Local FileSystem is a small file system that lives inside the app itself. It is
stored in browser `localStorage` under the key `homepilot.localFileSystem` and needs no
Gateway and no network connection.

It supports the same basic operations: browsing, viewing, creating folders and files,
renaming, moving, copying, editing, uploading and deleting.

It is intentionally different from the home PC side:

- It is **text-oriented**. File content is stored inline, so binary files are not
  supported.
- Its capacity is bounded by the browser's `localStorage` limit, which is small. It is
  meant for notes and small files, not for large storage.
- It cannot reach the Agent. The Agent is only available while the home PC file system
  is selected.

#### Copying between the two

The two file systems can be copied to each other from the PWA:

- **"アプリへコピー"** — copy from the home PC to this device
- **"自宅PCへコピー"** — copy from this device to the home PC

Both are available from the Explorer list (for the selected items) and from the
File Viewer (for the file currently being viewed).

"アプリへコピー" is only offered while browsing the home PC file system.
"自宅PCへコピー" is only offered while browsing the Local FileSystem, and requires a
Gateway connection to be configured, because the home PC has to be reached.

#### Hidden files on the home PC

When HomePilot lists the home PC directories through the Gateway, entries carrying the
Windows **Hidden attribute** are filtered out of the listing.

This is a display filter applied by the Gateway, not an access control. Removing the
Hidden attribute makes an entry appear again as usual.

Note that this is based on the Windows Hidden attribute, not on the file name. A file
named `.env` is *not* hidden by this rule, and a file without a leading dot *is* hidden
if it carries the Hidden attribute. On non-Windows hosts the filter does not apply.

---

### 2.2 AI Agent

HomePilot integrates with OpenCode to provide an AI Agent interface.

The Agent supports:

- New sessions
- Existing sessions
- Message history
- Model selection
- Agent responses
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

- Home screen (chooses between the two file systems)
- Explorer
- File Viewer
- History
- Agent Session List
- Model selection
- Agent Chat
- Voice input
- Processing state
- Unread state
- Context-aware Agent interaction
- Navigation between Explorer, History and Agent screens

The G2 UI is designed around the interaction capabilities of the glasses, including:

- Tap
- Double Tap
- Long Press
- Scroll
- Context Menu

The Context Menu is the main way to move between G2 screens. Every screen except the
Home screen offers a **"ホーム画面へ"** entry as the **first** item, which returns to the
Home screen. This is independent from the Double Tap navigation described in
[Section 7](#7-g2-navigation-concept).

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

The Local FileSystem is the exception: it is implemented entirely inside the client and
stored in browser `localStorage`, so it works without the Gateway and without a network
connection.

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

Two independent paths exist.

Home PC files:

```text
PC / Smartphone / G2
        ↓
    HomePilot
        ↓
      Gateway
        ↓
   Home PC filesystem
```

Local FileSystem (no Gateway, no network):

```text
PC / Smartphone / G2
        ↓
    HomePilot
        ↓
Browser localStorage
        ↓
  homepilot.localFileSystem
```

Copying between the two is not a third path: the client performs the copy, reading from
one side and writing to the other. A copy into the home PC therefore still needs the
Gateway.

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

### 5.4 Reading Position and View History

Each file system keeps its own view history and reading position, so that reopening a
file returns the user to roughly where they left off.

- For the **home PC** files, this state belongs to the Gateway, which means the PWA and
  the G2 see the same history and the same reading position for the same file.
- For the **Local FileSystem**, this state belongs to the app, in `localStorage`, and is
  therefore per device.

The Gateway persists this state in a single JSON file:

```text
%LOCALAPPDATA%\HomePilot\.HomePilotViewerState.json
```

It is deliberately kept outside the directory that HomePilot exposes, so the internal
file never shows up in the user's own file listing.

Earlier versions stored the same file directly under the exposed root directory. That
file is still read when present, so existing history and reading positions survive the
upgrade, but nothing is written back to it.

`SETUP.md` documents the exact settings, including the environment variable that
overrides the storage location.

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

The Home screen is the root. It does not browse anything itself; it only asks which of
the two file systems the user wants to work with.

```text
Home
   │
   ├─ Tap → choose App or Home PC
   │
   ▼
Explorer ──Tap──→ Folder / File
   │                  │
   │                  └──Tap──→ File Viewer
   │
   ├─ Context Menu → History
   ├─ Context Menu → Agent
   └─ Context Menu → Home

Agent
   │
   ├─ Tap (first entry) ──→ Model Select ──Tap──→ Chat
   └─ Tap (a session)  ────────────────────────→ Chat
```

Navigation is provided by two separate mechanisms.

**Context Menu** — the general way to move between screens. Every screen except Home
offers "ホーム画面へ" as its first entry, and each screen also offers entries for the
screens reachable from it (History, Explorer, Agent, and so on).

**Double Tap** — screen-specific shortcuts:

| Screen | Double Tap |
|---|---|
| Home | Exit confirmation (closes the app) |
| Explorer | Go to the parent folder; at the root, go to Home |
| File Viewer | Back to Explorer |
| History | Back to where History was opened from; if there is none, go to Home |
| Agent Session List | Go to Home |
| Model Select | Back to Session List |
| Agent Chat | Back to Session List |

Agent navigation preserves the previous Explorer/File Viewer page so that the user can return to the context from which the Agent was opened.

Reaching Home clears the stored return pages, so the next screen entered starts from a
clean state. The choice made on the Home screen is not remembered: the next launch
starts again from the home PC side if a Gateway connection is configured.

---

## 8. Development Status

The major planned functionality of HomePilot has been implemented.

Current major capabilities include:

- PC Explorer
- Smartphone/PWA Explorer
- G2 Explorer
- G2 Home screen
- File Viewer
- View history
- File create / rename / move / copy / delete
- Upload and download (including folder ZIP)
- Text file editing
- Local FileSystem
- Copying between home PC and Local FileSystem
- OpenCode Agent integration
- Agent sessions
- Agent messages
- Permission handling
- Question handling
- Context-aware Agent interaction
- Responsive PWA UI
- Reading position restore
- G2 Agent UI
- G2 navigation
- Processing state
- Processing recovery
- Unread state
- Cross-device unread synchronization
- PWA voice input
- G2 voice input
- Color theme and auto-scroll settings
- G2 startup screen setting
- Local storage usage display
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
- Kilo
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

If you want a working HomePilot rather than a development environment, start with
[`GETTING_STARTED.md`](GETTING_STARTED.md). For the full environment, see
[`SETUP.md`](SETUP.md) and [`DEVELOPMENT.md`](DEVELOPMENT.md).

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

The repository documentation is split by audience.

### GETTING_STARTED.md

Start here if you want to get HomePilot running.

It is a single ordered path from a clean Windows PC to a working HomePilot, covering
the required software, the launcher configuration, the Speech Worker and a local LLM.

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
- ChatGPT / Kilo roles, and the separate role of OpenCode inside HomePilot
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

### Kilo

Kilo is the current main coding agent for developing this repository, and is primarily
used as:

- Implementation agent
- Code modification agent
- Test and build assistant
- Refactoring assistant

### OpenCode

OpenCode is **not** the coding agent used to develop this repository. It has a different,
separate role: OpenCode is the Agent execution layer that HomePilot itself runs on. HomePilot
talks to an OpenCode server at runtime, through the Gateway, in order to execute an Agent
session. In that sense OpenCode is part of the product, not part of the development toolchain.

For historical context, OpenCode and MiMo were the main coding agents during the earlier
phases of this project, and Kilo replaced them as the main coding agent later on.

### Human

The human developer remained responsible for:

- Final design decisions
- Running the application
- Real-device testing
- Evaluating behavior
- Confirming implementation results
- Git commits and pushes
- Deployment
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

- The home PC file system, the Agent and voice input all require the Gateway to be
  running on the home PC. The Local FileSystem works without it.
- The Local FileSystem is limited to the browser's `localStorage` capacity, holds text
  content, and cannot be used with the Agent.
- The storage figures shown in the settings screen are measured values, not available
  capacity. The remaining space and the quota are not shown.
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

- [`GETTING_STARTED.md`](GETTING_STARTED.md) — Shortest path from a clean PC to a running HomePilot
- [`SETUP.md`](SETUP.md) — Environment setup, operation, testing and deployment
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — Development history, architecture decisions and AI-assisted development methodology

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

HomePilotは2つのファイルシステムを提供しており、どちらもPCブラウザ・スマートフォンブラウザ / PWA・Even Realities G2から閲覧できます。

#### 自宅PCのファイル（Gateway経由）

自宅PCに保存されているファイルはHomePilot Gateway経由で参照します。Gatewayは自宅PC上で動作し、設定されたルートディレクトリの外へはアクセスできません。

この側では、以下ができます。

- フォルダ・ファイルの閲覧
- テキストファイルの閲覧（既読位置を復元）
- フォルダと新規テキストファイルの作成
- 名前変更・移動・複製・削除
- ファイル・フォルダのアップロード（フォルダ単位も含む）
- 単一ファイル・複数ファイル・フォルダ（ZIP）のダウンロード
- テキストファイルをビューア上で編集し、そのまま保存

#### アプリ内Local FileSystem

Local FileSystemは、アプリ本体の中だけに存在する小さなファイルシステムです。ブラウザの `localStorage` の `homepilot.localFileSystem` というキーに保存され、Gatewayもネットワークも不要で動作します。

閲覧・表示・フォルダ/ファイル作成・名前変更・移動・複製・編集・アップロード・削除の基本操作は自宅PC側と同じです。

ただし自宅PC側とは、次の違いがあります。

- **テキスト中心**です。内容をそのまま保持するため、バイナリファイルには対応しません。
- 容量はブラウザの `localStorage` 上限に制約されます。大きな保管用途ではなく、メモや小さいファイル向けです。
- Agentは利用できません。Agentは自宅PCのファイルシステムを選択しているときだけ表示されます。

#### 2つのファイルシステム間のコピー

PWAでは、2つのファイルシステム間でコピーできます。

- **「アプリへコピー」** — 自宅PC → この端末
- **「自宅PCへコピー」** — この端末 → 自宅PC

いずれも、Explorerの一覧で選択した項目に対して行えます。FileViewerでも、現在開いているファイルを対象に同じ操作が行えます。

「アプリへコピー」は自宅PCのファイルシステムを閲覧しているときだけ表示されます。
「自宅PCへコピー」はLocal FileSystemを閲覧しているときだけ表示され、自宅PCへ到達する必要があるためGateway接続の設定が必要です。

#### 自宅PC側のHiddenファイル

Gateway経由で自宅PCのフォルダを一覧取得すると、Windowsの **Hidden属性** が付いているファイル／フォルダは一覧から除外されます。

これはGatewayが表示時に行うフィルタであり、アクセス制御ではありません。Hidden属性を解除すると通常どおり表示されます。

この仕様はファイル名ではなくWindowsのHidden属性に基づくものです。`.env` のようにドットで始まる名前は対象外であり、逆にドットで始まらない名前でもHidden属性が付いていれば非表示になります。Windows以外ではこのフィルタは適用されません。

---

### 2.2 AI Agent

OpenCodeと連携してAI Agentを利用できます。

対応している主な機能：

- 新規Session
- 既存Session
- メッセージ履歴
- モデル選択
- Agent回答
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

- ホーム画面（2つのファイルシステムの選択）
- Explorer
- File Viewer
- 履歴
- Agent Session List
- Model Select
- Agent Chat
- 音声入力
- Processing表示
- Unread表示
- コンテキスト付きAgent
- Explorer / 履歴 / Agent間のナビゲーション

を利用できます。

G2固有の操作体系に合わせ、

- Tap
- Double Tap
- Long Press
- Scroll
- Context Menu

を利用しています。

画面間を移動する主な手段がコンテキストメニューです。ホーム画面以外のすべての画面で、
コンテキストメニューの **先頭** に「ホーム画面へ」が並びます。これを選ぶとホーム画面へ
戻ります。[7章](#7-g2ナビゲーション) で説明するDouble Tapによる移動とは別の操作です。

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

例外はLocal FileSystemです。こちらはクライアント内で完結し、ブラウザの `localStorage` に
保存されるため、Gatewayもネットワークも不要で動作します。

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

Local FileSystem（Gatewayもネットワークも不要）：

```text
PC / スマートフォン / G2
        ↓
    HomePilot
        ↓
ブラウザ localStorage
        ↓
  homepilot.localFileSystem
```

2つのファイルシステム間のコピーは3つ目の経路ではありません。クライアントがコピー元の
側を読み、コピー先の側へ書き込みます。自宅PCへのコピーはGatewayが必要です。

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

### 5.4 既読位置と閲覧履歴

各ファイルシステムは、それぞれ独自の閲覧履歴と既読位置を保持します。ファイルを
開き直すと、続き的位置から表示が再開されます。

- **自宅PC**のファイルでは、この状態はGatewayが持ちます。そのためPWAとG2は、
  同じファイルについて同じ履歴・同じ既読位置を共有します。
- **Local FileSystem**では、この状態はアプリの `localStorage` に保存されるため、
  端末ごとに独立します。

Gatewayはこの状態を1つのJSONファイルに保存します。

```text
%LOCALAPPDATA%\HomePilot\.HomePilotViewerState.json
```

HomePilotが公開するディレクトリの外に置くことで、内部管理用ファイルがユーザーの
ファイル一覧に混ざらないようにしています。

従来は、公開ルートディレクトリの直下に同じ名前のファイルを置いていました。その
ファイルが残っている場合は読み取るため、アップグレード後も既存の履歴・既読位置
は失われません。ただし、そこへは書き込みません。

保存先の変更方法は `SETUP.md` を参照してください。

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

ルートはホーム画面です。ホーム画面自体はファイル閲覧などを直接行わず、2つのファイルシステムのどちらを使うかを選ぶだけです。

```text
ホーム
   │
   ├─ Tap → アプリ / 自宅PC を選択
   │
   ▼
Explorer ──Tap──→ Folder / File
   │                  │
   │                  └──Tap──→ File Viewer
   │
   ├─ Context Menu → 履歴
   ├─ Context Menu → Agent
   └─ Context Menu → ホーム

Agent
   │
   ├─ Tap（先頭項目）──→ Model Select ──Tap──→ Chat
   └─ Tap（Session）  ──────────────────────→ Chat
```

画面間の移動は2つの独立した仕組みで提供されています。

**コンテキストメニュー** — 画面間を移動する主な手段です。ホーム画面以外のすべての画面で、
「ホーム画面へ」が先頭項目として並び、その先頭以外にも、その画面から到達できる画面
（履歴、エクスプローラー、エージェントなど）への項目が並びます。

**Double Tap** — 画面ごとのショートカットです。

| 画面 | Double Tap |
|---|---|
| ホーム | 終了確認（アプリを閉じる） |
| Explorer | 親フォルダへ／ルートのときはホームへ |
| File Viewer | Explorerへ戻る |
| 履歴 | 履歴を開いた元画面へ／元が無い場合はホームへ |
| Agent Session List | ホームへ |
| Model Select | Session Listへ戻る |
| Agent Chat | Session Listへ戻る |

Agentを起動する前のExplorer / File Viewerを保持し、Agent利用後に元のコンテキストへ戻れるようにしています。

ホームへ戻ると保持していた戻り先の情報はクリアされます。ホーム画面で選んだファイル
システムも記録されません（Gateway接続が設定されていれば、次回起動時は再び自宅PC側が
選ばれます）。

---

## 8. 開発状況

HomePilotで当初想定していた主要機能は、現在ほぼ実装完了しています。

主な完成機能：

- PC Explorer
- Smartphone/PWA Explorer
- G2 Explorer
- G2 ホーム画面
- File Viewer
- 閲覧履歴
- ファイルの作成 / 名前変更 / 移動 / 複製 / 削除
- アップロード・ダウンロード（フォルダのZIPを含む）
- テキストファイルの編集
- Local FileSystem
- 自宅PCとLocal FileSystem間のコピー
- OpenCode Agent連携
- Agent Session
- Agent Message
- Permission処理
- Question処理
- Context付きAgent
- レスポンシブPWA UI
- 既読位置の復元
- G2 Agent UI
- G2ナビゲーション
- Processing状態
- Processing復旧
- Unread状態
- PWA / G2間Unread同期
- PWA音声入力
- G2音声入力
- カラーテーマと自動スクロールの設定
- G2の起動画面設定
- ローカルストレージ使用量の表示
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
- Kilo
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

開発環境ではなく、実際に動くHomePilotを手に入れたい場合は
[`GETTING_STARTED.md`](GETTING_STARTED.md) から始めてください。全体の環境は
[`SETUP.md`](SETUP.md) と [`DEVELOPMENT.md`](DEVELOPMENT.md) に記載しています。

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

リポジトリ直下のドキュメントは、読み手ごとに役割を分けて構成しています。

### GETTING_STARTED.md

HomePilotを動かしたいときの入口です。

Windows PCの初期状態から、動く状態のHomePilotまでを一続きの手順として説明します。
必要なソフトウェア、launcherの設定、Speech Worker、ローカルLLMを含みます。

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
- ChatGPT / Kilo の役割、およびHomePilot内部でのOpenCodeの位置づけ
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

### Kilo

Kiloは、このリポジトリを開発する現在のメインCoding Agentで、主に、

- 実装
- コード修正
- テスト・ビルド支援
- リファクタリング

を担当します。

### OpenCode

OpenCodeは、このリポジトリを開発するCoding Agentではありません。役割が明確に
分かれています。OpenCodeは、HomePilot自身がAgentを実行するために内部で利用する
実行基盤です。HomePilotは実行時にGateway経由でOpenCodeサーバーと通信し、Agent
Sessionを実行します。つまりOpenCodeは開発ツールではなくプロダクトの一部です。

歴史的には、初期のPhaseではOpenCodeとMiMoが主要的Coding Agentとして使用されて
いましたが、現在はKiloがメインCoding Agentとして置き換わっています。

### 人間

最終的には人間が、

- 設計判断
- 実行
- 実機テスト
- 動作評価
- 実装結果の確認
- Git commit・push
- デプロイ
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

- 自宅PCのファイルシステム・Agent・音声入力を利用するには、自宅PC上のGatewayが必要（Local FileSystemはGatewayなしで動作します）
- Local FileSystemはブラウザの `localStorage` 容量が上限で、テキストのみを扱い、Agentとは併用できません
- 設定画面に表示されるストレージの数値は計測値であり、残り容量ではありません。残容量と上限（quota）は表示しません
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

- [`GETTING_STARTED.md`](GETTING_STARTED.md) — 初期状態のPCから動くHomePilotまでの最短手順
- [`SETUP.md`](SETUP.md) — 環境構築・起動・動作確認・デプロイ
- [`DEVELOPMENT.md`](DEVELOPMENT.md) — 開発経緯・設計判断・AI支援開発の方法
