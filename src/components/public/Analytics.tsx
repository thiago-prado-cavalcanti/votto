/**
 * Google Analytics 4 (gtag.js) for the public site.
 *
 * Rendered only when `GA_MEASUREMENT_ID` is set, and read on the server at
 * request time — not inlined at build time — so the same image can be deployed
 * with or without analytics, and the id can change without a rebuild.
 *
 * Mounted from the `(public)` layout only: the admin backoffice, the embeddable
 * widgets (which run inside third-party pages) and the dev IdP are deliberately
 * not measured.
 *
 * Client-side navigations are counted by GA4's own "medição aprimorada"
 * (page changes based on browser history events, enabled by default on a web
 * stream), which is what the App Router's `pushState` triggers. We therefore do
 * *not* send page views manually — doing both is what double-counts.
 *
 * Advertising signals are switched off (§5, minimal data collection): no
 * Google Signals, no ad personalization. GA4 already truncates IPs by default.
 */
import Script from "next/script";
import { env } from "@/lib/env";

export function Analytics() {
  const measurementId = env.gaMeasurementId;
  if (!measurementId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}', {
  allow_google_signals: false,
  allow_ad_personalization_signals: false
});`}
      </Script>
    </>
  );
}
