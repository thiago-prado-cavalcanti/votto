"use client";

/**
 * Renders a remote image and, if it fails to load (or has no src), swaps to a
 * provided fallback node. Used for party logos and agent photos, whose official
 * sources have partial/unreliable coverage — so the UI never shows a broken image.
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
  if (!src || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
