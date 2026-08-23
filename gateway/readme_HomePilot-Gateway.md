
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



