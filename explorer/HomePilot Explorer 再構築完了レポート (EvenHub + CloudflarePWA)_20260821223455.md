# HomePilot Explorer 再構築完了レポート (EvenHub + Cloudflare/PWA)

最重要参考資料である **[DocsReader4EH](https://github.com/sYamcsPublic/DocsReader4EH)** のアーキテクチャテンプレートに完全準拠し、EvenHubアプリ（`evenhub/`）と Cloudflare/PWAアプリ（`cloudflare/`）を明確に分離した実動構成への再構築を完了しました。

---

## 1. DocsReader4EHの構造適用と役割分担

```mermaid
graph TD
    subgraph EvenHub Application ["evenhub/ (Port 5173 / .ehpk)"]
        EH_Config["app.json (com.evenrealities.homepilot.explorer)"]
        EH_Boot["src/App.tsx (PWA Launcher & Bridge Sync)"]
        EH_Pack["evenhub pack -> HomePilotExplorer.ehpk"]
    end

    subgraph Cloudflare PWA Application ["cloudflare/ (Port 5174 / PWA Web App)"]
        subgraph G2 HUD Layer ["G2 HUD Engine (src/hud/)"]
            PageMgr["PageManager (EvenAppBridge & Event Dispatcher)"]
            ExpPage["ExplorerPage (List, Focus '>', Double-Tap Parent)"]
            ViewPage["FileViewerPage (Text Paging & Scroll)"]
            AgentPage["AgentPlaceholderPage (Context Preview)"]
        end

        subgraph Service & Domain Layer ["Core Domain & Services"]
            FSService["FileSystemService (Gateway Interface)"]
            MockFS["MockFileSystemService (/home, /documents, /projects, /photos)"]
            AgentSvc["AgentService (Context Forwarding)"]
        end

        subgraph Web UI Layer ["PC & Mobile Web UI (src/components/)"]
            Navbar["Navbar & Breadcrumbs"]
            FileTable["FileTable (Multi-device view)"]
            FileViewer["FileViewer (Web text view)"]
            AgentPanel["AgentPanel (Agent status)"]
        end
    end

    subgraph Hardware
        G2Glasses["Even Realities G2 Smart Glasses"]
    end

    EH_Boot -->|Redirects / Loads in WebView| Cloudflare PWA Application
    PageMgr <-->|Bridge & onEvenHubEvent| G2Glasses
    ExpPage --> Service & Domain Layer
    ViewPage --> Service & Domain Layer
    AgentPage --> Service & Domain Layer
    Web UI Layer --> Service & Domain Layer
```

### DocsReader4EHから継承・適用した具体的な設計
1. **`evenhub/` と `cloudflare/` の分離**:
   - `evenhub/`: EvenHubスマートフォンアプリ内にインストールされるネイティブパッケージ（`app.json`, `dist/`, `.ehpk`）。
   - `cloudflare/`: G2グラス向けHUDエンジン（`src/hud/`）とPC/スマホ向けWeb UI（`src/components/`）を併せ持つPWA本体。
2. **`PageManager` / `BasePage` パターンの採用**:
   - DocsReader4EHの `cloudflare/src/hud/page-manager.ts` をベースに、`waitForEvenAppBridge()`、`CreateStartUpPageContainer` / `RebuildPageContainer` によるコンテナ描画、`onEvenHubEvent`（スクロール、タップ、ダブルタップ、長押し、メニュー選択）の安全なルーティング機構を実装。
3. **G2ハードウェア向け文字幅テーブル (`getCharWidth` / `truncateName`)**:
   - 全角2.0、半角文字種別の計測テーブルに基づき、G2グラス上での文字列はみ出しを確実に防止。

---

## 2. ディレクトリ構成と作成ファイル一覧

```text
HomePilot/explorer/
├── evenhub/
│   ├── app.json                          # EvenHubアプリ定義
│   ├── package.json                      # dev (port 5173), simulator, qr, pack スクリプト
│   ├── vite.config.ts                    # Port 5173
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                       # PWAリダイレクト・ブートストラップ
│       ├── App.css
│       └── index.css
│
└── cloudflare/
    ├── package.json                      # dev (port 5174), build, SDK依存
    ├── vite.config.ts                    # Port 5174
    ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
    ├── index.html
    ├── public/manifest.json
    └── src/
        ├── domain/
        │   ├── types.ts                  # FileSystemItem, ExplorerState, AgentContext
        │   └── mockData.ts               # /home, /documents, /projects, /photos モック
        ├── services/
        │   ├── FileSystemService.ts      # Gateway API差し替え用インターフェース
        │   ├── MockFileSystemService.ts  # パス解決・一覧取得・内容取得
        │   └── AgentService.ts           # Agentコンテキスト引継ぎサービス
        ├── hud/
        │   ├── page-manager.ts           # G2 Bridge, onEvenHubEvent, 描画制御
        │   └── pages/
        │       ├── explorer-page.ts      # G2用Explorer（フォーカス'>', スクロール, タップ, 親移動）
        │       ├── file-viewer-page.ts   # G2用File Viewer（テキスト行分割, スクロール, 戻り）
        │       └── agent-placeholder-page.ts # G2用Agentプレースホルダー
        ├── components/
        │   ├── Navbar.tsx                # パンくず, G2ステータス, 操作ボタン
        │   ├── FileTable.tsx             # ファイル一覧テーブル（PC/スマホ）
        │   ├── FileViewer.tsx            # ファイル閲覧画面（PC/スマホ）
        │   └── AgentPanel.tsx            # Agentプレースホルダー画面（PC/スマホ）
        ├── App.tsx                       # 全体統合, G2 HUD同期, キーボード操作
        ├── main.tsx                      # エントリーポイント
        ├── index.css
        └── App.css
```

---

## 3. 操作体系

| 画面 | 操作 | G2グラス / シミュレータでの動作 |
| :--- | :--- | :--- |
| **Explorer** | 上下スクロール | フォーカス項目移動（自動スクロール追従、`>` 記号） |
| | タップ | フォルダ内へ移動 / ファイルならFile Viewerへ遷移 |
| | ダブルタップ | 親ディレクトリへ移動（Root時はHome維持） |
| | 長押し | 選択項目をコンテキスト化してAgent Placeholder起動 |
| | Context Menu | Refresh / Home / Parent / File Info |
| **File Viewer** | 上下スクロール | テキスト行のスクロール（行単位） |
| | ダブルタップ | Explorerへ戻る |
| | 長押し | 開いているファイルをコンテキストに含めてAgent起動 |
| **Agent Placeholder** | ダブルタップ / タップ | 直前の画面（Explorer/File Viewer）へ戻る |

---

## 4. 動作確認コマンド（人間が実行）

開発環境の制約に基づき、AI側でのコマンド実行は行っておりません。以下の手順で各サーバーを起動して確認してください。

### ステップ1: PWA Webアプリの起動 (Cloudflare側)
```bash
cd c:\1\work\github\s6334056\private\work\projects\HomePilot\explorer\cloudflare
npm install
npm run dev
```
起動後、ブラウザで `http://localhost:5174` を開きます。
（PC/スマホ向けExplorer、および画面右側にG2 HUD Display Previewが表示され、同期動作を確認できます）

### ステップ2: EvenHubアプリの起動・シミュレータ (EvenHub側)
```bash
cd c:\1\work\github\s6334056\private\work\projects\HomePilot\explorer\evenhub
npm install
npm run dev
```
起動後、`http://localhost:5173` からEvenHubのブートストラップが動作し、PWA（`http://localhost:5174`）へとシームレスに接続されます。
また、実機転送用のパッケージング（`npm run pack`）や EvenHubシミュレータ起動（`npm run simulator`）も準備されています。
