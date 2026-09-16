
# HomePilot Setup Guide

This guide explains how to set up HomePilot **from a clean Windows PC and get it running with a local LLM**.

This guide intentionally does not cover the details of the development environment or HomePilot's internal architecture.

> **Goal: Follow the steps from top to bottom and get HomePilot running.**

---

## 1. Install the Required Software

Install the following software:

### Required

- Git
- GitHub CLI
- Node.js
- OpenCode CLI
- LM Studio

### 1-1. Git

Search for **"Git installation"** and install the latest version of Git.

After installation, open Command Prompt and run:

```bat
git --version
```

If a version number is displayed, Git is installed correctly.

---

### 1-2. GitHub CLI

Search for **"GitHub CLI installation"** and install the latest version of GitHub CLI (`gh`).

After installation, run:

```bat
gh --version
```

to verify the installation.

Then log in to GitHub:

```bat
gh auth login
```

Follow the instructions to complete the GitHub login.

> **Note**
>
> GitHub CLI does not replace Git itself.
>
> **Install both Git and GitHub CLI.**

---

## 2. Install Node.js

Search for **"Node.js installation"** and install Node.js.

In general, use the **LTS version**.

After installation, run:

```bat
node --version
npm --version
```

If both commands display version numbers, Node.js and npm are installed correctly.

---

## 3. Install OpenCode CLI

Search for **"OpenCode CLI installation"** and install OpenCode CLI.

After installation, run:

```bat
opencode --version
```

to verify the installation.

HomePilot uses OpenCode for local LLM execution and Agent processing.

---

## 4. Install LM Studio

Search for **"LM Studio installation"** and install LM Studio.

After installation, launch LM Studio and make sure it starts correctly.

HomePilot uses LM Studio as the **local LLM server**.

---

## 5. Get HomePilot

Clone HomePilot from GitHub.

Example:

```bat
cd C:\
gh repo clone s6334056/HomePilot
```

This creates a directory such as:

```text
C:\HomePilot
```

From this point onward, this directory is referred to as the **HomePilot root directory**.

> The actual location can be anywhere you prefer.
>
> `C:\HomePilot` is used in this guide simply to keep the examples easy to follow.

---

## 6. Install HomePilot Dependencies

HomePilot contains several Node.js projects.

Run `npm install` in the following three directories.

### 6-1. Gateway

```bat
cd C:\HomePilot\gateway
npm install
```

---

### 6-2. Launcher

```bat
cd C:\HomePilot\launcher
npm install
```

---

### 6-3. Speech Worker

```bat
cd C:\HomePilot\speech-worker
npm install
```

If all three commands complete without errors, the dependencies are installed correctly.

---

## 7. Configure the Launcher

Create the Launcher's environment configuration file:

```text
HomePilot
└─ launcher
   └─ .env
```

Set the **root folder** that HomePilot will be allowed to operate on.

Example:

```env
ROOT_PATH=C:\HomePilotWork
```

The directory specified by `ROOT_PATH` becomes the root directory shown in HomePilot's Explorer.

For example:

```text
C:\HomePilotWork
├─ documents
├─ projects
└─ test
```

> **Note**
>
> `ROOT_PATH` does not have to point to the HomePilot source directory.
>
> Set it to the directory that you want HomePilot to operate on.

---

## 8. Configure Voice Input

HomePilot's voice input uses a Cloudflare Worker for speech recognition.

The Cloudflare Worker URL and authentication token are configured in **`launcher/.env`**.

---

### 8-1. Cloudflare Account

A Cloudflare account is required.

After logging in to Cloudflare, deploy `speech-worker` as a Cloudflare Worker.

---

### 8-2. Cloudflare CLI

The Cloudflare Worker is deployed using Wrangler.

If necessary, log in with:

```bat
npx wrangler login
```

A browser window will open. Follow the instructions to complete the Cloudflare authentication.

---

### 8-3. Deploy the Speech Worker

Go to the `speech-worker` directory:

```bat
cd C:\HomePilot\speech-worker
```

Then deploy the Worker:

```bat
npx wrangler deploy
```

After a successful deployment, Wrangler displays the Cloudflare Worker URL.

Example:

```text
https://xxxxxxxx.homepilot-speech.workers.dev
```

Keep this URL for the next step.

---

### 8-4. Configure the Voice Input Token

The Speech Worker uses a secret token to protect voice input requests.

Set the token as a Cloudflare Worker Secret:

```bat
npx wrangler secret put HOMEPILOT_WORKER_SECRET_TOKEN
```

When prompted, enter a long, randomly generated token.

You will also configure the same token in HomePilot.

> **Important**
>
> Never commit the token to GitHub.
>
> Keep it as a secret in `.env` and as a Cloudflare Secret.

---

### 8-5. Configure the Cloudflare Settings in Launcher

Add the Cloudflare Worker URL and token to `launcher/.env`.

Example:

```env
ROOT_PATH=C:\HomePilotWork
HOMEPILOT_WORKER_URL=https://xxxxxxxx.homepilot-speech.workers.dev
HOMEPILOT_WORKER_SECRET_TOKEN=your-token-here
```

---

## 9. Prepare a Local LLM in LM Studio

Launch LM Studio and download the model you want to use.

HomePilot uses LM Studio as an OpenAI-compatible API server.

For example, you can use:

```text
Qwen3.5 4B
```

After downloading the model, make sure the model is available in LM Studio.

**Start LM Studio's Local Server** so that HomePilot/OpenCode can connect to it.

---

## 10. Configure the LM Studio Model in OpenCode

To allow OpenCode to use LM Studio, place an `opencode.json` file in the OpenCode user configuration directory.

On Windows, the usual location is:

```text
C:\Users\<username>\.config\opencode\opencode.json
```

In other words:

```text
%USERPROFILE%\.config\opencode\opencode.json
```

If the directory does not exist, create it.

```text
%USERPROFILE%
└─ .config
   └─ opencode
      └─ opencode.json
```

Configure the LM Studio model in `opencode.json`.

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

> **Note**
>
> Change `qwen3.5-4b` to match the actual model ID used by your LM Studio setup.
>
> For detailed OpenCode configuration, see the developer-oriented `SETUP.md`.

---

## 11. Start LM Studio

Before starting HomePilot, launch LM Studio.

Load the model you want to use and **start the Local Server**.

The OpenAI-compatible API is normally available at:

```text
http://127.0.0.1:1234/v1
```

---

## 12. Start HomePilot

Once all configuration is complete, HomePilot can be started using:

```text
HomePilot/launcher/start-homepilot.bat
```

The Launcher starts the components required by HomePilot, including the Gateway, Cloudflare-related processing, and OpenCode.

After startup, open the HomePilot PWA.

> **Additional information**
>
> `HomePilot/explorer` contains the processing used by the PC PWA, smartphone PWA, and Even G2.
>
> See the developer-oriented `SETUP.md` for details.

---

## 13. Verify the Setup

At minimum, verify the following.

### Explorer

- The files and folders under the configured `ROOT_PATH` are displayed.
- Folders can be opened.
- Files can be selected.

### Agent

- An Agent session can be created.
- A message can be sent.
- A response is returned from the local LLM.

### Voice Input

- Voice input can be started.
- Speech is recognized.
- The recognized text can be used as Agent input.

If all of these work, the basic HomePilot setup is complete.

---

## 14. Setup Checklist

If something does not work, go through this checklist from the top.

- [ ] Git is installed
- [ ] GitHub CLI is installed
- [ ] `gh auth login` has been completed
- [ ] Node.js is installed
- [ ] OpenCode CLI is installed
- [ ] LM Studio is installed
- [ ] HomePilot has been cloned
- [ ] `npm install` has been run in `gateway`
- [ ] `npm install` has been run in `launcher`
- [ ] `npm install` has been run in `speech-worker`
- [ ] `launcher/.env` has been created
- [ ] `ROOT_PATH` has been configured
- [ ] The Cloudflare Worker has been deployed
- [ ] The Cloudflare Worker URL has been obtained
- [ ] The Cloudflare Worker Secret Token has been configured
- [ ] `HOMEPILOT_WORKER_URL` has been configured
- [ ] `HOMEPILOT_WORKER_SECRET_TOKEN` has been configured
- [ ] The desired local LLM has been downloaded in LM Studio
- [ ] OpenCode's `opencode.json` has been created
- [ ] The LM Studio model has been configured in `opencode.json`
- [ ] The LM Studio Local Server has been started
- [ ] HomePilot Launcher has been started
- [ ] The Agent can be used from the PWA
- [ ] Voice input has been verified if needed

---

## 15. Troubleshooting

If something does not work, check the following first.

### The Agent does not respond

1. Is LM Studio running?
2. Is the desired model installed in LM Studio?
3. Is the model loaded?
4. Is the LM Studio Local Server running?
5. Is the model ID in `opencode.json` correct?
6. Can OpenCode CLI start normally?

---

### Explorer does not show files

Check the following setting in `launcher/.env`:

```env
ROOT_PATH=...
```

Also make sure that the specified directory actually exists.

---

### Voice input does not work

Check the following:

1. Is the Cloudflare Worker deployed?
2. Is `HOMEPILOT_WORKER_URL` correct?
3. Is the Cloudflare Worker Secret Token configured?
4. Does `HOMEPILOT_WORKER_SECRET_TOKEN` match the configured Cloudflare Secret?

---

## 16. For More Details

This page is a **quick setup guide for getting HomePilot running from scratch**.

For details about HomePilot's internal architecture, development environment, and advanced configuration, see:

- `SETUP.md` — Detailed setup information
- `DEVELOPMENT.md` — Developer information
- `README.md` — HomePilot overview

---

## Required Components

The final setup should look roughly like this:

```text
Windows PC
│
├─ Git
├─ GitHub CLI
├─ Node.js / npm
├─ OpenCode CLI
├─ LM Studio
│   └─ Local LLM
│
├─ HomePilot
│   ├─ gateway
│   ├─ launcher
│   └─ speech-worker
│
├─ OpenCode configuration
│   └─ %USERPROFILE%\.config\opencode\opencode.json
│
└─ Cloudflare
    └─ Speech Worker
```

Once everything is configured, start the Launcher and HomePilot can use the local LLM.



# HomePilot セットアップ手順

このページでは、**Windows PCに何もない状態からHomePilotを起動し、ローカルLLMを使える状態にするまで**の手順を説明します。

細かい開発環境やHomePilot内部の仕組みについては、ここでは扱いません。

> **目的：上から順番に作業すれば、とりあえずHomePilotが動く状態にする。**

---

## 1. 必要なソフトをインストールする

以下のソフトをインストールします。

### 必須

- Git
- GitHub CLI
- Node.js
- OpenCode CLI
- LM Studio

### 1-1. Git

「Git インストール方法」で調べて、最新の方法でGitをインストールします。

インストール後、コマンドプロンプトで以下を実行して確認します。

```bat
git --version
```

バージョン番号が表示されればOKです。

---

### 1-2. GitHub CLI

「Github CLI インストール方法」で調べて、最新の方法でGitHub CLI (`gh`) をインストールします。

インストール後、

```bat
gh --version
```

で確認します。

その後、GitHubにログインします。

```bat
gh auth login
```

画面の指示に従ってGitHubへのログインを完了してください。

> **注意**
>
> GitHub CLIをインストールしても、Git本体の代わりにはなりません。
>
> **GitとGitHub CLIの両方をインストールしてください。**

---

## 2. Node.jsをインストールする

「Node.js インストール方法」で調べて、Node.jsをインストールします。

基本的には **LTS版** を使用してください。

インストール後、

```bat
node --version
npm --version
```

を実行し、両方ともバージョン番号が表示されればOKです。

---

## 3. OpenCode CLIをインストールする

「OpenCode CLI インストール方法」で調べて、OpenCode CLIをインストールします。

インストール後、

```bat
opencode --version
```

で確認します。

HomePilotでは、OpenCodeをローカルLLMの実行・Agent処理に使用します。

---

## 4. LM Studioをインストールする

「LM Studio インストール方法」で調べて、LM Studioをインストールします。

インストール後、LM Studioを起動できることを確認してください。

HomePilotでは、LM Studioを**ローカルLLMの実行サーバー**として使用します。

---

## 5. HomePilotを取得する

GitHubからHomePilotをクローンします。

例：

```bat
cd C:\
gh repo clone s6334056/HomePilot
```

これで、

```text
C:\HomePilot
```

のようなフォルダが作成されます。

以降、このフォルダを**HomePilotのルートフォルダ**として説明します。

> 実際に配置する場所は任意です。
>
> ここでは説明を簡単にするため `C:\HomePilot` としています。

---

## 6. HomePilotの依存パッケージをインストールする

HomePilotには複数のNode.jsプロジェクトがあります。

以下の3箇所で `npm install` を実行します。

### 6-1. Gateway

```bat
cd C:\HomePilot\gateway
npm install
```

---

### 6-2. Launcher

```bat
cd C:\HomePilot\launcher
npm install
```

---

### 6-3. Speech Worker

```bat
cd C:\HomePilot\speech-worker
npm install
```

3箇所ともエラーが出ずに終了すればOKです。

---

## 7. Launcherの設定

Launcherの環境設定ファイルを作成します。

```text
HomePilot
└─ launcher
   └─ .env
```

`.env` に、HomePilotが操作する**ルートフォルダ**を設定します。

例：

```env
ROOT_PATH=C:\HomePilotWork
```

ここで指定したフォルダが、HomePilotのExplorerで操作するルートになります。

例えば、

```text
C:\HomePilotWork
├─ documents
├─ projects
└─ test
```

のようなフォルダを指定できます。

> **注意**
>
> `ROOT_PATH` はHomePilotのソースコードを置く場所とは別でも構いません。
>
> HomePilotから操作させたいフォルダを指定してください。

---

## 8. 音声入力の設定

HomePilotの音声入力では、Cloudflare Workerを経由して音声認識を行います。

そのため、`launcher/.env` にCloudflare WorkerのURLと認証用トークンを設定します。

---

### 8-1. Cloudflareアカウント

Cloudflareを使用するため、Cloudflareのアカウントを用意します。

Cloudflareのログイン後、`speech-worker` をWorkerとしてデプロイします。

---

### 8-2. Cloudflare CLI

Cloudflare Workerのデプロイには Wrangler を使用します。

必要に応じてログインします。

```bat
npx wrangler login
```

ブラウザが開くので、Cloudflareへのログインと認証を完了してください。

---

### 8-3. Speech Workerをデプロイする

HomePilotの `speech-worker` フォルダへ移動します。

```bat
cd C:\HomePilot\speech-worker
```

その状態でWorkerをデプロイします。

```bat
npx wrangler deploy
```

デプロイが成功すると、Cloudflare上のWorker URLが表示されます。

例：

```text
https://xxxxxxxx.homepilot-speech.workers.dev
```

このURLを控えておきます。

---

### 8-4. 音声入力用トークンを設定する

Speech Workerでは、音声入力リクエストを保護するためのトークンを使用します。

Cloudflare Worker側にSecretとして設定します。

例：

```bat
npx wrangler secret put HOMEPILOT_WORKER_SECRET_TOKEN
```

表示された入力欄に、任意の長いランダムなトークンを入力します。

このトークンは、後でHomePilot側にも設定します。

> **重要**
>
> トークンはGitHubへコミットしないでください。
>
> `.env` やCloudflare Secretなど、秘密情報として管理してください。

---

### 8-5. LauncherのCloudflare設定

`launcher/.env` に、Cloudflare WorkerのURLとトークンを設定します。

例：

```env
ROOT_PATH=C:\HomePilotWork
HOMEPILOT_WORKER_URL=https://xxxxxxxx.homepilot-speech.workers.dev
HOMEPILOT_WORKER_SECRET_TOKEN=ここに設定したトークン
```

---

## 9. LM StudioにローカルLLMを用意する

LM Studioを起動し、使用したいモデルをダウンロードします。

HomePilotではLM StudioをOpenAI互換APIサーバーとして利用します。

例えば、使用するモデルとして

```text
Qwen3.5 4B
```

などを用意できます。

モデルのダウンロードが完了したら、LM StudioのLocal Serverを開始します。

---

## 10. OpenCodeにLM Studioのモデルを設定する

OpenCodeからLM Studioを利用するため、OpenCodeのユーザー設定に `opencode.json` を配置します。

Windowsでは、通常以下の場所です。

```text
C:\Users\<ユーザー名>\.config\opencode\opencode.json
```

つまり、

```text
%USERPROFILE%\.config\opencode\opencode.json
```

です。

フォルダが存在しない場合は作成してください。

```text
%USERPROFILE%
└─ .config
   └─ opencode
      └─ opencode.json
```

`opencode.json` には、使用するLM Studioのモデルを設定します。

例：
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

> **注意**
>
> `qwen3.5-4b` の部分は、LM Studioで実際に使用するモデルIDに合わせて変更してください。
>
> HomePilotで使用するモデル設定の詳細は、開発者向け `SETUP.md` も参照してください。

---

## 11. LM Studioを起動する

HomePilotを起動する前に、LM Studioを起動しLocal Serverを開始します。

LM StudioのOpenAI互換APIは通常、

```text
http://127.0.0.1:1234/v1
```

で動作します。

---

## 12. HomePilotを起動する

ここまで設定できたら、Launcherの `start-homepilot.bat` からHomePilotが起動できるようになります。

LauncherがGateway、Cloudflare関連処理、OpenCodeなど必要なコンポーネントを起動します。

起動後、HomePilotのPWAへアクセスします。

> **補足**
>
> `HomePilot/explorer`が、パソコンPWA・スマホPWA・EvenG2側の処理を担っています。
>
> 詳細は、開発者向け `SETUP.md` を参照してください。

---

## 13. 動作確認

最低限、以下を確認します。

### Explorer

- 指定した `ROOT_PATH` のファイル・フォルダが表示される
- フォルダを開ける
- ファイルを選択できる

### Agent

- Agentのセッションを作成できる
- メッセージを送信できる
- ローカルLLMから回答が返ってくる

### 音声入力

- 音声入力を開始できる
- 音声が認識される
- 認識結果がAgentへの入力として使用できる

ここまで動けば、HomePilotの基本セットアップは完了です。

---

## 14. セットアップ全体のチェックリスト

困ったときは、まずここを上から確認してください。

- [ ] Gitをインストールした
- [ ] GitHub CLIをインストールした
- [ ] `gh auth login` を完了した
- [ ] Node.jsをインストールした
- [ ] OpenCode CLIをインストールした
- [ ] LM Studioをインストールした
- [ ] HomePilotをcloneした
- [ ] `gateway` で `npm install` した
- [ ] `launcher` で `npm install` した
- [ ] `speech-worker` で `npm install` した
- [ ] `launcher/.env` を作成した
- [ ] `ROOT_PATH` を設定した
- [ ] Cloudflare Workerをデプロイした
- [ ] Cloudflare WorkerのURLを取得した
- [ ] Cloudflare WorkerのSecret Tokenを設定した
- [ ] `HOMEPILOT_WORKER_URL` を設定した
- [ ] `HOMEPILOT_WORKER_SECRET_TOKEN` を設定した
- [ ] LM Studioで使用するモデルをダウンロードした
- [ ] OpenCodeの `opencode.json` を作成した
- [ ] LM Studioのモデル設定をOpenCodeに追加した
- [ ] LM Studioを起動した
- [ ] HomePilot Launcherを起動した
- [ ] PWAからAgentを使用できた
- [ ] 必要なら音声入力を確認した

---

## 15. うまく動かない場合

まず、以下を確認してください。

### Agentが回答しない

1. LM Studioが起動しているか
2. 使用するモデルがLM Studioに存在するか
3. モデルが読み込まれているか
4. `opencode.json` のモデルIDが正しいか
5. OpenCode CLIが正常に起動できるか

---

### Explorerにファイルが表示されない

`launcher/.env` の

```env
ROOT_PATH=...
```

を確認してください。

指定したフォルダが実際に存在することも確認してください。

---

### 音声入力が動かない

1. Cloudflare Workerがデプロイされているか
2. `HOMEPILOT_WORKER_URL` が正しいか
3. Cloudflare Worker側のSecret Tokenが設定されているか
4. `HOMEPILOT_WORKER_SECRET_TOKEN` が一致しているか

を確認してください。

---

## 16. さらに詳しく知りたい場合

このページは、**HomePilotをゼロから動かすための簡易セットアップ手順**です。

HomePilotの内部構成、開発環境、各コンポーネントの詳細設定などについては、以下のドキュメントを参照してください。

- `SETUP.md` — 詳細なセットアップ情報
- `DEVELOPMENT.md` — 開発者向け情報
- `README.md` — HomePilot全体の概要

---

## 最終的に必要なもの

HomePilotを動かすために、最終的には以下のような構成になります。

```text
Windows PC
│
├─ Git
├─ GitHub CLI
├─ Node.js / npm
├─ OpenCode CLI
├─ LM Studio
│   └─ ローカルLLM
│
├─ HomePilot
│   ├─ gateway
│   ├─ launcher
│   └─ speech-worker
│
├─ OpenCode設定
│   └─ %USERPROFILE%\.config\opencode\opencode.json
│
└─ Cloudflare
    └─ Speech Worker
```

この状態でLauncherを起動すると、HomePilotからローカルLLMを利用できます。

