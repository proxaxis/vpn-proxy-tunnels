#!/bin/bash
set -e

if [ -z "$VPN_COOKIE" ]; then
  echo "ERROR: VPN_COOKIE is empty" >&2
  exit 1
fi

# squid Basic 認証用 passwd (PROXY_USER/PROXY_PASSWORD から生成)
printf '%s:%s\n' "${PROXY_USER:-vpn}" "$(openssl passwd -apr1 "${PROXY_PASSWORD:?PROXY_PASSWORD is required}")" > /etc/squid/passwd
chown squid /etc/squid/passwd
chmod 640 /etc/squid/passwd

# ASA がフルトンネル(デフォルト経路=tun0)を push してきた場合でも、
# squid(3128)への応答パケットは eth0 側へ返すためのポリシールーティング。
ETH0_GW="$(ip -o -4 route show dev eth0 to default | awk '{print $3; exit}')"
if [ -n "$ETH0_GW" ]; then
  ip route add default via "$ETH0_GW" dev eth0 table 100 2>/dev/null || true
  ip rule add sport 3128 table 100 pref 100 2>/dev/null || true
fi

# --cookie-on-stdin は「webvpn Cookie の値のみ」を受け取る
start_openconnect() {
  printf '%s\n' "$VPN_COOKIE" | openconnect \
    --cookie-on-stdin \
    --protocol=anyconnect \
    --non-inter \
    -v \
    "$VPN_SERVER" 2>&1 | tee /tmp/oc.log
}

start_openconnect &
OC_PID=$!

# tun0 が上がり vpnc-script が resolv.conf を VPN DNS に書き換えるまで待つ。
# (squid は起動時に resolv.conf を読み込むため、トンネル確立後に起動する)
for _ in $(seq 1 60); do
  ip link show tun0 >/dev/null 2>&1 && grep -q VPNC_GENERATED /etc/resolv.conf 2>/dev/null && break
  sleep 0.5
done
if ! ip link show tun0 >/dev/null 2>&1; then
  echo "ERROR: tun0 did not come up" >&2
  kill "$OC_PID" 2>/dev/null || true
  exit 1
fi

squid

# openconnect が落ちた場合の監視ループ。
# Cookie 拒否(認証失敗)はリトライしても無駄なので即終了、それ以外は再接続を試みる
while wait "$OC_PID"; do :; done
for i in 1 2 3 4 5; do
  if grep -q "Cookie was rejected" /tmp/oc.log 2>/dev/null; then
    echo "FATAL: webvpn cookie rejected by server" >&2
    exit 1
  fi
  echo "openconnect exited (attempt $i/5), reconnecting in 10s..." >&2
  sleep 10
  start_openconnect &
  OC_PID=$!
  wait "$OC_PID" || true
done
echo "FATAL: openconnect failed after 5 retries" >&2
exit 1
