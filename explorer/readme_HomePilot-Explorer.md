
# readme_HomePilot-Explorer (EvenHub + Cloudflare/PWA)

## 2. ディレクトリ構成とファイル一覧ざっくり

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

## 2. 操作体系

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

## 3. 動作確認コマンド（人間が実行）

### ステップ1: PWA Webアプリの起動 (Cloudflare側)
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\cloudflare
npm install
npm run dev
```
起動後、ブラウザで `http://localhost:5174` を開きます。
（PC/スマホ向けExplorer、および画面右側にG2 HUD Display Previewが表示され、同期動作を確認できます）

Cloudflare想定のみで実機テスト
上記のローカルホスト起動した際に表示されるNetworkのipが必要
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\evenhub
npx evenhub qr --url "http://192.168.0.2:5174/"
```

### ステップ2: EvenHubアプリの起動
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\evenhub
npm install
npm run dev
```
起動後、`http://localhost:5173` からEvenHubのブートストラップが動作し、PWA（`http://localhost:5174`）へとシームレスに接続されます。

### ステップ3: シミュレータテスト (EvenHub側)
別のターミナルでEvenHubシミュレータ起動する
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\evenhub
npm run simulator
```

## 5. 本番デプロイに向けて

#### ステップ1: 本体ビルド (Cloudflare側)
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\cloudflare
npm run build
```

`dist` フォルダを Cloudflare Pages 等にデプロイしてください。

https://dash.cloudflare.com/login  

[参考]QRコードの作成方法
以下を背景が黒いターミナルで実行
```
npx evenhub qr --url "https://homepilot.s6334056.workers.dev/"
```

### ステップ2: 実機転送用のパッケージング (EvenHub側)
```bash
cd C:\1\work\github\s6334056\HomePilot\explorer\evenhub
npm run pack
```

`xxx.ehpk` が生成されます。
`.ehpk` ファイルを [EvenHub Portal](https://hub.evenrealities.com) にアップロードします。


