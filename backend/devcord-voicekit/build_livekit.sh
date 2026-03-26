#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
BIN_DIR="${BIN_DIR:-$ROOT/bin}"
OUT="${OUT:-$BIN_DIR/livekit-server}"
mkdir -p "$BIN_DIR"
echo "Building livekit-server -> $OUT"
if go build -trimpath -ldflags="-s -w" -o "$OUT" ./cmd/server; then
  echo "OK: $OUT"
  exit 0
fi
echo "go build failed (wymagany Go 1.22+ lub pobranie toolchain). Pobieram oficjalny binarek…"
VER="${LIVEKIT_RELEASE:-v1.10.0}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/lk.tgz" "https://github.com/livekit/livekit/releases/download/${VER}/livekit_${VER#v}_linux_amd64.tar.gz"
tar -xzf "$TMP/lk.tgz" -C "$TMP"
install -m755 "$TMP/livekit-server" "$OUT"
echo "OK (release ${VER}): $OUT"
