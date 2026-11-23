#!/usr/bin/env bash
# Builds bolder, outlined number textures for the dice models that take a custom color.
# Small dice blur thin numbers into the body color. A thicker glyph with a contrasting ring stays readable.
# Needs ImageMagick 7. Run it again only when the dice packages change, then commit dice-overrides/.
set -euo pipefail
cd "$(dirname "$0")/.."

themes=node_modules/@3d-dice/dice-themes/themes
box=node_modules/@3d-dice/dice-box/dist/assets/themes
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# pair <source dir> <light file> <dark file> <theme> <glyph growth> <ring width>
# Widths are in pixels of a 1024px texture and scale with the real texture size.
# The "light" texture has white numbers for dark dice. The "dark" texture has dark numbers for light dice.
# Both share one layout, so the white numbers of the light texture locate the glyphs in both.
pair() {
  local dir=$1 light=$2 dark=$3 theme=$4 grow=$5 ring=$6
  local size growPx ringPx
  size=$(magick identify -format "%w" "$dir/$light")
  growPx=$(magick -format "%[fx:$grow*$size/1024]" xc: info:)
  ringPx=$(magick -format "%[fx:$ring*$size/1024]" xc: info:)
  mkdir -p "dice-overrides/themes/$theme"

  # White and opaque pixels are numbers. Any body pattern is dark or translucent and drops out.
  magick "$dir/$light" \( +clone -alpha extract \) \( -clone 0 -alpha off -colorspace Gray \) -delete 0 \
    -compose Multiply -composite -threshold 75% "$tmp/numbers.png"
  magick "$tmp/numbers.png" -morphology Dilate "Disk:$growPx" -blur 0x0.6 "$tmp/glyph-mask.png"
  magick "$tmp/numbers.png" -morphology Dilate "Disk:$ringPx" -blur 0x1.2 -evaluate multiply 0.9 "$tmp/ring-mask.png"

  layer() { # <color> <mask> <output>
    magick -size "${size}x${size}" "xc:$1" "$2" -alpha off -compose CopyOpacity -composite "$3"
  }
  build() { # <source> <glyph color> <ring color> <output>
    layer "$3" "$tmp/ring-mask.png" "$tmp/ring.png"
    layer "$2" "$tmp/glyph-mask.png" "$tmp/glyph.png"
    magick "$1" "$tmp/ring.png" -compose Over -composite "$tmp/glyph.png" -compose Over -composite \
      -define png:color-type=6 -strip "$4"
    echo "wrote $4"
  }
  build "$dir/$light" white "#0b0b12" "dice-overrides/themes/$theme/$light"
  build "$dir/$dark" "#0b0b12" white "dice-overrides/themes/$theme/$dark"
}

pair "$box/default"     diffuse-light.png  diffuse-dark.png  default  2.5 11
pair "$themes/smooth"   diffuse-light.png  diffuse-dark.png  smooth   2.5 11
pair "$themes/gemstone" gemstone-light.png gemstone-dark.png gemstone 2.5 11
pair "$themes/rock"     diffuse-light.png  diffuse-dark.png  rock     3.5 12
pair "$themes/rust"     diffuse-light.png  diffuse-dark.png  rust     2.5 11
