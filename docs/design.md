# Votto — design system

> **Papel & pigmento.** Votto is a public institution that happens to be a website. It should
> read like a well-set document, not like a dashboard: warm paper, ink type, earth pigments,
> structure carried by 1px rules. This file is the source of truth for the visual system; the
> product rules live in [CLAUDE.md](../CLAUDE.md).

The system replaced an earlier "bold, high-presence" scheme (screen orange, cool near-black,
Sora ExtraBold, 20px corners, soft shadows). The token **names** were kept, so every existing
utility class adopted the new look without a rename — but the values, the type and the surface
logic all changed. Anything that still looks like the old scheme is a bug.

---

## 1. Principles

1. **Warm paper, never white.** The page is `--color-canvas` (`#fcfaf6`). Pure `#ffffff` only
   appears as `--color-surface`, for a panel that must lift off the page.
2. **Structure is a rule, not a shadow.** A 1px line in `--color-line` does the work a shadow
   used to do. `--shadow-bold` survives as a near-flat token; new work should not reach for it.
3. **Paper folds, it does not round.** `--radius-card` is **4px** (`rounded-card`). Badges are
   2px. `rounded-full` is reserved for what is genuinely round: photographs, avatars.
4. **One display voice.** Newsreader at **weight 500**, always. There is no 700 and no 800 in
   this system — not in headlines, not in numbers, not in the wordmark.
5. **Pigments, not signals.** Moss, brick, ochre, stone, pinho, terracota. No traffic light, no
   neon, no gradient that fades to transparent.
6. **One decoration.** A paper grain at 3.5% in multiply over the whole document. That is the
   entire ornament budget — it replaced the blurred auroras and the 56px grid of the old dark
   sections.

---

## 2. Tokens

All tokens live in [`src/app/globals.css`](../src/app/globals.css) under `@theme`, so Tailwind
generates the matching utilities (`bg-navy-900`, `text-accent-500`, `rounded-card`, …).

### Ink — the neutral ramp (`navy-*`)

A **warm** near-black, not a blue-black. `navy-900` is `#17150f`; `navy-50` is `#faf7f0`. Used
for type, hairlines, tinted paper and the dark bands (footer, admin sidebar).

### Pinho — the institutional green (`colonial-*`)

`colonial-600` `#1f4a41`, `colonial-700` `#183a33` (the `themeColor` and the launcher-icon
tile). One degree warmer than the old teal. This is the "government we can trust" colour: the
left arm of the mark, the party/positioning accents.

### Terracota & ocre (`accent-*`, `--color-ochre`)

- `accent-500` `#b4552f` — **action**: primary buttons, the hand-drawn hero underline, links
  that do something, the right arm of the mark.
- `--color-ochre` `#c07f2c` — **highlight**: stars, the middle alignment band, mid-spectrum.
- `--color-ochre-ink` `#7d5218` — ochre as *type*. Pure ochre on warm paper is ~2.7:1, so any
  ochre text or ochre-on-tint label uses this instead.

### Surfaces & semantics

| Token | Value | Use |
| --- | --- | --- |
| `--color-canvas` | `#fcfaf6` | the page |
| `--color-surface` | `#ffffff` | a panel lifted off the page |
| `--color-line` | `#e2ddd0` | every hairline |
| `--color-ink` | `#17150f` | body type |
| `--color-muted` | `#5b5648` | secondary type, small caps labels |

### Votes and indexes

`--color-vote-yes` moss `#556b3d` · `--color-vote-no` brick `#a8452f` ·
`--color-vote-abstention` stone `#8a8578`. Abstention is **always** neutral stone — never
ochre, moss or brick, because "neutro" is a position, not a partial yes.

The three index bands (0–100) live in one place, [`src/lib/domain/tone.ts`](../src/lib/domain/tone.ts):
`alignmentTone()` for a bar fill, `alignmentInk()` for type. Never re-type the thresholds.

---

## 3. Typography

| Role | Family | Weight | Notes |
| --- | --- | --- | --- |
| Display (h1–h3, `.font-display`) | Newsreader | **500** | `letter-spacing: -0.026em`, applied globally |
| Body | Instrument Sans | 400 | |
| Labels, buttons, table headers, microcopy | Instrument Sans | 600 | uppercase, `tracking-[0.12em]`–`[0.14em]`, ~0.7rem |
| Indexes, percentages, counts (`.vt-num`) | Newsreader | 500 | `font-variant-numeric: tabular-nums` |

Two rules that are easy to break:

- **Never put a weight utility on a heading.** `h1`–`h3` already get the serif at 500 from
  `globals.css`; `font-bold` or `font-semibold` on top of it fights the system and, worse,
  silently synthesises a weight the loaded font may not have.
- **A heading that is really a filing label gets `font-sans`.** "Ficha oficial", "Documentos e
  fontes" and the like are `<h2 className="font-sans text-[0.7rem] font-semibold uppercase
  tracking-[0.14em] text-[var(--color-muted)]">` — semantically a heading, typographically a
  stamp on a folder.

Numbers are the platform's product, so they are set, not merely printed: any index, percentage
or tally goes through `.vt-num`.

---

## 4. Patterns

### The opener

`.vt-rule-ink` — a 3px ink rule, the one way a page or section opens. **Never a double rule.**
Wrapped in [`PageIntro` / `SectionHead`](../src/components/public/Section.tsx) so every page
opens identically: rule → serif title → lead paragraph.

### Lists are documents

- **Themes** are an order paper: [`ThemeRow` + `ThemeList`](../src/components/public/ThemeRow.tsx).
  One hairline-separated entry per bill — official identifier and house in small caps, the
  plain-language headline in the serif, summary, subject tags, author — with the tally and the
  vote buttons on the right behind a vertical rule. Forty bills read as one document.
- **Rankings are tables** with an explicit index column:
  [`RankingTabs`](../src/components/public/RankingTabs.tsx). Tabs are text with an ink underline,
  not pills in a tray; the leader's index number is terracota, the rest muted.
- **Agents and parties stay as cards** — they are portraits (photo, party, two meters), not rows
  of an agenda.

### Filters

[`FilterBar`](../src/components/public/FilterBar.tsx): no box. Fields sit on the paper between
two hairlines, each a small-caps label over a rule — `<Input variant="rule">`. It stays a plain
`<form method="get">`, so filtering works without JavaScript and the URL remains the state.
Admin forms keep the boxed variant (`variant="box"`, the default), where density and an obvious
hit area matter more.

### Charts

Printed, not lit. No glow, no drop shadow, no pill track.

- [`SpectrumBar`](../src/components/public/SpectrumBar.tsx) — five band blocks; the subject's own
  band is inked solid and the other four stay tinted, so the reading survives even if the marker
  is missed. The marker is a 2px ink rule; the band name is set in the serif above it.
- [`PositioningChart`](../src/components/public/PositioningChart.tsx) — squared plate, hairline
  rings, quadrants tinted at 7%, an ink vector ending in a terracota dot ringed in paper.
- [`AlignmentMeter`](../src/components/ui/index.tsx) — a squared bar of pigment on tinted paper,
  the reading in `.vt-num`.
- [`StatStrip`](../src/components/public/StatStrip.tsx) — a masthead of figures between two
  rules, separated by vertical hairlines: figure first, small-caps label under it.

### The living mark

[`AlignmentRadar`](../src/components/public/AlignmentRadar.tsx) is the brand as a chart, and the
only figure in the hero. Six vertices joined by a closed Catmull-Rom curve with deterministic
jitter on the control points, so the outline reads as a hand-drawn petal rather than a spider
web. It cycles four datasets and the three closed colourways (escuro → claro → terracota), with
a 50ms delay per vertex so a transition arrives as a wave, plus a permanent ±1.2% breath. It
honours `prefers-reduced-motion` by drawing a single frame.

**Open product question:** the six axes are policy areas (Sustentabilidade, Saúde, Educação,
Economia, Segurança, Direitos) and the component's `DATA` is still fictional. Wiring it to real
data means grouping themes by area and computing alignment per group — the same maths as
`citizenAgentAlignments`, only partitioned. Until that exists it is **brand illustration, not a
chart**, and must not be presented as one.

---

## 5. Brand assets

**The logo is the wordmark, and there is no separate mark.** Votto is set as "Votto." in the
display serif, closed by a terracota period — the logotype's only pigment, never dropped and never
restated in another colour. The geometric "V" tile that preceded it is retired.

- In the product ([`Wordmark`](../src/components/public/Wordmark.tsx)) it is **live text**, not
  SVG, so it inherits the loaded Newsreader and stays selectable. Weight **700** is the single
  exception to the "no 700 in this system" rule: a logotype is drawn, not composed.
- A wordmark cannot survive a 16px browser tab, so two forms carry the brand in the icons
  (`npm run assets:brand`, `scripts/generate-brand-assets.mjs`):
  - the **serif V** with its period, on a pinho tile, for the favicon — a fragment of the
    signature rather than a new symbol;
  - the **radar petal** for the PWA and Apple install icons, where the shape has room to breathe.
    It is the same blob `AlignmentRadar` animates, reduced to a still mark: ground, the citizen's
    petal and its vertex dots, with the hairlines, labels and second petal dropped.
- Launcher icons keep a **22% radius** — the single place the "paper does not round" rule is set
  aside, because iOS and Android expect a generously rounded tile and mask it anyway.
- The letterforms live in [`scripts/brand-glyphs.mjs`](../scripts/brand-glyphs.mjs) as literal
  outlines lifted from Newsreader Bold. That file is **generated data, not authored** — rendering
  `<text>` through librsvg would silently substitute whatever serif the machine has installed.
- **Share cards** ([`src/lib/widgets/images.tsx`](../src/lib/widgets/images.tsx)) are newspaper
  clippings: paper ground, 3px ink opener, serif headline, squared vote bar in moss/brick/stone,
  a hairline above the footer, terracota CTA block. Fonts come from `public/fonts` via
  `npm run assets:fonts` (Instrument Sans 400/600 + Newsreader 500 — there is no 800 to fetch).

---

## 6. Checklist before shipping a screen

- [ ] No shadow. Structure is `border border-line`.
- [ ] Corners are `rounded-card` (or `rounded-[2px]` for a tag, `rounded-full` for a photo).
- [ ] No `font-bold` / `font-extrabold` anywhere; headings carry no weight utility at all. The
      logotype (`Wordmark`) is the one sanctioned exception.
- [ ] Every index, percentage and count uses `.vt-num`.
- [ ] Labels are sans 600, uppercase, tracked, `--color-muted`.
- [ ] The page opens with one `.vt-rule-ink`.
- [ ] Ochre text uses `--color-ochre-ink`; nothing relies on ochre-on-paper contrast.
- [ ] Whites on ink surfaces are `navy-50`, not `#fff`.
- [ ] Motion respects `prefers-reduced-motion`.

---

## 7. Not yet converted

The study these decisions come from (`patch-humanizado/`, plus the `Votto - Site Humanizado.html`
comps, which were not delivered with it) also proposed layout work that has **not** been applied:

- the agent and party lists as tables rather than card grids;
- a denser treatment of the theme detail page (the official record as a marginal column).

Both currently inherit the system through the tokens and read correctly; they simply keep their
existing layout.
