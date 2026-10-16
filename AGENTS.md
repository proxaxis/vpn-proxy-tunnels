# vpn-proxy-tunnels

中央大学 SSL-VPN (`ldb.c.chuo-u.ac.jp`, tunnel group `Lib_tunnel`) 経由で
特定ブラウザの通信だけを中継するオンデマンド・マルチユーザープロキシ基盤。

## 構成

- `orchestrator/` (FastAPI) — `POST /api/start-vpn` でユーザーごとのワーカーを docker API 経由で起動
- `worker/` (alpine: openconnect + squid) — `VPN_COOKIE` 環境変数の webvpn Cookie で `tun0` を確立し、3128 で HTTP プロキシ
- `chromium-extension/` (MV3) — ブラウザで対話ログイン済みの `webvpn` Cookie **値のみ**を収穫して orchestrator に POST
- `cloudflared` — Cloudflare Tunnel で公開 (`*.vpn-proxy-tunnels.proxaxis.me`)

## 認証方式（重要）

パスワード直接認証は IdP 側で `Login failed (Error ID 15)` となり断念。
ブラウザで対話ログイン（MFA/SSO 対応）→ `webvpn` Cookie を openconnect
`--cookie-on-stdin` に渡す方式。

- **`--cookie-on-stdin` は「Cookie の値のみ」を受け取る**。`name=value` や `; ` 連結した Cookie ヘッダ形式は不可（`Cookie: webvpn=webvpn=xxx` となり 401）。
- Cookie 認証時 openconnect はフォーム認証をスキップし、いきなり `CONNECT /CSCOSSLC/tunnel` を送る。
- ブラウザ側でログアウトすると Cookie が失効しトンネルも切れる。セッションが ASA 側で送信元 IP に bind されている場合は GCP からの再利用が 401 で拒否される（その場合の対処は要検討）。

## ビルド・起動

```sh
docker build -t tunnels-worker:latest worker/   # orchestrator はこのイメージ名を参照
docker compose build orchestrator
docker compose up -d                            # orchestrator + cloudflared
```

`docker-compose.yml` は worker を管理しない（orchestrator が動的生成するため個別ビルドが必要）。

## 検証手順

```sh
# 偽 Cookie で E2E 疎通 (401 "Cookie was rejected by server" が正常終了点)
curl -s -X POST http://localhost:8000/api/start-vpn \
  -H 'Content-Type: application/json' \
  -d '{"username":"ua","cookie":"INVALID_TEST"}'
docker logs tunnels-worker-ua

# 実 Cookie でトンネル確立確認 (ブラウザ DevTools > Application > Cookies > webvpn の値)
docker run --rm -it --cap-add NET_ADMIN --device /dev/net/tun \
  -e VPN_SERVER=https://ldb.c.chuo-u.ac.jp \
  -e VPN_COOKIE='<webvpnの値>' tunnels-worker:latest
# "CSTP connected" / tun0 UP を確認。フルトンネル push 時は ip route を要確認。
```

## 既知の注意点

- openconnect v9.12: `--no-cert-check` は削除済み。自己署名には `--servercert pin-sha256:<SPKIのbase64>`。
- ワーカー entrypoint は `sport 3128` のポリシールーティング(table 100)を入れており、
  フルトンネル時でも squid 応答は eth0 へ戻る。
- cloudflared 公開ホスト名が squid への HTTP CONNECT を中継できるかは未検証
  （`ua.vpn-proxy-tunnels.proxaxis.me` → worker:3128 の経路要確認）。
- 拡張機能の fetch は Cloudflare Access の Service Token ヘッダを送っていない。
  Access ポリシーで認証必須なら `CF-Access-Client-Id/Secret` の追加が必要。
