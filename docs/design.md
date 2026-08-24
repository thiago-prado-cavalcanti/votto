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
- **Type on filled pigment is `white`, not a paper tone.** The warm off-whites are for surfaces;
  a word sitting *on* terracota needs the full range. `accent-50` `#fbf3e8` on `accent-500`
  measures **4.46:1**, under the 4.5:1 AA floor for body text — white reaches **4.91:1**, and
  **5.92:1** on the `accent-600` hover. The same holds for brick (`--color-negative`). This is why
  `Button` variants `primary` and `danger` carry `text-white`.

  The one exception is the **ballot**, where a filled option keeps `navy-50` `#faf7f0`: brick is
  a shade darker than terracota, so it measures 5.52:1 there and passes comfortably, and the vote
  pigments are a closed system that should not borrow from the button palette.

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
| The ballot (`VoteButtons`) | Newsreader | 500 | the one button family in the serif — see §4 |
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
Wrapped in [`PageIntro` / `RecordIntro` / `SectionHead`](../src/components/public/Section.tsx) so
every page opens identically: rule → eyebrow → serif title → lead.

**A page opens on a masthead, not on a heading.** `PageIntro` (index pages) and `RecordIntro` (one
agent, one party) are a band that runs the full width of the paper on a slightly deeper stock
(`bg-navy-100/45`) and closes on a hairline — so they sit **outside** the page's `Container`.
Display type is one step under the home hero's; the right column carries a plate of the page's own
figures. Set as a plain heading, an index page dropped straight into its filter bar and arrived
weightless; a record page filed its one reading in a sidebar card below the fold.

### Plates — the figure beside the headline

Two standing boxes, both hung under a 2px ink rule with a small-caps caption and hairlines between
entries. They are `StatStrip`'s grammar turned on its side.

- [`IndexPlate`](../src/components/public/IndexPlate.tsx) — label · bar · figure, one row per cut
  of one total: the agenda by priority, the bench by office, the largest party benches, an agent's
  roll-call record. Bars are relative to the **largest row, never the sum**, and a non-zero row
  always keeps a visible mark.
- [`ReadingPlate`](../src/components/public/ReadingPlate.tsx) — one or two index readings at the
  size they deserve (2.7rem `.vt-num` in the alignment pigments). A reading with no value states
  why instead of vanishing; a masthead whose figure would be nothing but apologies shows an
  `IndexPlate` of what does exist instead.

### Lists are documents

- **Themes** are an order paper: [`ThemeRow` + `ThemeList`](../src/components/public/ThemeRow.tsx).
  One hairline-separated entry per bill — official identifier and house in small caps, the
  plain-language headline in the serif, summary, subject tags, author — with the voting panel on
  the right. Forty bills read as one document.
  [`ThemeBriefList`](../src/components/public/ThemeBrief.tsx) is the same entry compressed for a
  profile, where the record on the screen is the person: identifier, headline, the role that ties
  the bill to them (Autor / Relator), situation — no summary, no ballot.
- **Rankings are tables** with an explicit index column:
  [`RankingTabs`](../src/components/public/RankingTabs.tsx). Tabs are text with an ink underline,
  not pills in a tray; the leader's index number is terracota, the rest muted.
- **Agents and parties stay as cards** — they are portraits (photo, party, two meters), not rows
  of an agenda.

### The party is a mark, not a tag

Party logos are curated SVGs that carry the acronym in the party's own lettering
(`src/lib/integration/party-logos.ts`), so printing the acronym beside the mark says the same thing
twice — the mark **is** the label, and the acronym in small caps is only the fallback for a party
with no curated mark yet. The marks arrive in every proportion (Republicanos 6.5:1, PP taller than
wide), so a mark is always given a box bounded on **both** sides with `object-contain`; a wide strip
shrinks the upright ones to nothing. `mix-blend-multiply` dissolves the white plate some of them
were exported on.

### Filters

[`FilterBar`](../src/components/public/FilterBar.tsx): no box and no rules around the block —
the fields sit directly on the paper, each a small-caps label over a rule —
`<Input variant="rule">`. The only hairlines are the ones under the fields themselves; a frame
around them read as a second box competing with the masthead above. It stays a plain
`<form method="get">`, so filtering works without JavaScript and the URL remains the state.
Admin forms keep the boxed variant (`variant="box"`, the default), where density and an obvious
hit area matter more.

### Form controls

Every control shares one surface, [`src/components/ui/control.ts`](../src/components/ui/control.ts),
in the two treatments above: `box` (44px, so a field and a `size="md"` button line up) and `rule`
(36px, matching the `size="sm"` button beside it in the filter bar). Three states are common to all
of them, so a form reads as one object: hover warms the hairline, focus takes it to ink *on top of*
the global terracota ring, and `:user-invalid` — a field the browser judged wrong **after** the
citizen touched it — switches the rule to brick. `aria-invalid` does the same for errors we raise.

- **[`Select`](../src/components/ui/select.tsx) draws its own list.** The browser's dropdown is the
  one part of a form no stylesheet can reach, and it used to arrive as an OS panel in the middle of
  an otherwise typeset document. The native `<select>` is still the field — it holds the value, it
  submits, it validates, it is what the server reads — and once mounted it hides behind a trigger
  and a paper listbox built from the same options: hairline panel on `--color-surface`, the row
  under the cursor tinted `navy-100`, the chosen row marked with a terracota check (the wordmark's
  pigment, for the citizen's own choice). It sizes to its longest option and flips to the field's
  right edge rather than leave the viewport. **Before hydration and forever without JavaScript the
  native select renders in place**, same hairline, same chevron — the public filters stay a plain
  `<form method="get">`.
- **Radio and checkbox are ballot marks**, not widgets: the native input keeps the semantics and the
  keyboard, and the mark is drawn — a 2px square that fills with ink and a paper check, or the one
  shape that is genuinely round with an ink dot. Checked is **ink**, like a form filled in with a
  pen and like the ink underline on the ranking tabs; terracota stays reserved for action.
- **The ballot is the exception, and the only one.**
  [`VoteButtons`](../src/components/public/VoteButtons.tsx) sets Sim / Não / Neutro as three equal
  columns of one printed ballot, and breaks two house rules on purpose, because this is the one
  control that is a statement rather than a piece of chrome:
  - **the word is set in the display serif**, not the sans every other button uses — the ballot
    answers a headline and should read like one;
  - **nothing sits inside the button but the word.** A mark of any kind reads as a radio, and
    then the button looks like a form field pretending to be an action.

  Each option carries **its own vote pigment from the start** — word and rule already in the
  colour the tally will use — so the ballot is legible before anything is chosen, and choosing
  only fills that block in solid. Two legibility notes: stone is a fill and too light to set a
  word in, so the neutral option speaks in warm ink (`navy-600`) and keeps stone for its filled
  state; and filled stone is a mid tone, so its word is ink where the other two are paper.

  Terracota is not in the ballot at all — it marks the **prompt** around it: the small-caps
  "Vote neste tema" over the panel in a theme row, and the one card in the system that opens with
  a 3px terracota rule, on the theme page where the ballot leads the sidebar and the result
  follows it.
- **Labels.** [`Field`](../src/components/ui/index.tsx) is the small-caps label over a single
  control; `RadioGroup` is its equivalent for a set — a `<fieldset>` with the same label as its
  `<legend>`, because a group of controls is named by its legend and never wrapped in a `<label>`.

### Charts

Printed, not lit. No glow, no drop shadow, no pill track.

- [`SpectrumBar`](../src/components/public/SpectrumBar.tsx) — five band blocks; the subject's own
  band is inked solid and the other four stay tinted, so the reading survives even if the marker
  is missed. The marker is a 2px ink rule; the band name is set in the serif above it.
- [`PositioningChart`](../src/components/public/PositioningChart.tsx) — **the still form of the
  living mark**, not a scatter plot: the same dark organic mass, hairline spokes and rings, and
  hand-drawn petal as the hero, held in the study's "escuro" colourway (a printed chart does not
  cycle palettes). The petal **leans** toward the quadrant the votes point at and stretches with
  how far from the centre they sit — a centrist reads as a near-circle — and a pigment dot on a
  vector out of the centre marks the exact position, so the shape reads at a glance and the point
  reads precisely. The geometry is shared with `AlignmentRadar` in
  [`src/lib/viz/figure.ts`](../src/lib/viz/figure.ts), so the two cannot drift apart. It replaced
  a squared plate with tinted quadrants that belonged to no other screen.
- [`AlignmentMeter`](../src/components/ui/index.tsx) — a squared bar of pigment on tinted paper,
  the reading in `.vt-num`.
- [`TemperatureBar`](../src/components/public/TemperatureBar.tsx) — the voting panel. Voting is
  the platform's main action and the tally its main reading, so it leads with the winning share
  set large in `.vt-num`, over the split bar, over a three-column tally keyed by the radar's
  vertex dot. With no votes cast it invites the first one instead of printing three zeroes.

  **The bar stays a rectangle.** It is the measurement — it is what shows where Sim ends and Não
  begins — so it takes solid pigment, square joins and a paper fold between shares, on a thin
  8px track with the tag's 2px corner. An organic edge was tried here and rejected: it blurred
  the one boundary the reader is looking for, and a generous radius made a measurement look like
  a pill. The panel's conversation with the mark is carried by everything **around** the bar —
  see below.
- [`StatStrip`](../src/components/public/StatStrip.tsx) — a masthead of figures between two
  rules, separated by vertical hairlines: figure first, small-caps label under it.

### How a screen converses with the mark

The radar is the signature, so other surfaces are expected to sound like it — **without turning
into it**. What travels is never the circle; it is these four, in order of usefulness:

1. **The ground** — a soft mass with **no outline at all**, carried literally by
   `PositioningChart`. Note where it was *not* wanted: the theme row's voting panel was tried as
   a plate (warm stock, then white) and ended with **no background at all**, on the paper behind
   a single hairline. The result and the ballot already carry their own weight; a box around
   them was furniture, and the row is lighter without it.
2. **Translucent pigment closed by a stroke of the same pigment.** That is how a petal is built,
   and it is exactly what an unchosen ballot option is: a 7% tint inside a 38% rule.
3. **The vertex dot** — the small filled circle that marks a reading. It keys the tally columns.
4. **Hairlines**, for everything that separates rather than states.

What does **not** travel: the organic edge, onto anything whose job is to measure. See
`TemperatureBar` above.

### The living mark

[`AlignmentRadar`](../src/components/public/AlignmentRadar.tsx) is the brand as a chart, and the
only figure in the hero. Six vertices joined by a closed Catmull-Rom curve with deterministic
jitter on the control points, so the outline reads as a hand-drawn petal rather than a spider
web. It cycles four datasets and the three closed colourways (escuro → claro → terracota), with
a 50ms delay per vertex so a transition arrives as a wave, plus a permanent ±1.2% breath. It
honours `prefers-reduced-motion` by drawing a single frame.

The curve, the ground mass and the escuro colourway live in
[`src/lib/viz/figure.ts`](../src/lib/viz/figure.ts) rather than in the component, because the
mark now has a second, still form on the agent and party pages (`PositioningChart`). Anything
that draws it draws it from there — deterministically, so a server-rendered path and the
client's are identical.

**Open product question:** the six axes are policy areas (Sustentabilidade, Saúde, Educação,
Economia, Segurança, Direitos) and the component's `DATA` is still fictional. Wiring it to real
data means grouping themes by area and computing alignment per group — the same maths as
`citizenAgentAlignments`, only partitioned. Until that exists it is **brand illustration, not a
chart**, and must not be presented as one.

---

## 5. Motion

**A page is composed, not animated.** Motion in Votto says one thing — this is a document being
set — so the vocabulary is ink settling on paper, a rule drawing itself, a bar of pigment entering
from the left. Nothing bounces, nothing parallaxes, nothing slides in from the side for effect.

The whole vocabulary is one block in [`globals.css`](../src/app/globals.css), driven by
[`motion.tsx`](../src/components/public/motion.tsx).

### Blocks

`<Reveal>` marks a block that arrives when it is scrolled into view. One `IntersectionObserver`
per block, disconnected the moment it fires; the trigger is a **zero threshold against a −10%
root**, never a fraction of the element, because a block taller than about eight screens can
never show a given percentage of itself and would stay hidden for good.

| `variant` | Arrival |
| --- | --- |
| `rise` *(default)* | rises 22px and appears |
| `ink` | settles with a 7px blur closing — display headlines |
| `figure` | comes forward from 0.955 — the radar, the charts |
| `fade` | opacity only — a container whose parts carry the motion |
| `edge` | enters from the margin |

`stagger` brings the direct children in one after the other (`--vt-step`, default 90ms).

### Parts

Inside a revealed block: `.vt-lift` (a line of type settles), `.vt-grow` (pigment enters from the
left), `.vt-draw` (an SVG rule draws itself — needs `pathLength="1"`), `.vt-pop` (a marker lands),
`.vt-fade`. `--vt-d` delays a part.

They are armed **only under a `.vt-reveal` ancestor**, so `AlignmentMeter`, `TemperatureBar`,
`SpectrumBar` and `PositioningChart` animate on the public site and render finished inside the
embed widgets and the admin — no caller has to know the motion system exists.

### The two guarantees

- **Nothing is hidden without a way back.** Every resting state lives inside
  `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`. Without JavaScript,
  or with reduced motion asked for, the page arrives finished — never blank.
- **The first screen never waits for hydration.** A block that opens a page (`HeroB`, `PageIntro`)
  passes `autoplay`: it plays from CSS keyframes as the markup is parsed, with no observer at all.
  Holding a page's largest paint at opacity zero until React hydrates would cost LCP on exactly
  the slow connections this platform has to serve.

### Chrome

The masthead ([`SiteHeader`](../src/components/public/SiteHeader.tsx)) reads the scroll position
with one rAF-coalesced listener: the 1px rule beneath it **fills with terracota** in proportion to
how much of the page has been read, and the masthead condenses 64px → 56px once the page has left
its first screen. Ranking tabs re-key their body so new standings deal in from the top — the one
moment on the site where motion answers a click instead of the scroll.

---

## 6. Brand assets

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

## 7. Checklist before shipping a screen

- [ ] No shadow. Structure is `border border-line`.
- [ ] Corners are `rounded-card` (or `rounded-[2px]` for a tag, `rounded-full` for a photo).
- [ ] No `font-bold` / `font-extrabold` anywhere; headings carry no weight utility at all. The
      logotype (`Wordmark`) is the one sanctioned exception.
- [ ] Every index, percentage and count uses `.vt-num`.
- [ ] Labels are sans 600, uppercase, tracked, `--color-muted`.
- [ ] The page opens with one `.vt-rule-ink`.
- [ ] Ochre text uses `--color-ochre-ink`; nothing relies on ochre-on-paper contrast.
- [ ] Whites on ink surfaces are `navy-50`, not `#fff`.
- [ ] Every field comes from the kit (`Input`, `Textarea`, `Select`, `Radio`, `Checkbox`) — a bare
      `<input>`, `<select>` or `type="radio"` reintroduces the browser's own chrome.
- [ ] Motion respects `prefers-reduced-motion`, and nothing is left hidden without JavaScript
      (put resting states inside the guarded block in `globals.css` — never in a bare rule).
- [ ] A block that opens a page uses `autoplay`; only below-the-fold blocks wait for the observer.

---

## 8. Not yet converted

The study these decisions come from (`patch-humanizado/`, plus the `Votto - Site Humanizado.html`
comps, which were not delivered with it) also proposed layout work that has **not** been applied:

- the agent and party lists as tables rather than card grids;
- a denser treatment of the theme detail page (the official record as a marginal column).

Both currently inherit the system through the tokens and read correctly; they simply keep their
existing layout.
