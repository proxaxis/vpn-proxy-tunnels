#!/bin/bash
set -e

if [ -z "$VPN_COOKIE" ]; then
  echo "ERROR: VPN_COOKIE is empty" >&2
  exit 1
fi

squid

# ASA がフルトンネル(デフォルト経路=tun0)を push してきた場合でも、
# squid(3128)への応答パケットは eth0 側へ返すためのポリシールーティング。
# スプリットトンネル時は実質無害。
ETH0_GW="$(ip -o -4 route show dev eth0 to default | awk '{print $3; exit}')"
if [ -n "$ETH0_GW" ]; then
  ip route add default via "$ETH0_GW" dev eth0 table 100 2>/dev/null || true
  ip rule add sport 3128 table 100 pref 100 2>/dev/null || true
fi

# --cookie-on-stdin は「webvpn Cookie の値のみ」を受け取る
printf '%s\n' "$VPN_COOKIE" | openconnect \
  --cookie-on-stdin \
  --protocol=anyconnect \
  --non-inter \
  -v \
  "$VPN_SERVER"
