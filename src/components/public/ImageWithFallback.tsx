"use client";

/**
 * Renders a remote image and, if it fails to load (or has no src), swaps to a
 * provided fallback node. Used for party logos and agent photos, whose official
 * sources have partial and unreliable coverage — 10 of the Câmara's 22 party
 * `urlLogo` values are 404 — so the UI must never show a broken image.
 *
 * The `onError` handler alone is not enough. The markup is server-rendered, so
 * the browser starts fetching the image immediately and a 404 can fire its error
 * event *before* React hydrates and attaches the listener; the failure is then
 * lost and the broken-image glyph stays on screen. The mount effect closes that
 * race by asking the DOM directly whether the image already finished loading
 * with no pixels (`complete && naturalWidth === 0`), which is exactly the
 * signature of a load that failed before hydration.
 */
import * as React from "react";

export function ImageWithFallback({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = React.useState(false);
  const ref = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    const img = ref.current;
    // A finished load with zero intrinsic width is a failed load.
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  if (!src || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
