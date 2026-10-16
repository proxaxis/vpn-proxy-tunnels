#!/bin/bash
set -e

squid

echo "$VPN_COOKIE" | openconnect \
  --cookie-on-stdin \
  --protocol=anyconnect \
  --non-inter \
  "$VPN_SERVER"
