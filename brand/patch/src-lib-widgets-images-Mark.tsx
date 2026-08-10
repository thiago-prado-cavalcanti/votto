// Substitua APENAS a função Mark em src/lib/widgets/images.tsx (linhas ~56-70).

/** The Votto "V" mark on a translucent tile, sized in px (SVG scales via viewBox). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x={0} y={0} width={40} height={40} rx={9} fill={SUBTLE} />
      <path d="M10.8 10.6 L20 28.6" stroke={WHITE} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 28.6 L29.2 10.6" stroke={ACCENT} strokeWidth={5.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
