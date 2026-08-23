
# readme_HomePilot-Gateway

## 2026/8/23(日)11:23 テストメモ

````markdown

# 1. テストディレクトリ作成
mkdir C:\HomePilotTest
echo "Hello" > C:\HomePilotTest\test.txt
mkdir C:\HomePilotTest\docs

# 2. Gateway起動
cd C:\1\work\github\s6334056\HomePilot\gateway
node src/index.js

# 3. curlでAPI確認
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/health
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:51887/api/fs/root
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\HomePilotTest"
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/file?path=C:\HomePilotTest\test.txt"

# 4. 認証なしで401確認
curl http://127.0.0.1:51887/api/health

# 5. ROOT外アクセスで403確認
curl -H "Authorization: Bearer <TOKEN>" "http://127.0.0.1:51887/api/fs/directory?path=C:\Windows"

````


## 2026/8/23(日)12:24 STEP 2-B：Gateway ↔ PWA接続時メモ

````markdown
# 1. Gateway起動
cd gateway
node src/index.js

# 2. .envファイル作成
cd explorer/cloudflare
.env を作成して VITE_FILE_SERVICE_MODE=gateway, TOKEN を設定

# 3. PWA起動
cd explorer/cloudflare
npm run dev

# 4. ブラウザで http://localhost:5174 を開く
 → C:\HomePilotTest の内容が表示されれば成功
 → ファイルを選択して内容が表示されれば成功

# 5. ビルド確認
npm run build

````


