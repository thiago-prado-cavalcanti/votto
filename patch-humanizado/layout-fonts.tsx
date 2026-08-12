// Substitua APENAS o bloco de fontes no topo de src/app/layout.tsx.
// O resto do arquivo (metadata, viewport, RootLayout) continua igual —
// só troque as classes aplicadas ao <body>: \`${inter.variable} ${sora.variable}\`
// passa a ser \`${instrument.variable} ${newsreader.variable}\`.

import { Instrument_Sans, Newsreader } from "next/font/google";

const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});
