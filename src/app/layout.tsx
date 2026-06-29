import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Votto — sua voz no centro da democracia",
    template: "%s · Votto",
  },
  description:
    "Votto é uma plataforma de voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
  applicationName: "Votto",
  // icon.svg, apple-icon.png, manifest.ts and opengraph-image.png are wired
  // automatically by Next.js file conventions; we only add a raster favicon
  // fallback for crawlers/older browsers that don't fetch the SVG.
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "48x48" }],
  },
  openGraph: {
    type: "website",
    siteName: "Votto",
    locale: "pt_BR",
    title: "Votto — sua voz no centro da democracia",
    description:
      "Voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Votto — sua voz no centro da democracia",
    description:
      "Voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
  },
};

export const viewport: Viewport = {
  themeColor: "#133e39",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${sora.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
