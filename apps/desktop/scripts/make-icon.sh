#!/bin/sh
# Rebuilds build/icon.icns from build/icon.svg. macOS only (sips, iconutil).
set -e
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
./node_modules/.bin/electron scripts/render-icon.cjs build/icon.svg "$tmp/icon.png"
mkdir "$tmp/icon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$tmp/icon.png" --out "$tmp/icon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$tmp/icon.png" --out "$tmp/icon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$tmp/icon.iconset" -o build/icon.icns
rm -rf "$tmp"
echo "Wrote build/icon.icns"
