/**
 * Minimal layout for embeddable widgets — no site header/nav/footer. Renders
 * inside an <iframe> on third-party pages, so the background is transparent and
 * the widget card fills the frame.
 */
export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The root layout's <body> uses the canvas color; embeds blend into the host. */}
      <style>{`body{background:transparent}`}</style>
      {children}
    </>
  );
}
