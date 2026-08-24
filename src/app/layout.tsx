import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

// Instrument Sans carries labels, buttons, table headers and microcopy;
// Newsreader (newspaper serif, weight 500) carries every display size and the
// tabular numerals of the indexes. See docs/design.md.
const instrument = Instrument_Sans({
  subsets: ["latin"],
  // Instrument Sans starts at 400 — there is no 300 to ask for.
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});

// Only the weights the system actually has. `docs/design.md` §1, rule 4: "there
// is no 700 and no 800 in this system — not in headlines, not in numbers, not
// in the wordmark", and a search of the public surface finds `font-bold` once.
// Asking for a weight the design forbids is how it comes back.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const appUrl = process.env.APP_URL ?? "http://localhost:3100";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Votto — sua voz transformando a democracia",
    template: "%s · Votto",
  },
  description:
    "Votto é uma plataforma de voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
  applicationName: "Votto",
  // Declaring `icons` here overrides Next.js's file-convention auto-links, so we
  // must list every icon explicitly: scalable SVG (preferred by modern
  // browsers), a raster PNG fallback, and the apple-touch-icon for iOS.
  // (manifest.ts and opengraph-image.png are still auto-wired by convention.)
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.png", type: "image/png", sizes: "48x48" },
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180" },
  },
  openGraph: {
    type: "website",
    siteName: "Votto",
    locale: "pt_BR",
    title: "Votto — sua voz transformando a democracia",
    description:
      "Voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Votto — sua voz transformando a democracia",
    description:
      "Voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
  },
};

export const viewport: Viewport = {
  // Pinho 700 — the institutional green of the humanized palette.
  themeColor: "#183a33",
  // The page must reach under the notch and the home indicator before
  // `env(safe-area-inset-*)` reports anything but `0px`. Every sheet and every
  // bottom-anchored control depends on it, so it belongs here rather than at
  // the first call site that needs it.
  viewportFit: "cover",
};

/**
 * Shows the whole document if the page never finishes arriving.
 *
 * The stylesheet arms the resting states on its own, from `scripting: enabled`
 * — no JavaScript involved, so the first block is held from the moment the CSS
 * is parsed. This script only ever *disarms*, by stamping `data-motion="off"`,
 * and that direction is the point: an inline script does not run while a
 * stylesheet is still loading, so anything that had to run before the first
 * paint would arrive late on exactly the connections that need it most. A
 * failsafe arriving late costs nothing.
 *
 * `Reveal` cancels the timer as soon as it is mounted and observing. If that
 * never happens — chunks blocked, a hydration error, a network that gave up —
 * the stamp lands and every block is simply visible. A reader who loses the
 * animation has lost nothing; a reader who loses the text has lost the page.
 *
 * It sits at the END OF THE BODY, and that is not tidiness. An inline script in
 * the head waits for every pending stylesheet before it runs, and while it
 * waits it blocks the HTML parser — so the body itself was parsed late, the
 * masthead animation started late with it, and /temas measured 3,9s of LCP
 * against 2,2s. Down here it blocks nothing, and a failsafe that arms a beat
 * later is still a failsafe.
 */
const MOTION_FAILSAFE = `try{var d=document.documentElement;
window.__vtDisarm=setTimeout(function(){d.setAttribute("data-motion","off")},2500)}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${instrument.variable} ${newsreader.variable}`}>
      <head>
        {/* DNS only, and deliberately not `preconnect`: warming the connection
            on every page costs a TLS handshake even where no Câmara image is
            ever requested. The record pages, whose LCP element really is a
            portrait from that host, are the only ones that would gain. */}
        <link rel="dns-prefetch" href="https://www.camara.leg.br" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <script dangerouslySetInnerHTML={{ __html: MOTION_FAILSAFE }} />
      </body>
    </html>
  );
}
