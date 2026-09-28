
# HomePilot Getting Started

HomePilot runs an AI Agent on your own Windows PC.

This guide takes you from an empty PC to a working HomePilot, in order. Follow
the chapters from top to bottom.

**By the end of this guide you will be able to:**

1. Start HomePilot on your PC
2. Open the PWA in a smartphone browser and connect it to the PC
3. Get an answer from a local LLM through the Agent
4. Browse the files in the folder you allow
5. Copy a file between the PC and the app

This guide does not cover internal design or development. See
`README.md`, `SETUP.md` and `DEVELOPMENT.md` for those.

---

## 1. What HomePilot Is

HomePilot is a personal file and Agent tool for Windows.

- The **Agent** is handled by **OpenCode**, which HomePilot starts for you.
- The **AI model** comes from an OpenAI-compatible server such as **LM Studio**,
  so the model can stay on your own machine.
- You use HomePilot from a **web app (PWA)** — on the PC, on a smartphone, or on
  Even Realities G2 glasses.
- You can **browse and manage files** in the folder you allow HomePilot to use,
  and you can **ask the Agent questions**. The Agent can read files and run tools
  while answering.
- **Voice input** is transcribed by a small Cloudflare Worker.

```text
Smartphone / PC / G2
        │  (web app)
        ▼
   HomePilot PWA
        │
        ▼
   HomePilot Gateway ────── files on your PC
        │
        ▼
   OpenCode Server ────── LM Studio ────── local LLM
        │
        └──────── Speech Worker (voice input)
```

For the full list of features, see `README.md`.

---

## 2. What You Need

### Required

| Item | Why it is needed |
|---|---|
| Windows PC | HomePilot runs on Windows. Windows 11 is the main development environment. |
| Internet connection | Needed on the first run: `npm install`, Wrangler, and the tunnel. |
| Git | To get the source code. |
| GitHub CLI (`gh`) | To clone the repository. |
| Node.js (LTS) and npm | To run HomePilot. |
| OpenCode CLI | The Agent runtime. The Launcher starts it. |
| An LLM for the Agent | This guide uses **LM Studio** (local). A cloud LLM also works; see `SETUP.md`. |
| A Cloudflare account | Needed to run the Speech Worker. See [Chapter 5](#5-gateway-and-the-speech-worker). |

### Recommended

| Item | Why |
|---|---|
| A smartphone | To use HomePilot from the phone. See [Chapter 7](#7-connecting-from-a-smartphone). |

### Optional

| Item | Why |
|---|---|
| Even Realities G2 | To use HomePilot on glasses. See [Chapter 11](#11-using-the-even-realities-g2-optional). |

---

## 3. First-Time Setup

### 3-1. Install the software

Install the required software, then check each one:

```bat
git --version
gh --version
node --version
npm --version
opencode --version
```

If a version number is displayed, that tool is installed.

---

### 3-2. Get HomePilot

```bat
gh auth login
cd C:\
gh repo clone s6334056/HomePilot
```

This creates:

```text
C:\HomePilot
```

This guide calls this the **HomePilot folder**. The actual location can be
anywhere you like; `C:\HomePilot` is only used to keep the examples short.

---

### 3-3. Install the dependencies

```bat
cd C:\HomePilot\gateway
npm install
```

```bat
cd C:\HomePilot\launcher
npm install
```

```bat
cd C:\HomePilot\speech-worker
npm install
```

```bat
cd C:\HomePilot\explorer\cloudflare
npm install
```

The fourth one, `explorer\cloudflare`, is the PWA — the web app you will use. It
will not start without it.

If you use the G2, run `npm install` in `C:\HomePilot\explorer\evenhub` as well.
See [Chapter 11](#11-using-the-even-realities-g2-optional).

---

### 3-4. Create `launcher\.env`

The repository ships a template file. Copy it:

```bat
cd C:\HomePilot\launcher
copy .env.example .env
```

The Launcher reads this file. Three values must be set:

| Name | Meaning |
|---|---|
| `ROOT_PATH` | The folder HomePilot is allowed to use. |
| `HOMEPILOT_WORKER_URL` | URL of the Speech Worker. Set in [Chapter 5](#5-2-set-up-the-speech-worker). |
| `HOMEPILOT_WORKER_SECRET_TOKEN` | Token for the Speech Worker. Set in [Chapter 5](#5-2-set-up-the-speech-worker). |

> **Important** — If any of the three is missing, the Launcher stops with
> "Configuration missing".

---

### 3-5. Create the `ROOT_PATH` folder

**Create this folder before starting HomePilot.** If it does not exist, the
Launcher stops with "Root folder not found".

```bat
mkdir C:\HomePilotWork
```

Then set it in `launcher\.env`:

```env
ROOT_PATH=C:\HomePilotWork
```

Everything in this folder is what the Explorer and the Agent can see. Choose a
dedicated folder such as `C:\HomePilotWork` rather than your whole drive.

> **Reached this point?** Git, Node.js and OpenCode CLI are installed, the
> repository is cloned, `npm install` has finished in four folders, and
> `launcher\.env` has `ROOT_PATH` set.

---

## 4. Preparing OpenCode and the Agent

HomePilot does not run the Agent by itself. It uses **OpenCode** as its internal
Agent runtime. The Launcher starts OpenCode for you, so you do not run it by
hand. What you do need to do is tell OpenCode which model to use.

### 4-1. Tell OpenCode about LM Studio

LM Studio serves the model as an OpenAI-compatible API. Register it in OpenCode's
configuration file:

```text
%USERPROFILE%\.config\opencode\opencode.json
```

Create the file if it does not exist:

```text
%USERPROFILE%
└─ .config
   └─ opencode
      └─ opencode.json
```

Example:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1234/v1"
      },
      "models": {
        "qwen3.5-4b": {
          "name": "Qwen3.5-4B(local)"
        }
      }
    }
  }
}
```

> This is an example of a configuration in use, not the only correct one.
> Replace `qwen3.5-4b` with the model ID shown in LM Studio.

---

### 4-2. Download and load the model in LM Studio

1. Start LM Studio and download the model you want to use.
2. Start the **Local Server**. Its OpenAI-compatible API is normally at
   `http://127.0.0.1:1234/v1`.

To avoid loading the model by hand every time, add this to `launcher\.env`. The
Launcher then loads the model before it starts OpenCode:

```env
LOCAL_MODEL=qwen3.5-4b
```

> This is optional. If you set it, the value must exactly match a model in LM
> Studio, or the Launcher stops with an error.

> **Reached this point?** LM Studio is running, its Local Server is started, and
> `opencode.json` names the same model.

---

## 5. Gateway and the Speech Worker

### 5-1. What runs

| Process | Started by | Address |
|---|---|---|
| LM Studio | You | `http://127.0.0.1:1234` |
| Gateway | Launcher | `http://127.0.0.1:51887` |
| OpenCode Server | Launcher | `http://127.0.0.1:4096` |
| Speech Worker | You — see [5-2](#5-2-set-up-the-speech-worker) | Depends on the method |
| PWA | You — see [Chapter 6](#6-starting-homepilot) | `http://localhost:5174` |

The **Gateway** is the bridge between the PWA and your PC. It reads and writes
files in `ROOT_PATH` on behalf of the PWA, and it forwards Agent requests to
OpenCode. Because the Gateway is configured by the Launcher, the Launcher cannot
start without the Speech Worker settings.

### 5-2. Set up the Speech Worker

> **Required.** `HOMEPILOT_WORKER_URL` and `HOMEPILOT_WORKER_SECRET_TOKEN` must
> both be set in `launcher\.env`. If either is missing, the Launcher stops with
> "Configuration missing".

Choose one of the following.

#### Method A: Run it on your PC

Easiest way to try HomePilot first.

1. Create `speech-worker\.dev.vars` and put a long random token in it:

   ```bat
   cd C:\HomePilot\speech-worker
   notepad .dev.vars
   ```

   ```
   WORKER_SECRET_TOKEN="put-a-long-random-token-here"
   ```

2. Start the Worker:

   ```bat
   npm run dev
   ```

   The URL is normally:

   ```text
   http://127.0.0.1:8787
   ```

   > **Keep this window open** while using HomePilot. The first run may ask you
   > to log in to Cloudflare, because the Worker uses a Cloudflare service.

3. Write both values into `launcher\.env`:

   ```env
   HOMEPILOT_WORKER_URL=http://127.0.0.1:8787
   HOMEPILOT_WORKER_SECRET_TOKEN=put-a-long-random-token-here
   ```

   > The token in `.dev.vars` and the token in `launcher\.env` **must be exactly
   > the same string**.

#### Method B: Deploy it to Cloudflare

Deploy the Worker to Cloudflare, obtain its URL, set the secret token on the
Worker, then write both values into `launcher\.env`. The detailed steps are in
`SETUP.md`.

> Method A is only available while the Worker window is open. Use Method B if you
> want HomePilot to work without keeping that window open.

> **Reached this point?** `launcher\.env` has `ROOT_PATH`,
> `HOMEPILOT_WORKER_URL` and `HOMEPILOT_WORKER_SECRET_TOKEN` set, and the Speech
> Worker is running.

---

## 6. Starting HomePilot

Three processes are needed. Start them in this order.

### 6-1. Start LM Studio

Load the model and start the Local Server.

### 6-2. Start the Launcher

```bat
cd C:\HomePilot\launcher
start-homepilot.bat
```

The Launcher starts the Gateway, then OpenCode, then the connection to the
Internet. Wait until it prints something like this:

```text
HomePilot Gateway
-----------------
  Root     : C:\HomePilotWork
  Gateway  : http://127.0.0.1:51887
  OpenCode : http://127.0.0.1:4096
  Token    : [REDACTED]
  Worker   : http://127.0.0.1:8787

Quick Tunnel
  Status : READY
  URL    : https://xxxxxxxx.trycloudflare.com

Connection JSON
{"type":"homepilot-connection","version":1,"url":"https://xxxxxxxx.trycloudflare.com","token":"..."}

Connection QR
```

The QR code is printed under **Connection JSON**.
[Chapter 7](#7-connecting-from-a-smartphone) uses both.

> **Keep this window open.** Everything stops when it is closed. Press `Ctrl+C` to
> stop HomePilot. See [Chapter 12](#12-stopping-homepilot).

You can also point the Launcher at a different folder for one run:

```bat
start-homepilot.bat C:\HomePilotWork
```

This overrides `ROOT_PATH` for that run.

### 6-3. Start the PWA

The Launcher does not start the web app. Start it in a second window:

```bat
cd C:\HomePilot\explorer\cloudflare
npm run dev
```

Then open it in your browser:

```text
http://localhost:5174
```

> **Reached this point?** `http://localhost:5174` opens and shows the HomePilot
> home screen.

---

## 7. Connecting from a Smartphone

The PWA needs two things: the address of the PWA itself, and the connection
information for the Gateway (its URL and token). The Launcher prints the second
one as **Connection JSON** and as a **QR code**.

### 7-1. On the PC

1. Keep the Launcher window open.
2. Copy the JSON shown under **Connection JSON**.
3. Note the address of this PC on your home network. Run `ipconfig` and look for
   the IPv4 address, for example `192.168.0.2`.

### 7-2. On the smartphone

1. Open the smartphone browser and go to the PWA on the PC:

   ```text
   http://<your PC's IP address>:5174
   ```

   For example `http://192.168.0.2:5174`.

   > The PC and the smartphone must be on the same network. If the page does not
   > open, see [Chapter 13](#13-when-something-does-not-work).

2. Tap the Settings icon (gear) in the top right.
3. Under 接続情報, paste the Connection JSON and tap 適用.
4. When it is connected, the home screen shows アプリ and 自宅PC.

   > If モック（開発用） is still shown, the connection did not complete. Paste the
   > JSON again.

   > On the PC itself, open `http://localhost:5174` and do the same thing.

5. Tap 自宅PC.

**When connected**

- 自宅PC shows the files in `ROOT_PATH`.
- The Agent becomes available.
- アプリ is a storage area inside that browser, usable without a connection.

### 7-3. Scanning the QR code instead

The same 接続情報 section has a QR scan button. Tap it and point the camera at
the QR code shown in the Launcher window.

> The camera is only available on `https://` or `localhost`. If the button
> reports that the camera is unavailable, use the paste method above instead.
> `SETUP.md` describes how to get `https://` access.

### 7-4. Notes

- You can add the PWA to the smartphone's home screen from the browser menu.
- The connection information is stored in that browser, so you normally paste it
  once per device.
- The token changes every time the Launcher starts. If HomePilot stops working
  after restarting the Launcher, paste the new JSON again.

> **Reached this point?** You can open 自宅PC from the smartphone and see the
> folder you created in [3-5](#3-5-create-the-root_path-folder).

---

## 8. Trying the Agent in the PWA

The Agent is available from 自宅PC.

### 8-1. Open the Agent

- **On a PC browser:** the Explorer and the Agent are shown side by side. Use the
  swap button (⇄) to switch between them.
- **On a smartphone:** tap the Agent icon in the Explorer bar.

> The Agent is not shown while アプリ is selected.

### 8-2. Create a session and ask a question

1. Tap **New Session**.
2. Type a question, for example `What files are in this folder?`
3. Send it.
4. `Processing...` is shown while the Agent is working.

### 8-3. When a permission dialog appears

The Agent sometimes needs permission before using a tool. A 権限の確認 dialog
appears. Choose whether to allow it, allow it always, or deny it.

If you deny it, the Agent continues without that tool.

### 8-4. When a question appears

When the Agent needs a decision, it shows a question with choices. Tap a choice,
or type your own answer in 自由入力 and send it.

If you do nothing, the Agent waits. That is not an error.

### 8-5. When the answer is complete

The answer is shown in the conversation, and the session can be reopened from the
session list later.

> **Reached this point?** You received an answer containing text from the local
> LLM.

### 8-6. Voice input (optional)

If you set up the Speech Worker in [5-2](#5-2-set-up-the-speech-worker), you can
speak instead of typing. The audio is converted to text and shown, and you can
check it before sending it to the Agent.

---

## 9. Browsing and Working with Files

Selecting 自宅PC shows the files in `ROOT_PATH`.

### 9-1. Basic operations

| What you want | How |
|---|---|
| Open a folder | Tap it |
| Open a file | Tap it — it opens in the viewer |
| Go back | Back button |
| Reload | Refresh button |
| Change the sort order | Actions (⋯) → 並び順切替 |
| Create a folder | Actions (⋯) → フォルダを作成 |
| Rename | Select it → Actions (⋯) → 名前を変更 |
| Delete | Select it → Actions (⋯) → 削除 |

> The Actions menu (⋯) is at the right edge of the path bar.

### 9-2. Two kinds of storage

| Label | What it is |
|---|---|
| 自宅PC | The real folder on your PC. Changes are applied to the actual files. |
| アプリ | A storage area inside the browser on the device you are using. Nothing is written to the PC. |

### 9-3. Things that may surprise you

- **Files with the Windows Hidden attribute are not listed.** This is based on
  the attribute, not on the file name, and it is not a permission setting. If a
  file you expected is missing, check the Hidden attribute in File Explorer.
  `SETUP.md` has the details.
- **Files over 10 MB cannot be opened for viewing.** Download them instead.
- **HomePilot manages a few files internally.** For example, the reading position
  of files you have opened is remembered automatically, in a file HomePilot keeps
  outside the folder you browse. You do not need to create, edit or delete these
  files, and they do not appear in the file list. `SETUP.md` explains where they
  are stored.

---

## 10. Copying Files Between the PC and the App

The アプリ storage belongs to the device you are using. Copying a file into the
app on your smartphone gives you a copy on the smartphone that also works without
a connection.

### 10-1. From the PC to the app

1. Open 自宅PC and select a file.
2. Actions (⋯) → **アプリへコピー**.
3. If a file with the same name already exists, confirm 上書きしてコピー.

### 10-2. From the app back to the PC

1. Open アプリ and select a file.
2. Actions (⋯) → **自宅PCへコピー**.
3. Choose the destination folder.
4. The file is written into that folder on your PC.

> 自宅PCへコピー is only shown while アプリ is selected and a connection is
> configured.

### 10-3. Where to check afterwards

- After アプリへコピー, open アプリ.
- After 自宅PCへコピー, open 自宅PC.

> **Reached this point?** You copied a file from 自宅PC to アプリ and confirmed it
> in アプリ.

> The app storage uses the browser's own local storage, so its capacity is
> limited. `SETUP.md` describes the numbers shown in the settings screen.

---

## 11. Using the Even Realities G2 (Optional)

If you do not have a G2, skip this chapter. Everything up to
[Chapter 10](#10-copying-files-between-the-pc-and-the-app) is enough to use
HomePilot.

The G2 runs the same PWA. When the PWA is opened on the G2, it switches to the G2
interface on its own. What differs is the operation method — tap, double tap,
long press — and which features are available.

### 11-1. What is needed

| Item | Why |
|---|---|
| Even Realities G2 | The device itself |
| An EvenHub environment | The environment the G2 app runs in |
| `explorer\evenhub` | The app for the G2. Installed in [3-3](#3-3-install-the-dependencies). |

### 11-2. Three ways to try it

| Method | Command | What you need |
|---|---|---|
| Simulator | `cd explorer\evenhub` then `npm run simulator` | Nothing. Runs on the PC. |
| QR test | `npm run qr` | An EvenHub environment |
| Device | `npm run pack`, then upload the generated `.ehpk` | An EvenHub environment and the physical G2 |

The G2 loads the PWA from a URL. That URL is currently written directly in the
source file `explorer\evenhub\src\App.tsx`, so if you host the PWA somewhere
else, change it there and rebuild.

### 11-3. First thing to try

1. Open the app on the G2.
2. Tap 自宅PC.
3. Open the Agent and send one message.

> **Reached this point?** The home screen appears on the G2 and 自宅PC opens.

> The G2 has its own limits for long press, voice input and screen size.
> `SETUP.md` and `DEVELOPMENT.md` describe them.

---

## 12. Stopping HomePilot

Press `Ctrl+C` in the Launcher window. The Gateway, OpenCode and the tunnel are
stopped together, and the window shows:

```text
HomePilot stopped.
```

Stop the other windows as well:

| Window | How to stop it |
|---|---|
| Launcher | `Ctrl+C` |
| PWA (`npm run dev`) | `Ctrl+C` |
| Speech Worker (`npm run dev`, Method A) | `Ctrl+C` |
| LM Studio | Quit from the tray |

> Nothing is written to disk when stopping, so it is safe to stop at any time.
> Close these windows before shutting down the PC.

To start again, repeat [Chapter 6](#6-starting-homepilot). Because the token
changes, reconnect the PWA with the new Connection JSON.

---

## 13. When Something Does Not Work

Only the most common cases are listed. `SETUP.md` has the full troubleshooting
guide.

### The Launcher stops immediately

| Message | What to do |
|---|---|
| `Root folder not found` | The `ROOT_PATH` folder does not exist. See [3-5](#3-5-create-the-root_path-folder). |
| `Configuration missing` | `HOMEPILOT_WORKER_URL` or `HOMEPILOT_WORKER_SECRET_TOKEN` is not set. See [5-2](#5-2-set-up-the-speech-worker). |
| `cloudflared.exe was not found` | `tools\cloudflared.exe` is missing. Clone the repository again. |
| `Port 51887 may already be in use` | A previous Launcher is still running. Close it and start again. |
| `Local Model Load Failed` | The `LOCAL_MODEL` value does not exist in LM Studio. See [4-2](#4-2-download-and-load-the-model-in-lm-studio). |

### The Agent does not answer

1. Is LM Studio running, with the Local Server started?
2. Does the model ID in `opencode.json` match a model in LM Studio?
3. Did the Launcher print `OpenCode Server is ready.`?
4. Is the model small enough for your PC? A large model may simply be too slow.

### The smartphone cannot open the page

1. Are the PC and the smartphone on the same network?
2. Is the PWA running? (`npm run dev` in `explorer\cloudflare`)
3. Is the address still correct? Check with `ipconfig` — the PC's address can change.
4. Is Windows Firewall blocking it? Allow Node.js on private networks when asked.

### 自宅PC cannot connect on the smartphone

1. Has the Connection JSON been pasted into the smartphone's settings?
2. Is the Launcher window still open?
3. Was the Launcher restarted after the JSON was pasted? The token changes, so paste it again.
4. If `自宅PC（Gateway）に接続できませんでした。` appears, the connection information is not set.

### Voice input does not work

1. Is the Speech Worker window still open? (Method A)
2. Is the token in `.dev.vars` exactly the same as the one in `launcher\.env`?
3. Is `HOMEPILOT_WORKER_URL` correct?

### The QR scan button reports that the camera is unavailable

The camera only works on `https://` or `localhost`. Use the paste method in
[7-2](#7-2-on-the-smartphone), or see `SETUP.md` for `https://` access.

### A file is not listed

Check the Windows Hidden attribute. See [9-3](#9-3-things-that-may-surprise-you).

---

## 14. Where to Read More

| If you want to know | Read |
|---|---|
| What HomePilot can do, and what is implemented now | `README.md` |
| Detailed setup for each component, production deployment, the G2 in detail, full troubleshooting | `SETUP.md` |
| Internal structure, design decisions, development policy | `DEVELOPMENT.md` |

---

# HomePilot セットアップ手順

HomePilotは、自分のWindows PC上でAI Agentを動かすツールです。

このガイドでは、空のPCからHomePilotが動くところまで、手順どおりに進めます。
**上から順番に読み進めてください。**

**このガイドを読み終えると、次のことができるようになります。**

1. PCでHomePilotを起動する
2. スマートフォンのブラウザでPWAを開いて、PCと接続する
3. ローカルLLMからAgentの回答を受け取る
4. 許可したフォルダのファイルを見る
5. PCとアプリの間でファイルをコピーする

内部設計や開発の話は、このガイドでは扱いません。
詳しくは `README.md`、`SETUP.md`、`DEVELOPMENT.md` を参照してください。

---

## 1. HomePilotとは

HomePilotは、Windows向けの、个人用ファイル・Agentツールです。

- **Agent** は **OpenCode** が担当します。HomePilotが自動で起動します。
- **AIモデル** は **LM Studio** などのOpenAI互換サーバーから取得します。
  モデルを自分のPC内に置くこともできます。
- HomePilotは **PWA（ウェブアプリ）** 経由で使います。
  PC・スマートフォン・Even Realities G2のいずれからでも操作できます。
- **HomePilotがアクセスを許可したフォルダ** のファイルを閲覧・操作できます。
  作成・移動・コピー・削除も行えます。
- **Agentに質問** できます。Agentは回答のためにファイルを読み込んだり、
  ツールを実行したりします。
- **音声入力** は、Cloudflare Workerが文字起こしを行います。

```text
スマートフォン / PC / G2
        │  （PWA）
        ▼
   HomePilot PWA
        │
        ▼
   HomePilot Gateway ────── PC上のファイル
        │
        ▼
   OpenCode Server ────── LM Studio ────── ローカルLLM
        │
        └──────── Speech Worker（音声入力）
```

機能の全体像は `README.md` を参照してください。

---

## 2. 必要なもの

### 必須

| 項目 | 用途 |
|---|---|
| Windows PC | HomePilotはWindowsで動作します。開発は主にWindows 11です。 |
| インターネット接続 | 初回のみ必要です（`npm install`、Wrangler、トンネル）。 |
| Git | ソースコードの取得。 |
| GitHub CLI（`gh`） | リポジトリのclone。 |
| Node.js（LTS）とnpm | HomePilotの実行。 |
| OpenCode CLI | Agent実行基盤。Launcherが起動します。 |
| Agentが使うLLM | このガイドでは **LM Studio（ローカル）** を使います。クラウドLLMも利用可能です。`SETUP.md` を参照。 |
| Cloudflareアカウント | Speech Workerの実行に必要。［第5章](#5-gateway-と-speech-worker)を参照。 |

### 推奨

| 項目 | 用途 |
|---|---|
| スマートフォン | スマホからHomePilotを使う場合。［第7章](#7-スマートフォンから-homepilot-に接続する)を参照。 |

### 任意

| 項目 | 用途 |
|---|---|
| Even Realities G2 | スマートグラスでHomePilotを使う場合。［第11章］(#11-even-realities-g2-を使う場合任意)を参照。 |

---

## 3. 初回セットアップ

### 3-1. ソフトをインストールする

必要なソフトをインストールし、以下のコマンドで確認します。

```bat
git --version
gh --version
node --version
npm --version
opencode --version
```

バージョンが表示されれば、インストールは成功しています。

---

### 3-2. HomePilotを取得する

```bat
gh auth login
cd C:\
gh repo clone s6334056/HomePilot
```

これで次のようなフォルダが作成されます。

```text
C:\HomePilot
```

このガイドでは、このフォルダを **HomePilotフォルダ** と呼びます。
実際の場所はどこでも構いません。`C:\HomePilot` は例を短くするためだけのものです。

---

### 3-3. 依存パッケージをインストールする

```bat
cd C:\HomePilot\gateway
npm install
```

```bat
cd C:\HomePilot\launcher
npm install
```

```bat
cd C:\HomePilot\speech-worker
npm install
```

```bat
cd C:\HomePilot\explorer\cloudflare
npm install
```

4番目の `explorer\cloudflare` が、後から使うPWA（ウェブアプリ）です。
これをインストールしないとPWAは起動しません。

G2を使う場合は、`C:\HomePilot\explorer\evenhub` でも `npm install` を実行します。
［第11章](#11-even-realities-g2-を使う場合任意)を参照。

---

### 3-4. `launcher\.env` を作る

リポジトリにテンプレートファイルがあります。コピーして使います。

```bat
cd C:\HomePilot\launcher
copy .env.example .env
```

Launcherはこのファイルを読み込みます。以下の3つを設定する必要があります。

| 名前 | 意味 |
|---|---|
| `ROOT_PATH` | HomePilotが操作できるフォルダ。 |
| `HOMEPILOT_WORKER_URL` | Speech WorkerのURL。［5-2](#5-2-speech-worker-を設定する)で設定します。 |
| `HOMEPILOT_WORKER_SECRET_TOKEN` | Speech Workerのトークン。［5-2](#5-2-speech-worker-を設定する)で設定します。 |

> **重要** — 3つのうちどれかが欠けると、Launcherは
> "Configuration missing" を表示して起動せず停止します。

---

### 3-5. `ROOT_PATH` のフォルダを作る

**HomePilotを起動する前に、このフォルダを作成してください。**
存在しないと、Launcherは "Root folder not found" を表示して起動せず停止します。

```bat
mkdir C:\HomePilotWork
```

そして、`launcher\.env` に設定します。

```env
ROOT_PATH=C:\HomePilotWork
```

このフォルダの中身が、ExplorerとAgentから見える範囲です。
ドライブ全体ではなく、`C:\HomePilotWork` のような専用フォルダを指定してください。

> **ここまでできましたか？**
> Git・Node.js・OpenCode CLI のインストール、リポジトリの取得、4つのフォルダでの
> `npm install`、`launcher\.env` の `ROOT_PATH` 設定が完了しました。

---

## 4. OpenCode と Agent の準備

HomePilotは、単独でAgentを動かしません。
**OpenCode** を内部のAgent実行基盤として利用します。
OpenCodeの起動はLauncherが行うので、手動で起動する必要はありません。
あなたがすべきのは「OpenCodeにどのモデルを使うか」を伝えることです。

### 4-1. OpenCode に LM Studio を設定する

LM Studioは、モデルをOpenAI互換APIとして提供します。
OpenCodeの設定ファイルに登録します。

```text
%USERPROFILE%\.config\opencode\opencode.json
```

存在しない場合は作成してください。

```text
%USERPROFILE%
└─ .config
   └─ opencode
      └─ opencode.json
```

例:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1234/v1"
      },
      "models": {
        "qwen3.5-4b": {
          "name": "Qwen3.5-4B(local)"
        }
      }
    }
  }
}
```

> これは現在使っている構成例であり、唯一の正解ではありません。
> `qwen3.5-4b` の部分は、LM Studioに表示されている実際のモデルIDに置き換えてください。

---

### 4-2. LM Studio でモデルを用意する

1. LM Studioを起動し、使用したいモデルをダウンロードします。
2. **Local Server** を開始します。OpenAI互換APIは通常
   `http://127.0.0.1:1234/v1` で動作します。

毎回手動でモデルをロードするのを避けるには、`launcher\.env` に次を追加します。
LauncherがOpenCodeを起動する前にモデルを読み込みます。

```env
LOCAL_MODEL=qwen3.5-4b
```

> これは任意です。設定する場合は、LM Studioに実在するモデルIDと
> 正確に一致させてください。違う場合はLauncherがエラーで停止します。

> **ここまでできましたか？**
> LM Studioが起動し、Local Serverを開始し、`opencode.json` に
> 同じモデルが指定できました。

---

## 5. Gateway と Speech Worker

### 5-1. 起動するプロセス

| プロセス | 起動するのは | アドレス |
|---|---|---|
| LM Studio | あなた | `http://127.0.0.1:1234` |
| Gateway | Launcher | `http://127.0.0.1:51887` |
| OpenCode Server | Launcher | `http://127.0.0.1:4096` |
| Speech Worker | あなた — ［5-2](#5-2-speech-worker-を設定する)を参照 | 方法によって異なります |
| PWA | あなた — ［第6章](#6-homepilot-を起動する)を参照 | `http://localhost:5174` |

**Gateway** はPWAとPCをつなぐ橋渡し役です。PWAからの依頼を受けて
`ROOT_PATH` 内のファイルを読み書きし、Agentの依頼をOpenCodeへ 전달します。
Gatewayの設定はLauncherが行うため、**LauncherはSpeech Workerの設定がないと
起動できません**。

### 5-2. Speech Worker を設定する

> **必須です。** `HOMEPILOT_WORKER_URL` と `HOMEPILOT_WORKER_SECRET_TOKEN` は
> 両方とも `launcher\.env` に設定する必要があります。
> どちらかが欠けると、Launcherは "Configuration missing" を表示して停止します。

以下のどちらかを選んでください。

#### 方法A：自分のPCで動かす

まずHomePilotを試すなら、方法Aから試すのがおすすめです。

1. `speech-worker\.dev.vars` を作り、長いランダムトークンを記入します。

   ```bat
   cd C:\HomePilot\speech-worker
   notepad .dev.vars
   ```

   ```
   WORKER_SECRET_TOKEN="put-a-long-random-token-here"
   ```

2. Workerを起動します。

   ```bat
   npm run dev
   ```

   URLは通常次のようになります。

   ```text
   http://127.0.0.1:8787
   ```

   > **このウィンドウは開いたままにしてください。**
   > 初回はCloudflareへのログインを求められることがあります。
   > WorkerがCloudflareのサービスを利用するためです。

3. 2つの値を `launcher\.env` に記入します。

   ```env
   HOMEPILOT_WORKER_URL=http://127.0.0.1:8787
   HOMEPILOT_WORKER_SECRET_TOKEN=put-a-long-random-token-here
   ```

   > `.dev.vars` のトークンと `launcher\.env` のトークンは
   > **完全に同じ文字列**でなければなりません。

#### 方法B：Cloudflareにデプロイする

WorkerをCloudflareにデプロイし、URLを取得し、Worker側にトークンを設定してから、
2つの値を `launcher\.env` に記入します。具体的な手順は `SETUP.md` にあります。

> 方法Aは、Workerのウィンドウを開いている間だけ利用できます。
> ウィンドウを開きたくない場合や、外出先でも音声入力を使いたい場合は方法Bを使ってください。

> **ここまでできましたか？**
> `launcher\.env` に `ROOT_PATH`、`HOMEPILOT_WORKER_URL`、
> `HOMEPILOT_WORKER_SECRET_TOKEN` が設定でき、Speech Workerが起動しています。

---

## 6. HomePilot を起動する

3つのプロセスが必要です。下の順番で起動してください。

### 6-1. LM Studio を起動する

モデルを読み込み、Local Serverを開始します。

### 6-2. Launcher を起動する

```bat
cd C:\HomePilot\launcher
start-homepilot.bat
```

Launcherは、Gateway、OpenCode、インターネットへの接続の順に起動します。
次のような表示が出るまで待ってください。

```text
HomePilot Gateway
-----------------
  Root     : C:\HomePilotWork
  Gateway  : http://127.0.0.1:51887
  OpenCode : http://127.0.0.1:4096
  Token    : [REDACTED]
  Worker   : http://127.0.0.1:8787

Quick Tunnel
  Status : READY
  URL    : https://xxxxxxxx.trycloudflare.com

Connection JSON
{"type":"homepilot-connection","version":1,"url":"https://xxxxxxxx.trycloudflare.com","token":"..."}

Connection QR
```

**Connection JSON** の下にQRコードが表示されます。
［第7章](#7-スマートフォンから-homepilot-に接続する)で両方を使います。

> **このウィンドウは開いたままにしてください。**
> 閉じるとすべて停止します。`Ctrl+C` でHomePilotを停止できます。
> ［第12章](#12-終了するとき)を参照してください。

1回だけ別のフォルダを使うこともできます。

```bat
start-homepilot.bat C:\HomePilotWork
```

この指定は、その実行のみ `ROOT_PATH` を上書きします。

### 6-3. PWA を起動する

Launcherはウェブアプリを起動しません。別のウィンドウで起動してください。

```bat
cd C:\HomePilot\explorer\cloudflare
npm run dev
```

ブラウザで次のように開きます。

```text
http://localhost:5174
```

> **ここまでできましたか？**
> `http://localhost:5174` が開き、HomePilotのホーム画面が表示されます。

---

## 7. スマートフォンから HomePilot に接続する

PWAには、次の2つが必要です。

- PWA自体のアドレス
- Gatewayの接続情報（URLとトークン）

後者はLauncherが **Connection JSON** と **QRコード** として表示します。

### 7-1. PC側で行うこと

1. Launcherのウィンドウを開いたままにします。
2. **Connection JSON** の下に表示されているJSONをコピーします。
3. このPCの自宅ネットワーク上のアドレスを控えます。
   `ipconfig` を実行し、IPv4アドレス（例：`192.168.0.2`）を探してください。

### 7-2. スマートフォン側で行うこと

1. スマートフォンのブラウザで、PC上のPWAを開きます。

   ```text
   http://<PCのIPアドレス>:5174
   ```

   たとえば `http://192.168.0.2:5174` です。

   > PCとスマートフォンが同じネットワークにある必要があります。
   > 開けない場合は［第13章](#13-困ったとき)を参照してください。

2. 右上のSettingsアイコン（歯車）をタップします。
3. 接続情報の欄に Connection JSON を貼り付け、適用 をタップします。
4. 接続されると、ホーム画面に アプリ と 自宅PC が表示されます。

   > まだ モック（開発用） が表示されている場合は、接続ができていません。
   > JSON を貼り付け直してください。

   > PC 自身で使う場合は、`http://localhost:5174` を開いて同じ操作を行います。

5. 自宅PC をタップします。

**接続できたときの変化**

- 自宅PC では `ROOT_PATH` のファイルが表示されます。
- Agentが使えるようになります。
- アプリ はそのブラウザ内の保存領域で、接続なしでも使えます。

### 7-3. QRコードを読み取る場合

接続情報の欄にはQRスキャン用のボタンがあります。
タップして、Launcherウィンドウに表示されたQRコードにカメラを向けます。

> カメラは `https://` または `localhost` でのみ利用できます。
> カメラが利用できないという表示が出た場合は、上記の貼り付け方法を使ってください。
> `https://` でのアクセス方法は `SETUP.md` に記載があります。

### 7-4. 補足

- ブラウザのメニューから、PWAをスマートフォンのホーム画面に追加できます。
- 接続情報はそのブラウザに保存されるため、通常は端末ごとに1回貼り付けるだけです。
- トークンはLauncherを起動するたびに変わります。Launcherを再起動した後に
  接続できない場合は、新しいJSONを貼り付け直してください。

> **ここまでできましたか？**
> スマートフォンから自宅PCを開き、［3-5](#3-5-root_path-のフォルダを作る)で
> 作ったフォルダの中質が見えます。

---

## 8. PWA で Agent を使ってみる

Agentは 自宅PC から使えます。

### 8-1. Agent を開く

- **PCのブラウザの場合**：ExplorerとAgentが横に並びます。
  入れ替えボタン（⇄）で切り替えられます。
- **スマートフォンの場合**：ExplorerのバーのAgentアイコンをタップします。

> アプリ を選択しているときは、Agentは表示されません。

### 8-2. セッションを作って質問する

1. **New Session** をタップします。
2. 質問を入力します。例：`What files are in this folder?`
3. 送信します。
4. Agentが作業している間、`Processing...` と表示されます。

### 8-3. 権限の確認ダイアログが表示された場合

Agentがツールを使う前に、権限の確認が必要になることがあります。
権限の確認 ダイアログが表示されたら、許可・常に許可・拒否 のいずれかを選びます。

拒否した場合、Agentはそのツールを使わずに処理を続けます。

### 8-4. 質問が表示された場合

Agentが判断を必要とするときは、選択肢付きの質問を表示します。
選択肢をタップするか、自由入力 に回答を入力して送信してください。

何もしない場合、Agentはそのまま待ちます。エラーではありません。

### 8-5. 回答が完了したとき

回答は会話の中に表示されます。セッションは、あとでセッション一覧から
もう一度開けます。

> **ここまでできましたか？**
> ローカルLLMからのテキストを含む回答を受け取りました。

### 8-6. 音声入力（任意）

［5-2](#5-2-speech-worker-を設定する)でSpeech Workerを設定した場合は、
入力する代わりに話すこともできます。音声がテキストに変換されて表示されるので、
送信する前に内容を確認できます。

---

## 9. ファイルを見る・操作する

自宅PC を選ぶと、`ROOT_PATH` のファイルが表示されます。

### 9-1. 基本の操作

| やりたいこと | 操作 |
|---|---|
| フォルダを開く | タップする |
| ファイルを開く | タップする（ビューアで開きます） |
| 戻る | 戻るボタン |
| 再読み込み | リフレッシュボタン |
| 並び順を変える | Actions（⋯）→ 並び順切替 |
| フォルダを作る | Actions（⋯）→ フォルダを作成 |
| 名前を変える | 選択 → Actions（⋯）→ 名前を変更 |
| 削除する | 選択 → Actions（⋯）→ 削除 |

> Actionsメニュー（⋯）は、パスバーの右端にあります。

### 9-2. 2種類の保存場所

| 表示 | 中身 |
|---|---|
| 自宅PC | PC上の実際のフォルダ。変更は実ファイルに反映されます。 |
| アプリ | いま使っている端末のブラウザ内の保存領域。PCには何も書き込まれません。 |

### 9-3. 知っておくとよいこと

- **WindowsのHidden属性が付いたファイル・フォルダは表示されません。**
  これはファイル名ではなくHidden属性に基づく表示であり、アクセス制御では
  ありません。探しているファイルが見つからない場合は、ファイルエクスプローラーで
  Hidden属性を確認してください。詳細は `SETUP.md` に記載があります。
- **10MBを超えるファイルは内容を開けません。** ダウンロードしてください。
- **HomePilotは内部でいくつかのファイルを管理します。** たとえば、開いたファイルの
  既読位置は自動的に記憶されます。このファイルは、閲覧するフォルダの外側に
  HomePilotが保持します。自分で作ったり編集したり削除したりする必要はなく、
  一覧にも表示されません。保存場所は `SETUP.md` に記載があります。

---

## 10. PCとアプリの間でファイルをコピーする

アプリの保存領域は、使っている端末ごとにあります。スマートフォンのアプリに
コピーすれば、接続がない状態でも使えるコピーを手元に用意できます。

### 10-1. 自宅PC → アプリ

1. 自宅PC を開いて、ファイルを選択します。
2. Actions（⋯）→ **アプリへコピー**。
3. 同名のファイルが既にある場合は、上書きしてコピー を確認します。

### 10-2. アプリ → 自宅PC

1. アプリ を開いて、ファイルを選択します。
2. Actions（⋯）→ **自宅PCへコピー**。
3. 保存先フォルダを選択します。
4. ファイルがPCのそのフォルダに書き込まれます。

> 自宅PCへコピー は、アプリ を選択中、かつ接続が設定済みのときにだけ表示されます。

### 10-3. 確認する方法

- アプリへコピー の後は、アプリ を開いて確認します。
- 自宅PCへコピー の後は、自宅PC を開いて確認します。

> **ここまでできましたか？**
> 自宅PCからアプリへファイルをコピーし、アプリ で確認できました。

> アプリの保存領域はブラウザのローカルストレージを使うため、容量には上限があります。
> 設定画面に表示される数値の詳細は `SETUP.md` に記載があります。

---

## 11. Even Realities G2 を使う場合（任意）

G2をお持ちでない方は、この章を読み飛ばしてください。
［第10章](#10-pcとアプリの間でファイルをコピーする)まででHomePilotを使えます。

G2でも同じPWAが動きます。PWAをG2で開くと、G2向けの画面に切り替わります。
違うのは操作方法（タップ、ダブルタップ、ロングプレス）と利用できる機能だけです。

### 11-1. 必要なもの

| 項目 | 用途 |
|---|---|
| Even Realities G2 | 端末そのもの |
| EvenHub 環境 | G2のアプリが動作する環境 |
| `explorer\evenhub` | G2用アプリ。［3-3](#3-3-依存パッケージをインストールする)でインストールします。 |

### 11-2. 3つの方法

| 方法 | コマンド | 必要なもの |
|---|---|---|
| シミュレータ | `cd explorer\evenhub` の後 `npm run simulator` | 不要。PC上で動きます。 |
| QRテスト | `npm run qr` | EvenHub 環境 |
| 実機 | `npm run pack` の後、生成された `.ehpk` をアップロード | EvenHub 環境と実機のG2 |

G2はPWAのURLを読み込みます。このURLは現在、ソースファイル
`explorer\evenhub\src\App.tsx` に直接書かれています。
PWAを別の場所に置く場合は、そこを変更して再ビルドしてください。

### 11-3. 最初にやってみること

1. G2でアプリを開きます。
2. 自宅PC をタップします。
3. Agentを開いて、メッセージを1つ送ります。

> **ここまでできましたか？**
> G2でホーム画面が表示され、自宅PC を開けました。

> G2には、ロングプレス・音声入力・画面サイズなどG2固有の制限があります。
> `SETUP.md` と `DEVELOPMENT.md` に記載があります。

---

## 12. 終了するとき

Launcherウィンドウで `Ctrl+C` を押します。
Gateway、OpenCode、トンネルがまとめて停止し、次のように表示されます。

```text
HomePilot stopped.
```

他のウィンドウも停止してください。

| ウィンドウ | 停止方法 |
|---|---|
| Launcher | `Ctrl+C` |
| PWA（`npm run dev`） | `Ctrl+C` |
| Speech Worker（`npm run dev`、方法A） | `Ctrl+C` |
| LM Studio | トレイから終了 |

> 停止時にディスクへ書き込むことはないので、いつでも安全に停止できます。
> PCの電源を落とす前に、これらのウィンドウを閉じてください。

再開するときは［第6章](#6-homepilot-を起動する)を繰り返してください。
トークンは変わるので、新しい Connection JSON でPWAを接続し直してください。

---

## 13. 困ったとき

よくある場合だけを挙げています。詳細なトラブルシュートは `SETUP.md` にあります。

### Launcherがすぐに停止する

| 表示 | 対処 |
|---|---|
| `Root folder not found` | `ROOT_PATH` のフォルダが存在しません。［3-5](#3-5-root_path-のフォルダを作る)を参照。 |
| `Configuration missing` | `HOMEPILOT_WORKER_URL` または `HOMEPILOT_WORKER_SECRET_TOKEN` が未設定です。［5-2](#5-2-speech-worker-を設定する)を参照。 |
| `cloudflared.exe was not found` | `tools\cloudflared.exe` がありません。リポジトリを取得し直してください。 |
| `Port 51887 may already be in use` | 前回のLauncherが残っています。閉じてから起動し直してください。 |
| `Local Model Load Failed` | `LOCAL_MODEL` の値がLM Studioにありません。［4-2](#4-2-lm-studio-でモデルを用意する)を参照。 |

### Agentが答えない

1. LM Studioが起動し、Local Serverを開始していますか？
2. `opencode.json` のモデルIDは、LM Studioのモデルと一致していますか？
3. Launcherは `OpenCode Server is ready.` と表示しましたか？
4. モデルはPCの性能に対して大きすぎませんか？大きなモデルは応答が遅くなります。

### スマートフォンでページが開かない

1. PCとスマートフォンが同じネットワークにありますか？
2. PWAは起動していますか？（`explorer\cloudflare` で `npm run dev`）
3. アドレスは最新ですか？`ipconfig` で確認してください。PCのIPアドレスは変わることがあります。
4. Windowsファイヤーウォールでブロックされていませんか？
   求められたら、プライベートネットワークでNode.jsを許可してください。

### スマートフォンで自宅PC に接続できない

1. スマートフォンの設定に Connection JSON を貼り付けましたか？
2. Launcherのウィンドウはまだ開いていますか？
3. JSONを貼り付けたあとにLauncherを再起動していませんか？
   トークンが変わるので、貼り付け直してください。
4. `自宅PC（Gateway）に接続できませんでした。` と表示される場合、接続情報が未設定です。

### 音声入力が動かない

1. Speech Workerのウィンドウはまだ開いていますか？（方法A）
2. `.dev.vars` のトークンと `launcher\.env` のトークンは完全に一致していますか？
3. `HOMEPILOT_WORKER_URL` は正しいですか？

### QRスキャンボタンでカメラが利用できないと表示される

カメラは `https://` または `localhost` でのみ利用できます。
［7-2](#7-2-スマートフォン側で行うこと)の貼り付け方法を使ってください。
`https://` でのアクセス方法は `SETUP.md` に記載があります。

### ファイルが表示されない

WindowsのHidden属性を確認してください。［9-3](#9-3-知っておくとよいこと)を参照。

---

## 14. 詳しい情報

| 知りたいこと | 読むもの |
|---|---|
| HomePilotで何ができるか、現在何が実装されているか | `README.md` |
| 各コンポーネントの詳細な設定、本番デプロイ、G2の詳細、トラブルシュート | `SETUP.md` |
| 内部構造、設計の意図、開発の方針 | `DEVELOPMENT.md` |
