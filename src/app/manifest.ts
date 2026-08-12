import type { MetadataRoute } from "next";

/**
 * PWA web app manifest. Drives the installed-app name, theme colors, and the
 * home-screen / launcher icons (including a maskable variant for Android).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Votto — sua voz transformando a democracia",
    short_name: "Votto",
    description:
      "Voto popular direto e medição de alinhamento político entre cidadãos e agentes públicos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1f1b",
    theme_color: "#183a33",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
