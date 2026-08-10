#!/bin/bash
# Aplica a nova marca Votto no codebase.
#
# COMO USAR
#   1. Descompacte brand.zip (ele cai em ~/Downloads).
#   2. No terminal, entre na pasta do projeto:  cd caminho/para/votto.nosync
#   3. Rode:  bash ~/Downloads/brand/aplicar.sh
#
set -e
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "package.json" ] || [ ! -d "src/app" ]; then
  echo "ERRO: rode este script de dentro da pasta votto.nosync (onde está o package.json)."
  exit 1
fi

echo "Aplicando nova marca a partir de: $HERE"

cp "$HERE/patch/src-app-icon.svg"                    src/app/icon.svg
cp "$HERE/patch/src-components-public-Logo.tsx"      src/components/public/Logo.tsx
cp "$HERE/favicon.png"                               public/favicon.png
cp "$HERE/icon-192.png"                              public/icon-192.png
cp "$HERE/icon-512.png"                              public/icon-512.png
cp "$HERE/apple-icon-180.png"                        src/app/apple-icon.png

python3 - "$HERE" <<'PY'
import re, sys, pathlib
here = pathlib.Path(sys.argv[1])

NEW_MARK = '''/** The Votto "V" mark on a translucent tile, sized in px (SVG scales via viewBox). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x={0} y={0} width={40} height={40} rx={9} fill={SUBTLE} />
      <path d="M10.8 10.6 L20 28.6" stroke={WHITE} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 28.6 L29.2 10.6" stroke={ACCENT} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}'''

NEW_PATHS = '''/** The standalone V/check mark, scaled into a square `size` viewBox. */
function markPaths(scale = 1, x = 0, y = 0) {
  const s = (n) => n * scale;
  return `
    <path d="M${s(10.8) + x} ${s(10.6) + y} L${s(20) + x} ${s(28.6) + y}"
      stroke="${WHITE}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M${s(20) + x} ${s(28.6) + y} L${s(29.2) + x} ${s(10.6) + y}"
      stroke="${ACCENT}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />`;
}'''

def swap(path, pattern, new, label):
    p = pathlib.Path(path)
    src = p.read_text()
    out, n = re.subn(pattern, lambda m: new, src, count=1, flags=re.S)
    if n == 0:
        print("  ! nao encontrei o bloco em", path, "- ajuste manualmente")
    else:
        p.write_text(out)
        print("  ok", label)

swap("src/lib/widgets/images.tsx",
     r'/\*\* The Votto "V" mark on a translucent tile.*?\n\}',
     NEW_MARK, "src/lib/widgets/images.tsx (Mark)")

swap("scripts/generate-brand-assets.mjs",
     r'/\*\* The standalone V/check mark.*?\n\}',
     NEW_PATHS, "scripts/generate-brand-assets.mjs (markPaths)")
PY

echo ""
echo "Pronto. Agora regenere os PNGs a partir da nova geometria:"
echo "  node scripts/generate-brand-assets.mjs"
