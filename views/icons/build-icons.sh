#!/usr/bin/env bash
# Regenerate the extension PNG icons from norless-icon.svg.
# The master SVG composites norless-source.png (the raw rainbow) inside a
# Chrome-cast-style frame. Requires librsvg (`brew install librsvg`).
set -euo pipefail
cd "$(dirname "$0")"

for size in 16 48 128 256; do
  rsvg-convert -w "$size" -h "$size" norless-icon.svg -o "icon-${size}.png"
  echo "wrote icon-${size}.png (${size}x${size})"
done
