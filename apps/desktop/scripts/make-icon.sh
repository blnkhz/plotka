#!/bin/sh
# Rebuilds build/icon.icns (macOS) and build/icon.ico (Windows) from build/icon.svg.
# Runs on macOS only (sips, iconutil).
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
echo "Wrote build/icon.icns"

mkdir "$tmp/ico"
for s in 16 24 32 48 64 128 256; do
  sips -z $s $s "$tmp/icon.png" --out "$tmp/ico/$s.png" >/dev/null
done
node scripts/make-ico.cjs build/icon.ico "$tmp"/ico/16.png "$tmp"/ico/24.png "$tmp"/ico/32.png \
  "$tmp"/ico/48.png "$tmp"/ico/64.png "$tmp"/ico/128.png "$tmp"/ico/256.png
echo "Wrote build/icon.ico"

rm -rf "$tmp"
