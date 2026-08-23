
# readme_HomePilot

## 2026/8/23(日)13:06 テスト時

① Gateway
cd C:\1\work\github\s6334056\HomePilot\gateway
node src/index.js
↓
HomePilot Gateway listening on http://127.0.0.1:51887
Token: xxxxxxxxx...
② Cloudflare Quick Tunnel
cloudflared.exe tunnel --url http://127.0.0.1:51887
↓
INF Your quick Tunnel has been created! Visit it at
https://xxxx-xxxx.trycloudflare.com
③ PWA
cd C:\1\work\github\s6334056\HomePilot\explorer\cloudflare
npm run dev
これで、
EvenHub
   ↓ HTTPS
https://xxxx.trycloudflare.com
   ↓ Cloudflare Quick Tunnel
自宅PC
   ↓ 127.0.0.1:51887
HomePilot Gateway
   ↓
C:\HomePilotTest
という経路。
