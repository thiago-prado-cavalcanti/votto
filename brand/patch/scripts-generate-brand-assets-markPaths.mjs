// Substitua APENAS a função markPaths em scripts/generate-brand-assets.mjs (linhas ~26-34).
// O resto do script (iconSvg, maskableSvg, ogSvg, main) continua igual.

/** The standalone V/check mark, scaled into a square `size` viewBox. */
function markPaths(scale = 1, x = 0, y = 0) {
  const s = (n) => n * scale;
  return `
    <path d="M${s(10.8) + x} ${s(10.6) + y} L${s(20) + x} ${s(28.6) + y}"
      stroke="${WHITE}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M${s(20) + x} ${s(28.6) + y} L${s(29.2) + x} ${s(10.6) + y}"
      stroke="${ACCENT}" stroke-width="${s(5.8)}" stroke-linecap="round" stroke-linejoin="round" />`;
}
