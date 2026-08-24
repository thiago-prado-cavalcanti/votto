# Votto

> Direct-democracy platform: citizens vote on political themes, and the system measures how
> aligned public agents and parties are with each citizen's choices.

This file is the source of truth for the project's vision, scope, data model, and engineering
conventions. Keep it updated as decisions evolve.

---

## 1. Vision

Votto proposes a **complement** to representative democracy — not a replacement.

Representative democracy exists because, historically, a population could not deliberate directly
on every law and executive action, so it elected representatives. That constraint is now largely
technical, and can be complemented by a platform that lets each citizen express direct opinions on
**national, state, and municipal** themes.

The goal is **not** to remove the current democratic structure, but to:

- Help **citizens** identify how aligned their elected officials are with their own positions.
- Help **elected officials** understand and align with their constituents.

Votto gives the population a complementary channel of expression alongside the existing political
structures.

---

## 2. Product Scope (MVP)

This is an **MVP**. It does not need to be extremely high-performance yet, but the architecture
**must** anticipate evolution to thousands of daily queries and millions of users.

Guiding principles:

- **Security first.** A leak must expose nothing beyond first and last name.
- **Systemic simplicity.** Simplicity brings code clarity and removes security gaps. Prefer the
  simplest design that satisfies the requirement.
- **Minimal data collection.** Store the absolute minimum about citizens.
- **Scalability path.** Easy to port/scale later without a rewrite.

### Backend (admin) pages

- **Login**
- **Dashboard** — statistics for users, parties, public agents, themes, and votes.
- **Public agents** — CRUD + block.
- **Parties** — CRUD + block.
- **Themes** — CRUD + block (with multi-article upload).
- **Administrators** — CRUD + block.

### Frontend (public) pages

- **Home** — impactful, concise pitch of the project; key statistics; list of "hot" themes; quick
  vote action on hot themes.
- **Login** — authentication via official Brazilian identity providers only.
- **Public agents** — list of registered agents with party, general info, and (the key feature) the
  **Alignment Index** and **Political Positioning Index**. Filters and sorting.
- **Public agent (detail)** — full detail of one agent.
- **Themes** — list with a "temperature" index, vote counts, and filters. Vote action.
- **Theme (detail)** — full detail of one theme. Vote action.
- **Metodologia** (`/metodologia`) — the arithmetic of every published index: the formulas, the
  constants in force, the standard errors and the conditions under which nothing is published.
  It is the technical half of `/sobre`, whose index section is titled "os índices, sem matemática".
  **Reachable only from the footer**, deliberately: it is the site's appendix, not a destination,
  and a nav entry would put it in competition with the pages a citizen came to use. Two rules keep
  it honest — every constant is *imported* from the index modules rather than typed into the page
  (a second copy of the numbers is the copy that goes stale, and it is the one that would be
  quoted), and it states what the code does even where two readings differ (the double-abstention
  discard applies to the personal index and not to the base one, and the page says so).

---

## 3. Core Features — The Indexes

This is the heart of the platform and the main performance challenge.

### 3.1 Alignment Index (primary feature)

For the **currently logged-in user**, compute how aligned each public agent and each party is with
that user's voting record.

- A vote on a theme is one of: **yes**, **no**, **abstention**.
- Numeric mapping: `yes = +1`, `no = -1`, `abstention = 0`.
- Compare the user's votes with an agent's votes over the **set of themes both have voted on**.
- **A theme where BOTH abstained leaves that set entirely** — numerator and denominator, the euandi
  and smartvote rule for "no opinion". The naive distance over `{-1, 0, 1}` scores two abstentions
  **1.0, a perfect match**, which is the Wahl-O-Mat's most-criticised behaviour landing on a pair
  that resembles itself even less: a citizen's "Neutro" is the platform's own offer of *no opinion*,
  while an agent's abstention is a procedural manoeuvre under party instruction (and `mapVote` folds
  *obstrução* into it). Two people who each declined to state a position have not agreed about
  anything, and the defect was not random noise — it inflated the reading of whoever abstained most.
  A *mixed* pair keeps its 0.5, which is standard across the field. Guarded by `npm run
  check:alignment`; the worked example on `/sobre` prints seven rows over a denominator of six so the
  rule is visible rather than stated.
- Score: agreement-based similarity normalized to **0–100%**. (Start with weighted agreement /
  cosine similarity over the shared theme set; revisit weighting later, e.g. by theme importance.)
- **Party alignment** = aggregation of its agents' positions (or the party's official position when
  available).

**Performance design (must be dynamic and scalable):**

- An agent/party has **one position per theme**, so agent vote vectors are small and stable —
  precompute and cache them.
- The user's vote vector is also small (only themes they voted on).
- Compute alignment **on demand per logged-in user**, against precomputed agent/party vectors.
- Cache results (e.g. Redis) keyed by `userVoteVersion` so they invalidate when the user votes.
- Consider materialized aggregates / incremental updates as volume grows. Do **not** recompute
  global similarity for every request from raw votes.

**The published reading is the agent against their own base**, not against the whole electorate.
A citizen declares who represents them by **following** (§3.1.1); the followers of an agent are
that agent's *base*, and `agentBaseAlignments()` measures the agent's roll-call record against the
mean stance of that base per theme. `partyBaseAlignments()` is the same reading per party, weighted
by how many citizens each of its agents represents — the party's base is the union of its agents'
bases, so a senator speaking for 4.000 citizens cannot count the same as a deputy speaking for 40.

`agentElectorateAlignments()` — the agent against the aggregate of *every* citizen who voted — is
kept as the **fallback**, because nobody is elected by everybody and that figure answers no real
question. `publicReading()` in `src/lib/domain/reading.ts` is the single place the rule lives: the
base wins where there is one, the electorate stands in where there is not, and the two never appear
together (they answer the same question, and printing both asks the reader to arbitrate). Every
surface calls it — cards, records, party pages, rankings, embeds, OG images — so they cannot drift.

### 3.1.1 Following ("acompanhar")

The ballot is secret, so the platform can never ask who somebody voted for — and without that, the
index above has no honest denominator. Following is the analogue it *can* ask for: instead of
asserting a past vote, the citizen declares, in the present and revocably, who represents them.

- **One follow per office** (`AgentFollow`, `@@unique([userId, type])`), because that is how the
  ballot works: one federal deputy, one senator, one governor. The office is denormalized onto the
  row precisely so the rule lives in the database rather than in every call site.
- **Swapping is two steps.** Where an office is already taken, the button *disappears* from the
  other agents of that office and is replaced by a line naming who holds it, linked — the swap
  stays findable without the platform pretending you can follow two deputies.
- **Not behind the vote challenge.** That challenge stops an unlocked phone from *voting*; a follow
  on its own moves no index, because the base is computed from the followers' votes — and casting
  those already passed it.
- **Only sitting agents** can be followed (`inOffice`). A follow whose mandate later ends is kept
  (history) and surfaced on `/conta` for the citizen to redo.
- **Follower counts are public; follower names are not** — for anybody, ever.
- Server action: `src/lib/actions/follows.ts`. Read helpers: `src/lib/domain/follows.ts`.

### 3.2 Political Positioning Index (secondary feature)

Where a voting record falls on two value axes, taken from the **Chapel Hill Expert Survey** so the
output is checkable against an external measure:

| Axis | Poles | CHES equivalent |
|---|---|---|
| **economic** | Estado ↔ Mercado | LRECON — privatisation, tax, regulation, spending, pensions |
| **social** | Ordem ↔ Liberdades | GALTAN — personal freedoms against order, tradition, moral authority |

The social axis was relabelled, not re-signed: it read `Comunidade ↔ Indivíduo`, and "Comunidade"
invites coding communitarianism — a third thing that correlates with neither pole. Tags already
stored stay valid.

**The index is a batch job** (`metrics:positioning`), not a per-person computation, and that is
forced by the maths: weighting a theme by the division it actually produced needs the whole house's
vote on it, and shrinking a party toward the mean needs every party's distribution. Same reason
`metrics:quality` is a job while `Theme.priority` is written by the importers.

#### What the rebuild fixed

The first version was a weighted mean of `vote × theme weight` — arithmetically the open **8values**
quiz, which publishes code and no method. Four defects, each now answered by a named piece
(`src/lib/indexes/positioning.ts`):

- **Missing data read as centre.** No tagged themes gave `economic: 0`, the coordinate of a perfect
  centrist. *That* was the "PL at Centro" regression — not bad weights, absent data printed as a
  measurement. Coverage is now measured (`effectiveItems`) and below the floor the axis is `null`,
  the same discipline `qualityScore` applies.
- **Every theme weighed the same, including the ones nobody split over.** An item's weight is its
  **discrimination** and it is measurable, not guessable: `discrimination()` reads the real division,
  so a unanimous vote is worth zero. This is also what neutralises agenda composition — a run of
  bills passed by acclamation no longer pushes the whole house toward the pole they were tagged with.
- **The first dimension of Brazilian roll calls is not ideology.** Zucco & Lauderdale (*LSQ* 36(3),
  2011): it is **governo↔oposição**. Measured raw, the first principal component correlates −0.96
  with governismo and +0.49 with the survey scale, putting PSOL to the right of PSDB — because PSOL
  opposes the government from the left. Better theme tagging cannot fix this: the coalition signal
  is in the votes, not the ementas. `contamination` discounts the Executive's agenda item by item
  (the Câmara publishes the `Governo` bloc's orientation), and the falsification gate below catches
  what is left.
- **The `0.7·economic + 0.3·social` collapse was invented.** No source for those weights; RILE
  weighs its two sides equally and CHES refuses to collapse at all. The index has two axes and
  publishes two. A single number would have to be *fitted* against an external reference, never
  asserted.

#### Four gates, and nothing is published unless all four pass

Per house, in `src/lib/integration/positioning.ts`:

1. **Coverage** — enough agents with a reading, over enough effective items.
2. **Falsification against governismo** — the agents' economic reading is correlated with their own
   `governismo`. Above `MAX_GOVERNMENT_CORRELATION` (0.50) the index is measuring support for the
   Executive and calling it ideology, so the house is blocked. This is the test the literature says
   an index like this silently fails.
3. **Spread against the ruler** — our party means must disperse comparably to the anchor's, over the
   same parties, above `MIN_SPREAD_RATIO` (40%). **Spearman is scale-free and cannot see this.** An
   axis crushed against zero still produces an ordering, and the ordering can still correlate well —
   but the published reading would be false in a different way: it would tell a citizen that PSOL and
   PL are neighbours. Measured on the Câmara on 2026-08-23, our party means ran from **−9 (PSOL) to
   +6 (PP)** — fifteen points — against roughly 160 that Bolognesi and BLS cover for the same
   parties. Ratio **≈ 0.08**, while the anchor correlation read a respectable 0.63. The threshold is
   a *ratio against the ruler* rather than a number on our own scale, for the same reason gate 4 is:
   what counts as enough dispersion for an ideology measure is decided by the external measure.
4. **External anchor** — party ordering on the economic axis against expert surveys
   (`src/lib/domain/anchors.ts`), by Spearman, needing `MIN_ANCHOR_CORRELATION` (**0.85**) over
   `MIN_ANCHOR_COVERAGE` (60%) of seats. An index built from votes and validated against the same
   votes is not validated; it is circular (Jackson & Kingdon, *AJPS* 36, 1992). The bar comes from
   outside: Brazilian survey measures agree with each other at **0.947–0.988**, while manifesto
   analysis — the one family the literature already treats as measuring something else — sits at
   0.575 against CHES. 0.85 is what puts Votto in the first family rather than the second, and it is
   reachable: an anchored rotation over the Câmara's real roll calls measured 0.86 out of sample.

**Passing the falsification gate by losing the signal is not passing it.** The Câmara clears gate 2
today, and the reason is not that the index separated ideology from governismo — it is that the axis
has almost no variance left to correlate with anything. The mechanism is in `itemWeight`, and the two
factors are anti-correlated in Brazil: a vote that **divides** the house is almost by definition a
government↔opposition vote, so `|r(vote, governismo)|` is high and `(1 − contamination)` drives the
weight to 0.05–0.2; a vote with **low** contamination is one the coalition did not drive, which in
practice is consensual and gets zeroed by `MIN_DISCRIMINATION`. What survives is a thin residue with
small weights whose signed contributions cancel. Everyone lands near zero. That is what the spread
gate above exists to catch, and it is why a near-constant axis is a defect the correlation gates are
structurally blind to. The fix is to **residualise rather than discount** — see §11.

**Gates 2 and 4 are not substitutes for each other, and the reason is measured.** Party-level
*governismo* on its own — the share of roll calls the bench voted with the `Governo` bloc, with no
notion of ideology inside it — correlates with the Bolognesi anchor at **+0.93 under Bolsonaro and
−0.81 under Lula**. A pure support-for-the-Executive index therefore scores 0.81–0.93 on the anchor
test, and **would have passed** a threshold of 0.70. Inside one presidency the Brazilian coalition is
ideologically ordered, so the two are nearly collinear; what separates them is the change of
president, where the sign inverts — which a genuine ideological measure would not do. So the anchor
alone nearly validates governismo, and lowering `MIN_ANCHOR_CORRELATION` "because the anchor already
covers it" is exactly the error the gate exists to prevent.

**A control that cannot discriminate blocks the house.** `pearson` returns `null` when either side
has no variance, and the falsification gate read `govR !== null && Math.abs(govR) > MAX` — so a
degenerate control *passed by silence*. It publishes no wrong number; it publishes without a test,
which is worse. It is now `kind: "degenerate"`, and `check:positioning` pins the `null`.

**This block is a published finding reproduced, not a defect in our data.** Izumi (*Dados* 59(1),
2016) ran Optimal Classification over **1,408 Senate nominal roll calls (1989–2010)**: dimension 1
correlates 0.95, 0.93, 0.75 and −0.94/−0.96 with following the government leader, by legislature,
**and the sign flips when the president changes**. His conclusion is our gate — *"essa primeira
dimensão de fato representa uma clivagem entre governo versus oposição e não as preferências
ideológicas dos parlamentares."* Spirling & McLean (*Political Analysis* 15(1), 2007) show the same
in Westminster at **99.1% correct classification**, with Corbyn, Benn and Skinner ranked the most
right-wing Labour MPs. **A high fit statistic is not validity**, and more classified bills cannot fix
this — the coalition signal is the house's first dimension, not a coverage shortfall.

A further gate decides only whether the *second* axis is a number. **In Brazil the two axes barely
separate**: Martínez-Gallardo et al. (*Party Politics*, 2023) ran a CFA on the CHES items and a
second factor buys **+0.234 CFI in Europe against +0.045 in Latin America**, with the latent
correlation at **0.95 there vs 0.58 here**; across the eleven Brazilian parties in CHES-LA,
r(economic, social) = **0.94**. Above `MAX_AXIS_CORRELATION` (0.85) the social axis keeps feeding the
figure and stops being published as a reading of its own. The residual is real — it separates the
economically-liberal right (PSDB, NOVO) from the moral-authoritarian right (PL, Republicanos, PSC) —
but it is a tenth of the variance carried by two parties: a shape, not a second verdict.

**The Senate gets no roll-call positioning, and the gate is mechanical.** It published **14 nominal
roll calls with a tally in 18 months**, median minority 4.1%, 36% of them under the 2.5% cut every
method discards — against a settled minimum of 20 votes to scale a *single* member. The cause is
regimental: RISF art. 293, II makes the leader's vote stand for the bench in the symbolic process,
so in most Senate decisions senators cast no individual vote at all. `MIN_HOUSE_ITEMS` catches this
without naming the house.

The anchor is **Bolognesi et al. (2022)** — 515 political scientists placing 32 parties — with
**BLS-9** (Power & Zucco) as a second ruler that agrees at 0.979. A party with no published anchor
is simply left out of the correlation: interpolating a value inside the ruler that validates the
index would make it validate the interpolation.

**Party readings are pooled, not averaged.** Benches run from 1 to 90, and a simple mean publishes
one person's eccentricity as a party's position. `src/lib/indexes/pooling.ts` does empirical-Bayes
shrinkage toward the house mean with Efron & Morris *limited translation* — the shift never exceeds
one standard error of the observed mean, which bounds the injustice done to a genuinely extreme
party (the Clemente problem) to a figure that can be printed on the page. `Party.cohesion` is the
Hix–Noury–Roland Agreement Index, **not Rice** (Rice ignores abstention, so a bench abstaining in
disciplined block scores as "completely divided"), corrected for the size bias Desposato documented.

#### Governismo is published on its own, and it is not a consolation prize

`PublicAgent.governismo` — the share of roll calls where the agent voted as the
`Governo` bloc was instructed — is written **unconditionally**, outside the three gates, because it
is a count and not an inference: each roll call is a document and the orientation is published by
the house itself. So it appears on a record page even when the axes cannot, which is exactly when
the page would otherwise carry no position at all.

It is also not second best. Zucco & Lauderdale show government↔opposition is the *first* dimension
of Brazilian roll-call behaviour — that is precisely why it contaminates the economic axis, and why
on its own it is the most faithful reading a nominal vote here supports.

Three rules, and the first is not negotiable:

- **Never labelled ideology, spectrum, or left↔right.** A PSOL deputy and a NOVO deputy can both
  score 20% for opposite reasons. The page prints that caveat beside the number rather than hiding
  it, because otherwise the reader concludes "ideology" unaided — the error the falsification gate
  refuses to make in the maths, committed by hand in the UI instead.
- **No bands and no adjectives.** "Governista" is a loaded word; it would turn a count into an
  accusation.
- **The denominator always travels with it** (`governismoBase`, §4). "78%" and "78% of 312 votações"
  are different claims. Below `MIN_GOVERNISMO_OPPORTUNITIES` (10) there is no reading.

Party-level governismo does not exist yet — the column is on the agent only. Aggregating it is the
obvious next step and needs the same care `pooling.ts` already applies to the axes.

> **The five-band verdict is still NOT displayed.** The gates decide whether the *axes* may be
> published; `bandGate` additionally refuses a band whose 95% interval straddles a cut point, since
> each band is 40 points wide and a label decided by noise is worse than none. `PositionBadge` and
> `SpectrumBar` remain unmounted. What the record pages show is `PositioningPlate`: the two axis
> readings with the raw count of classified bills, the margin, and the single most influential bill
> when one alone moves the number — the Voteview convention that the fit statistic travels with the
> estimate.

### 3.3 Performance política (quality index)

Alignment asks whether an agent agrees **with you**. This asks whether they are **doing the job** —
a reading that owes nothing to who anyone agrees with. A parliamentarian who never turns up,
proposes nothing and spends the whole quota can still be 100% aligned with someone who thinks as
they do; that is the gap this closes.

Built to the OECD/JRC *Handbook on Constructing Composite Indicators* and the JRC 10-Step Pocket
Guide, because the number is published against a named person and has to survive being argued with.
`src/lib/indexes/quality.ts` is the whole of the maths and is pure — no database, no cache, no clock.

**Three pillars, a third each**, all from the houses' own published record:

| Pillar | Source | Normalisation |
|---|---|---|
| Assiduidade | `RollCall`/`RollCallVote` ÷ sittings held while in the seat | goalposts 0,50 → 1,00 |
| Relatorias e proposições | `idDeputadoAutor` / `codigoParlamentarAutor` (PL/PEC/PLP/PDL only) + `Theme.rapporteurId` / `processo/relatoria` | `log1p(rate/α) / log1p(target/α)` per month in office |
| Custo político | CEAP / CEAPS ÷ the published per-state ceiling | goalposts 1,10 → 0,50, reverse-coded |

Relatorias and proposições are **one** pillar, not two: they are the same thing — what the member put
through the house — and separating them punished the Câmara twice, since it publishes only a bill's
last rapporteur and relatoria alone could be measured for 75 of 594 members.

**Fixed goalposts, frozen and published — never a comparison with peers.** Two earlier versions
normalised inside a cohort (percentile, then proportion-to-the-best) and both were measured to be
unusable: proportion-to-the-best silently rewrote the weights (nominally a third each, measured
19/60/21), handed one member control of everyone's score (the cheapest mandate in the Câmara,
R$ 1.094/month and certainly a partial record, was the benchmark 593 deputies were measured against —
the median deputy scored **2 of 100** on cost), and published ±27 points of pure sampling noise in a
five-member cohort. So the index does what the HDI, the EPI and the SDG Index do. **A member's
reading changes when their own conduct changes, and at no other time.** The Handbook is explicit
about the alternative (p. 28): normalising by the group leader *"is based on extreme values which
could be unreliable outliers."*

**Production is read on a log scale** because the JRC screening rule fires: |skewness| > 2 together
with kurtosis > 3,5, and the Câmara's production rate measured **7,20 and 70,81**. Winsorising cannot
rescue it — capping the five most extreme members still leaves skew at 3,6. `log1p(x/α)` rather than
`log(x+1)`: exactly 0 at x = 0, and α is a published rate with units rather than an arbitrary
constant. The consequence is deliberate and stated on the page: the 400th bill counts for less than
the first.

**Filing saturates before the pillar does.** Filing a bill costs a signature; carrying one through a
house, or being handed a relatoria, does not — so `authored` is capped at `filingCapRate(house)`,
derived from that house's own goalposts so that **filings alone reach exactly 80 and stop**, in both
houses, despite their different α/target ratios. Outcome (`advanced`) and relatoria are uncapped and
are added on top. The rule is one sentence and checkable on the page: *protocolar projetos leva um
parlamentar até "acima da média", nunca até o topo.* The idea is the Ranking dos Políticos' — their
production bonus saturates at six approved items — applied to a continuous scale so ordering above the
cap survives.

**Cost is a utilisation rate, not reais.** The quota ceiling is published per state and per house and
varies by a factor of 2,4 (`src/lib/domain/quota-ceilings.ts`), because it pays the flights home;
ranking reais ranks geography. Dividing by it is bounded, comparable across states *and* houses, and
needs no cohort at all. Two things about that table are load-bearing and must not be quietly
"improved":

- **The Câmara half is verified twice over.** Every value is exactly ×1,13750 the 2023 table (Ato da
  Mesa 244/2026), and all 27 match the Ranking dos Políticos' independently-published table.
- **The Senate half is what the Senate publishes, and it is from 2017.** Re-verified against the live
  PDF on 2026-08-23. The Ranking dos Políticos publishes a 2026 Senate table 19–96% higher, credited
  to "Senado Federal"; it is **not** a Senate table — its 27 values are reproduced to the centavo by
  `max(the 2017 table × 1,192477, CEAP × 0,879121)`, with 23 of 27 states on the second branch at a
  ratio constant to eight decimal places. It is a reconstruction presented as a source and is
  therefore **not adopted**: publishing somebody's model of the ceiling as the ceiling is the same
  error as publishing an estimate as official. The consequence — senators read against a floor that
  is probably low — is stated rather than hidden, `npm run requality` prints median utilisation per
  house so its size is visible, and `check:sources` hashes the PDF so the day the Senate republishes
  is the day we find out.

**Custo político is the parliamentary quota and nothing else.** Office upkeep, travel, fuel, food,
publicity, security. Emendas parlamentares are excluded **by design**: a deputy who secured a billion
reais for schools in their state is not an expensive deputy, and an index that conflated the two
would say the opposite of the truth. The pillar is never labelled "verba pública" or "economia".

**The pillars combine by weighted GEOMETRIC mean**, `exp(Σ wᵢ·ln xᵢ / Σ wᵢ)`. An arithmetic mean is
fully compensatory: it scored a member who never attends, one who never legislates and one who spends
the whole quota at an identical, respectable 63. Handbook §6.10 shows additive aggregation requires
preference independence, which these pillars fail — the value of one more bill is not independent of
whether the member turns up. The HDI changed for exactly this reason in 2010. A `PILLAR_FLOOR` of 1
exists because a geometric mean dies at zero, which would collapse every distinct way of failing into
the same "0".

**A pillar that cannot be measured is `null`, and its weight is redistributed.** Below `MIN_COVERAGE`
(half the total weight) the whole score is `null` rather than a number built on half a picture — the
§3.2 discipline again. `PublicAgent.qualityScore` is therefore nullable with no default: an agent we
could not measure must show **no reading**, because a zero reads as an accusation. Attendance
additionally refuses to score when official leave covers more than 40% of the window (what stops
"attended the only sitting they could have attended"), and cost refuses when `documents === 0` —
a month the house has not published yet is indistinguishable from R$ 0 spent, and reading that as
exemplary frugality is exactly backwards. (The Ranking dos Políticos' manual scores that case **10 of
10**, which is the clearest single defect in it.)

**The methodology is versioned, and the version is enforced.** Fixed goalposts stop a score moving
when *someone else* changes; `QUALITY_METHODOLOGY` stops it moving silently when *we* do. Every
recompute stamps `version` into `qualityPillars`, the info sheet prints it, and
`methodologyFingerprint()` — a hash of the goalposts, the weights, the pillar set and the tuning
constants — is asserted against the recorded value by `npm run check:sources`. **Changing any of
those without bumping `version`, `changedAt` and `fingerprint` fails the check.** This is the half of
the Ranking dos Políticos' discipline worth copying (they freeze each year's notes under the rules in
force at publication); we have no annual cycle to freeze, so we date the change instead.

**Expanding the pillar set** is one entry in the registry in `src/lib/indexes/quality.ts` plus its raw
columns on `AgentMetrics`. Two conditions on any new factor: **both houses publish it or neither is
scored on it**, and it is **`null` when unknown, never zero**. (Plenary presence is the standing
example of a factor that fails the first test — only the Câmara publishes it.)

**Presiding is attendance, not absence.** Both houses bar whoever is in the chair from voting in an
open ballot and mark them with a code of their own (Câmara `"Artigo 17"`, Senado
`"Presidente (art. 51 RISF)"`). `mapVote` drops those, correctly — they are not a position — but
reading the missing vote as a missing member is the opposite of what happened. Measured on live data
before `RollCall.presidingAgentId` existed, the index put the President of the Senate in the **1st
percentile of attendance and 8th out of 100 overall**: the worst senator in Brazil, for having
presided 39 of 46 sittings. A sitting an agent presided is taken out of their denominator, exactly as
a day of official leave is. (The Ranking dos Políticos solves the same problem by dropping the two
house presidents from its ranking entirely; keeping them rankable is better, and finding the bug is
what proved the problem real.)

Attendance comes from a ledger of its own, `RollCall`/`RollCallVote`, **not** from `Vote`. `Vote` is
unique on `(agentId, themeId)` and is rewritten when a later roll call touches the same bill, because
it holds the agent's *standing position* — which is what the alignment index needs. Two roll calls on
one bill collapse into one row there, so it can never answer "how many sittings did they attend".
This is written down because it is exactly the kind of thing a future reader would try to "simplify"
back into `Vote`.

**The raw figure is always printed beside the bar** ("92% · 312 de 340 votações"). The goalpost drives
the index; the plain number is what a citizen reads and what lets the score be defended document by
document.

Retuning needs no re-import: every input is a stored column, so `npm run requality [-- --dry]` is the
twin of `npm run reprioritize`. Bands (Muito acima / Acima / Na média / Abaixo da média) are
comparative, never evaluative, and their cut points are **provisional** — see §11.

> The data architecture is **not rigid**. Propose improvements where pertinent — especially around
> how themes map to positioning dimensions.

---

## 4. Data Model

> Database, tables, columns, and **all code must be in English**. The schema below is a starting
> point; suggest improvements where they help clarity, security, or scale.

**Preferred database: PostgreSQL.**

### Entities

- **PublicAgent** — deputies, councillors, governors, senators, etc.
  Fields: first name, last name, email, phone, image, description, CPF, type (deputy, councillor,
  governor, senator, …), state, municipality, plus `externalUrl`, `legislature` and `inOffice`
  (false once the mandate ends — the record and its votes are kept, see §8). Belongs to a **Party**.
  Agent CPF is **not** imported even where a source publishes it: the source's own id already
  establishes identity, so collecting it would add risk for nothing.
  Carries the computed indexes: `qualityScore` (§3.3) and, from §3.2, `positionEconomic`,
  `positionSocial`, `positionDetail` (the per-axis reading — items, margin, most influential bill,
  methodology stamp), `positionComputedAt`, `governismo` and `governismoBase` (its denominator —
  the reading is not publishable without it). All nullable with no default: "not
  measured" must stay distinguishable from "measured at zero", which on the economic axis is the
  coordinate of a perfect centrist. `governismo` is written even for a house the §3.2 gates blocked
  — it is a count, not an inference.
- **Party** — first/display name, description, logo, official leader/website/head count, plus
  denormalized counts (number of deputies, governors, councillors, etc., kept for fast dashboards).
  A party exists **once** across houses, keyed by acronym. Carries the same positioning columns as
  **PublicAgent** — pooled from its members, never averaged (§3.2) — plus `cohesion`.
- **Theme** — political amendments, laws, etc. Fields: name, summary. Has many **Articles**.
  Imported themes additionally carry their official record: `identifier` (e.g. "PL 3085/2026"),
  `house`, `externalUrl`, `situation`, `urgency` (procedural regime), `priority` (0–100, see §8),
  `classifications`, `keywords`, `inProgress`, `presentedAt`, `lastActionAt`.
- **Article** — always connected to a Theme. Fields: link to original article, link to download the
  original article, foreign key to Theme.
- **Vote** — a vote on a Theme. Value: abstention / yes / no. Cast by a **User** or a **PublicAgent**.
  Unique: **one vote per CPF per Theme**.
- **User** — citizen / voter. Fields: first name, last name, CPF (encrypted, see §5), birth date
  (encrypted — needed by the vote challenge), birth **year** in clear (age gate + anonymized
  demographics), and the verification trail `cpfVerifiedAt` / `cpfVerificationSource`.
- **AgentFollow** — a citizen's declaration that a **PublicAgent** represents them (§3.1.1).
  Fields: user, agent, and the agent's `type` copied at follow time so `UNIQUE(user, type)` can
  enforce "one per office" in the database. No `kid`: like **Vote**, it is never addressed from
  outside — it is reached through the session plus the agent's `kid`.
- **SocialAccount** — a social identity (`provider` + the provider's `sub`) bound to a User. Many
  per User: linking Google and Apple to one CPF is one citizen, not two. Written only once a CPF
  has been confirmed. `subject` is internal, exactly like `externalRef` (§5).
- **Administrator** — backend login. Fields: first name, last name, email, mobile, password (hashed),
  role, image.
- **RollCall** / **RollCallVote** — the attendance ledger: one row per nominal sitting, one per
  agent who took part. Separate from **Vote** on purpose, and the reason is load-bearing: `Vote` is
  unique on `(agentId, themeId)` and holds the *standing position* the alignment index reads, so two
  roll calls on one bill collapse into a single row there. Written by the existing vote jobs from
  responses they already download — no extra request. Internal only, no `kid`.
  Also holds `governmentPosition` / `oppositionPosition`: how the `Governo` and `Oposição` blocs were
  instructed to vote on that sitting. It is what `governismo` is counted from and what the §3.2
  contamination discount subtracts item by item — the coalition signal lives in the votes, not in the
  bills' text, so there is nowhere else to read it from.
- **AgentService** — a stretch of a mandate, `EXERCISE` or `LEAVE`, as the house published it. The
  attendance denominator subtracts official leave: a deputy licensed to serve as a state secretary is
  not absent from votes held while they were legitimately away.
- **AgentMetrics** — raw per-year counts behind the quality index (roll calls, bills, quota), one row
  per agent per calendar year. Counts rather than scores, which is what makes `npm run requality`
  possible and what lets any published figure be defended document by document.

### Themes & Articles ingestion

- A Theme can be created with **multiple Articles**.
- Ingestion can be **manual** (admin upload) **or automated** via the official-source integration
  (§8) — both paths converge on the same model.
- When an Article is ingested (manually or imported), it must pass through an **AI step** that reads
  the article and **incrementally enriches the Theme's summary**.

**The AI pass has a bounded population, and the bound is load-bearing.** It used to accept every
ACTIVE theme without a summary, which made its queue the whole imported corpus — a queue that does
not converge. The broad `*:themes` sweep imports everything that moved in the window (~12.300 Câmara
bills in six months, ~470 a week before the Senado) against a drain of `DEFAULT_BATCH` = 300 a week.
Observed live: the backlog grew by a thousand during a single chain run. "Eventually we summarize
everything" was never true, and the weekly budget cap hid it — a cap bounds the *spend*, not the
*shortfall*.

`AI_ELIGIBLE` in `src/lib/integration/summaries.ts` bounds it to what can still matter:

- **already voted by an agent** — these feed the alignment and positioning indexes, and a bill only
  enters those with a roll-call vote. Deliberately **not** gated on priority: `priority` is capped at
  10 once a bill is concluded (§8), so a floor would exclude precisely the finished, voted bills the
  indexes are built from;
- **still in progress, at or above `MIN_AI_PRIORITY` (30)** — not voted yet but can be, and the
  bottom of the "Tramitação normal" band is the same line the themes list already draws.

**Voted bills are processed first, in a phase of their own** — and that is a separate fix from the
filter, not the same one. Ordering by `priority` buried exactly the bills the indexes need:
`priority` is capped at 10 once a bill is concluded (§8) and `inProgress` is false, so a
voted-and-finished bill sorted behind every bill still in committee. Admitting it to the queue was
necessary and not sufficient — the filter let it in and the ordering entombed it. Measured live:
`metrics:positioning` refused to publish with *"CAMARA: só 3 votações classificadas e divididas
(mínimo 20); SENADO: só 0"*, starved of classifications while every batch went to bills that had
never been voted. The job therefore fills its batch from `AI_VOTED` first and tops up from
`AI_UPCOMING`, deduplicated (the clauses overlap — a bill voted in committee is in both). Not
`orderBy: { votes: { _count: "desc" } }`, which counts citizen votes too: that works only while the
platform has none, and would rot silently as it gains them.

The excluded tail — filed, moved once, never voted — keeps its official title and ementa. The
plain-language rewrite is an enrichment, never the record, so those pages degrade to the source's
own words rather than to nothing. The predicate is exported and imported by `npm run estimate:ai`
rather than restated, for the same reason `Theme.searchText` has one definition: two copies drift,
and here the drift would be invisible — the forecast would quote a number for a queue that no
longer exists.

### Search

The public lists (`/agentes`, `/temas`) each carry a search box, and it lives **inside the filter
block** rather than above it: it is one `<form method="get">` with the selects, every control ANDs
into the same query, and the masthead plate counts what the whole form matched. There is no second
search page and no separate search state.

**What each one searches is deliberately narrow.** Agents match on the agent's own name **and** their
party's name/acronym. Themes match on the official title, the plain-language title the AI wrote
(`plainTitle`), and the official code (`identifier`) — **and nothing else**. The summary is excluded
on purpose: it is a paragraph of official prose in which half the vocabulary of Brazilian legislation
appears at least once, so searching it returned a page of unrelated bills for almost any word and
made the box feel broken. A title and a code are what a citizen actually has in hand.

**One folded column per table does the matching.** `Theme.searchText`, `PublicAgent.searchText` and
`Party.searchText` hold the searchable fields concatenated, lowercased and stripped of accents, with
a GIN **trigram** index over each — which is what turns the resulting `LIKE '%…%'` into an index scan
instead of a table scan. Two properties are load-bearing:

- **They are Postgres `GENERATED … STORED` columns, never written from application code.** `name`
  comes from the importers, `plainTitle` from the AI pass, both from the admin CRUD — three write
  paths for one derived value, which is exactly the shape that drifts. The definition lives in
  `docs/migrations/0010_search.sql` and nowhere else. `src/lib/domain/search.ts` holds the JavaScript
  mirror of the same folding, applied to the *query*; **the two are changed together** or matching
  silently breaks.
- **Query words are ANDed, not ORed.** Typing more has to narrow the list: `joao pt` means "someone
  called João, in the PT", not "every João plus the whole PT bench".

The party is reached through the relation rather than copied into the agent's column (a generated
column may only read its own row), which is also what keeps a party rename from needing a cascade.
Accents are folded with `translate()` and an explicit Portuguese character map rather than the
`unaccent` extension, because `unaccent` is not `IMMUTABLE` and a generated column cannot call it.

### The list continues

`/temas` does not stop at the first sixty bills. One page renders **on the server** — in the HTML,
for the reader without JavaScript, for the crawler and for the first paint — and
`ThemeFeed` appends the next ones through a server action as the citizen scrolls. What ships in the
markup is an ordinary `<a href="?p=2">`: the link is the mechanism, and the observer only takes its
place once it has hydrated and can honour it. A page that fails to load says so and offers the link
again, because a sentinel that quietly stops looks exactly like the end of the list.

Paging is by **offset**, not by cursor. The failure mode of an offset — a row inserted mid-scroll
shifts the window by one — is a repeated entry in a list of hundreds, against a cursor that would
have to encode the tie-break of three different orderings; and `THEME_MAX_PAGES` bounds it, because
an unbounded `skip` is an unbounded query. The engagement ordering's logarithmic re-sort stays
**within** a page: a global one would have to read every match to place the first row.

The query lives once, in `src/lib/domain/theme-list.ts`, shared by the page and the action. Two
translations of the same filters would be two chances for the appended rows to answer a different
question than the ones already on screen — and the masthead plate, which counts the whole match,
would then describe neither.

---

## 5. Security & Privacy (non-negotiable)

### Minimal data

- The only personal data we keep for a citizen, in clear, is **first name and last name**.
- In case of a leak, **nothing beyond first/last name** must be readable.

### CPF handling

- **CPF must be stored encrypted** (reversible encryption with a managed key — never plaintext).
- Add a separate column holding **only the first six digits of the CPF in clear** (the partial CPF),
  for low-sensitivity display/analytics. (Six digits alone do not identify a person.)
- **One vote per CPF per theme** must be enforced **without** comparing plaintext CPFs: store a
  **deterministic keyed hash (HMAC) of the CPF** and put the uniqueness constraint on
  `(cpf_hash, theme_id)`. The HMAC enables dedup without revealing or decrypting the CPF.

  Suggested columns on `User` / `Vote`:
  - `cpf_encrypted` — reversible, for the rare authorized retrieval.
  - `cpf_hash` — deterministic HMAC, for uniqueness/dedup (`UNIQUE(cpf_hash, theme_id)` on votes).
  - `cpf_prefix` — first six digits, clear.

### Political data (votes and follows)

A vote on a theme and a declared representative (`AgentFollow`) are both *opinião política* —
sensitive data under LGPD art. 5º, II — and both are stored in clear against the citizen's row,
because the alignment index cannot be computed otherwise. That is a deliberate, bounded exception
and not a softening of the promise above: no CPF, no birth date and no e-mail reach those tables,
so a leak still exposes nothing beyond the name. Consent is taken **specifically** (art. 11, I):
its own box at sign-up, and again in the confirmation sheet the follow action opens. Who follows
whom is never published — only the totals.

### Authentication

Citizen sign-in is **two steps**, because neither one is sufficient alone:

1. **Social provider** — Apple, Google or Meta (OIDC authorization-code + PKCE). Proves the person
   controls that account; says nothing about who they are in Brazil. One client
   (`src/lib/auth/social/oidc.ts`) driven by a registry (`src/lib/auth/social/providers.ts`).
2. **Official CPF registry** — the citizen types **first name, last name, CPF and birth date**, and
   `src/lib/identity/validation.ts` confirms them together against the Receita Federal.

   The name is checked against the **registry**, never against the provider's display name: that
   one is self-declared and editable, so comparing with it would be theatre — a mismatch proves
   nothing (nicknames) and a match proves nothing (an attacker edits the field). What the check
   buys is that the citizen must *know* the name behind the CPF.

   It asks for the first name and the **last** surname, and means it. Accepting any surname was
   the first cut and it was wrong: the middle surname is exactly the one that circulates socially
   — someone is publicly `Thiago Prado` while the record ends in `Cavalcanti` — so against the
   realistic attacker (a relative, a colleague) the final surname is the part that lives on the
   document rather than in conversation. Forgiving only where names are *written* differently:
   accents, case, and generational suffixes (`SILVA JÚNIOR` takes either). `nameMatchesRegistry`
   in `src/lib/domain/names.ts`.

Voting adds a third check, **once per session** (`src/lib/auth/vote-challenge.ts`): before the
first vote, the citizen answers with three digits of their CPF, given by position, plus the day,
month or year of their birth. The combination is drawn fresh each time. It is not a second
password — it is what stops an unlocked phone or a forgotten session on a shared computer from
voting in someone's name. The answer is recorded as a claim on the session token, so it dies with
the session by construction. Three attempts per challenge, three challenges per session, then a
fresh login.

Identity reaches the database only through `signInCitizen`
(`src/lib/auth/citizen-login.ts`), which owns the CPF privacy rules, and identity is always read
from the **signature-verified** id_token, never the query string.

- **Users cannot create passwords.** No credential sign-up, nothing to steal.
- **gov.br is not available and its code was removed.** Login Único would be the better door — it
  hands over an already-verified CPF — but it is granted only to public institutions on `.gov.br`
  domains. It was deleted rather than left dormant: its mock callback minted a session from a form
  and defaulted to `mock`, which is an authentication bypass waiting on a misconfigured deploy.
- **Be honest about the assurance this buys.** It establishes that the CPF is real and regular —
  which is what stops votes cast under generated numbers. It does **not** establish possession:
  someone who knows a relative's CPF and birthday passes. This is the accepted starting position
  until a stronger binding exists; `User.cpfVerificationSource` records which registry answered, so
  accounts created under a weak (or `mock`) rule stay identifiable afterwards.
- **A Pix of R$0,01** would anchor identity to a bank account (the bank returns a verified name and
  a masked CPF). Evaluated and deferred — sending someone into their banking app mid-signup
  collapses conversion. It remains the most likely next step.
- **No e-mail is stored** even though every provider offers one: it would put a second identifier
  beyond the name into a leak.
- **The birth date is stored encrypted**, because the challenge asks for the day or the month; a
  challenge that could only ask for the year would repeat the same two digits forever. Only the
  **year** is readable in the database.
- **Nothing is written before the CPF confirms.** The social identity waits in a signed, httpOnly
  cookie (`src/lib/auth/pending.ts`), which also carries an attempt counter — each attempt is a paid
  registry lookup, so the cap guards the budget as much as it guards against brute force.
- **Bank identity has no direct path.** Brazilian banks expose no public identity API; each would
  need a bilateral commercial agreement. A future bank IdP plugs in as another `ProviderConfig`.
- A development-only mock IdP (`/dev-idp`) stands in for every provider; it 404s and the callback
  refuses its form whenever `SOCIAL_MODE != mock`, so a half-finished production switch fails closed.
- **Administrators** authenticate with email + hashed password (separate from citizen auth).

### Internal IDs must never leave the system (global rule)

- **Never** return internal `id` / `*Id` / `*_id` in any API response, external integration,
  notification, email, webhook, or third-party log — for the main entity **and** any nested relation.
- External-facing identifiers:
  - `kid` — short id, for small/simple resources.
  - `tsuuid` — timestamped UUID, for larger/complex resources; prefer `tsuuid` when an external
    integration needs an idempotency key.
- When mapping entity → response DTO, explicitly omit `id` / `*Id` / `*_id`, recursively for relations.

### Database operations (global rule)

- **Never** execute SQL or run migrations against any database from this environment.
- Deliver the change instead as a **Prisma migration** under `prisma/migrations/<timestamp>_name/
  migration.sql`, with a readable mirror in `docs/migrations/`. The deploy workflow runs
  `prisma migrate deploy` before the new image serves traffic, so a plain `git push` applies it —
  **that is the only update procedure**, and it holds for data fixes (backfills, corrections) just
  as much as for DDL. Write them idempotent, so a re-run is a no-op.
- A statement that cannot be a migration goes in the plan for the user to run. Never leave a change
  that requires them to open a database console as the normal path.

---

## 6. Backend Methods

Each method **must have a description** (doc comment). Required operations:

- Create, edit, **block**, and delete **Public agents**.
- Create, edit, **block**, and delete **Parties**.
- Create, edit, **block**, and delete **Themes**.
- Create, edit, **block**, and delete **Administrators**.
- **Vote**.

> "Block" is a soft state distinct from delete (e.g. `status` / `blocked_at`), so an entity can be
> hidden without losing history (important for vote integrity).

---

## 7. Architecture & Stack

> The user asked Votto to choose the best stack for SSR, simplicity, and a Brazil-located host with
> an easy path to scale. Decisions below — revisit as needed.

- **Framework:** **Next.js (App Router)** — server-side rendering, one codebase for the public
  frontend and the admin backend, mature ecosystem.
- **Language:** TypeScript everywhere.
- **Database:** **PostgreSQL**.
- **ORM:** Prisma (clear schema, typed queries, managed migrations). All migrations handed to the
  user for manual execution per the global DB rule.
- **Cache / index acceleration:** Redis (alignment-index caching, hot themes).
- **AI step:** Claude (latest model) for incremental theme-summary enrichment from uploaded articles.
- **Auth:** one OIDC client serving Apple / Google / Meta (citizens), followed by CPF
  confirmation against the official registry; credential + session auth for administrators.
- **Sync worker:** a separate long-running container running the weekly synchronization chain
  (`scripts/worker.ts`) plus a one-off historical loader (`scripts/backfill.ts`), kept out of the
  web process so multi-minute imports never compete with request handling.

  **Exactly one replica, and that is now load-bearing.** A redeploy *does* interrupt a running
  import — it recreates the container — and the chain's recovery from that is
  `releaseChainClaimOnBoot()`, which drops an abandoned chain claim on the reasoning that *a worker
  booting is proof the worker holding that claim is gone*. True of one replica; false of two, where
  replica B's boot would release replica A's live claim and leave two chains running side by side.
  That failure would not announce itself — it does the work twice and only the duplicated request
  volume against the houses would ever show it, which is worse than the twelve-hour stall the
  release exists to prevent. So scaling the worker past one replica is not a compose change: it
  requires replacing that proof with a heartbeat on the chain's row. The cost is written down in the
  function's docblock.

### Hosting (Brazil-located, simple, scalable)

- **Recommendation:** start on a host with a **Brazil region** for low latency, simple ops, and an
  easy scale-up path. Candidates: **Fly.io (`gru` — São Paulo)** for MVP simplicity, or
  **AWS `sa-east-1` (São Paulo)** when more control is needed (App Runner/ECS + RDS Postgres).
- Keep infrastructure portable (containerized, env-driven config) so moving to a higher-capacity
  Brazilian infra is straightforward.

### Running any `npm run` script against real data — **always through Docker**

**There is no Node toolchain on the box.** Production is a single Lightsail instance running the
compose stack, and the only place the sources, `tsx`, the Prisma CLI and a `DATABASE_URL` exist
together is the `migrate` service (build target `builder`, profile `tools`). So a bare
`npm run <script>` on the server does not run — it fails, and it fails for a reason that has
nothing to do with the script.

Every script in `package.json` that touches the database or the houses' APIs — `sync`, `backfill`,
`reposition`, `requality`, `reprioritize`, `reauthor`, `summarize`, `estimate:ai`,
`unbench:summaries`, `db:seed:admin` — runs like this:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run <script> [-- <flags>]
```

The `-- ` before the flags is npm's, and it survives the container: `npm run reposition -- --dry`
becomes `tsx scripts/reposition.ts --dry`. `docker compose run` starts a `tools`-profile service
without `--profile`, and `--rm` throws the container away afterwards.

So the retune commands quoted throughout this file (§3.2, §3.3, §8, §11) read, in production:

```bash
# measure the positioning gates without writing anything
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run reposition -- --dry

# same for the quality index
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run requality -- --dry

# run the sync chain now (skips what is still fresh)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run sync
```

The bare `npm run …` form in the sections below is the **local development** form and nothing
else. When a command is being suggested to run against production data, wrap it. Full command set
and the deploy procedure: [`docs/deploy.md`](docs/deploy.md).

Two things this does **not** change: migrations still reach the database only through
`prisma migrate deploy` on a `git push` (§5), and nobody opens a database console as the normal
path.

---

## 8. Integration (official sources)

Themes, articles, and **public-agent votes** must be importable from — and continuously monitored
against — official Brazilian sources, instead of relying only on manual upload. Public open-data
APIs exist for this and require no authentication.

### Sources

- **Câmara dos Deputados — Dados Abertos API v2** — `https://dadosabertos.camara.leg.br/api/v2`
  (REST, JSON, no auth, refreshed daily). Collections in use:
  - `proposicoes` (+ `/{id}`, `/{id}/temas`) → **Theme**, with urgency regime, situation and the
    official subject classification.
  - `votacoes` (+ `/{id}`, `/{id}/votos`) → **public-agent Votes**.
  - `deputados`, `partidos` (+ `/{id}`) → **PublicAgent** / **Party**.
- **Senado Federal — Dados Abertos** — `https://legis.senado.leg.br/dadosabertos` (XML by default;
  JSON via `Accept: application/json`). Resources in use:
  - `processo` (+ `/{id}`) → **Theme**, with situation and classification hierarchy.
  - `votacao` → **public-agent Votes** (nominal roll calls, votes embedded).
  - `senador/lista/atual`, `composicao/lista/partidos` → **PublicAgent** / **Party**.
- ⚠️ The legacy `materia/*` family is **deprecated** (2025-03-18; shutdown 2026-02-01) in favour of
  `/processo`. Do not build on it.
- Keep the source list **extensible** for other official bodies (state assemblies, municipal
  chambers, TSE, etc.) behind a common importer interface.

### Source quirks that constrain the design

Verified against the live APIs; `npm run check:sources` re-checks them.

- Câmara `votacoes` list returns `uriProposicaoObjeto: null` almost always — resolve the voted bill
  from the detail endpoint's `proposicoesAfetadas`.
- Only the **Plenário** (`idOrgao=180`) has nominal votes; committee decisions return `votos: []`
  (sometimes 404).
- Câmara `votacoes` rejects date ranges wider than **3 months** — chunk any look-back.
- Senado `processo?numdias=` is capped at **30 days**.
- Senado `votacao?dataInicio=&dataFim=` is capped at **one year** — 365 days returns 200, 545 and
  above return 400. Undocumented until it cost an import: `tryFetch` turns every failure into `null`
  and `syncVotes` returned zero counts for it, so a refused four-year request reached the panel as
  "0 registros atualizados · OK". The window is now chunked and a refused chunk throws.
- A party must exist **once** across both houses: the Senado importer reuses a party already
  imported by the Câmara when the acronym matches.
- Câmara `deputados/{id}/despesas` returns `[]` **without `idLegislatura`** — with HTTP 200, which is
  indistinguishable from "spent nothing". With `idLegislatura` but no `ano`, only the legislature's
  first year comes back. Both parameters are required, so the sweep is over `(legislatura × ano)`.
- The Senado's expenses live on a **different host** (`adm.senado.gov.br/adm-dadosabertos`), joined
  on `codSenador` = our `externalRef`. A different host is not a different source: `ImportSource`
  records whose data it is.
- The Câmara publishes only a bill's **last** rapporteur (`statusProposicao.uriUltimoRelator`), so
  deputy relatoria counts are a floor. The Senado publishes the full history. Ranking inside a house
  is what keeps that asymmetry from handing the Senado the pillar.
- **The Senado publishes bloc orientation, but not where you would look for it.** The Câmara exposes
  it per roll call at `/votacoes/{id}/orientacoes` — one request each. The Senado's `/votacao` payload
  has no orientation field at all, which is why it was believed to have none; the data lives in a
  separate service, `/plenario/votacao/orientacaoBancada/{AAAAMMDD}/{AAAAMMDD}`, which returns a whole
  date range in one call and carries the same four pseudo-blocs (`Governo`, `Oposição`, `Minoria`,
  `Maioria`). Dates must be `AAAAMMDD`; the dashed form 404s. The join key is `sequencialVotacao`,
  already present in the `/votacao` rows the importer reads — so this costs **one request per window,
  not one per roll call**, cheaper than the Câmara's own path. There is no window cap here, unlike
  `/votacao` (one year) and `processo?numdias=` (30 days).

  The honest limitation is **coverage, not existence**: measured across 997 nominal votes from 2019
  to 2026, about 48% carry any orientation and **37% carry a `Governo` bloc**, against ~100% of the
  Câmara's nominal votes. So senators' `governismo` is measurable on roughly a third of the record.
  It must therefore be published with its own denominator and `null` below the floor (§3.2) — never
  compared like-for-like with a deputy's, whose denominator is the whole ledger. `Oposição` only
  appears from 2021 on, so the government↔opposition discount can lean only on `Governo` before that.

  **And the scarcity is regimental, not a gap in the API.** Neiva (*Dados* 54(2), 2011) counts, for
  1995–2006, **16,717 leader vote-indications across 1,642 Câmara roll calls (mean 10.2) against
  2,544 across 1,016 in the Senado (mean 2.5)** — with many where not even the largest parties
  oriented. The Senate's Colégio de Líderes is not formalised, and with 81 members, in his phrase,
  *"basta um gesto ou um simples 'olhar'."* No amount of importing will raise this to the Câmara's
  level, which is precisely why `governismoBase` travels with the number.

  Imported by `syncVotes` in `src/lib/integration/senado.ts`, one request per date window alongside
  the votes. `mapOrientation`/`foldBloc` live in `importer.ts` and are shared by both houses — the
  "Liberado means `null`" rule decides the governismo denominator, and two copies of it would be two
  chances for the houses to count different things under one name. `check:sources` asserts the
  endpoint, the `Governo` bloc and **the join itself**, because a failed join is indistinguishable
  from a house that did not orient.
- Both houses mark the **presiding officer** with a vote code that is not a vote — Câmara
  `"Artigo 17"`, Senado `"Presidente (art. 51 RISF)"`, one per sitting in both. It means "present but
  barred from voting", so any attendance measure must exclude that sitting rather than count it as a
  miss (`RollCall.presidingAgentId`).
- `"Sessão Não Deliberativa Solene"` contains the substring `"Deliberativa"`. Any filter for real
  sittings must exclude the negation explicitly (`isDeliberativeSession` in `camara.ts`) — a plain
  `includes` let 59 solemn sessions through against 36 real ones over a 120-day window.

### Mapping to the data model

- Official bill/amendment → **Theme** (name + summary). Attached official documents/links →
  **Article** (original link + download link); each imported Article still passes through the **AI
  enrichment step** (§4) that incrementally updates the Theme summary.
- Official roll-call vote → **Vote** cast by a **PublicAgent** (yes / no / abstention), mapped to our
  `+1 / -1 / 0` model.
- Official legislators/parties → **PublicAgent** / **Party** records.
- **Party logos are curated, not imported.** The Câmara's `{SIGLA}.gif` is the acronym in plain
  type for most parties and the Senado publishes none, so `src/lib/integration/party-logos.ts`
  maps acronym → SVG in `public/logos/partidos/` and `upsertParty` applies it, which is what keeps
  the marks correct across re-imports. Those SVGs are **built**, not collected: `npm run
  assets:party-logos` crops the party name off each official lockup and normalizes every mark onto
  one 2.5:1 canvas at constant area, so a 1:1 mark and a 7:1 mark carry the same optical weight —
  UI slots must be cut to that ratio. Pipeline and provenance:
  [`docs/logos-partidos.md`](docs/logos-partidos.md).

### Urgency & classification

Neither house publishes a ready-made urgency score, but both publish its inputs. `Theme.priority`
(0–100, `src/lib/domain/priority.ts`) folds procedural regime, current situation and recency into a
single rank that SQL can order by; concluded bills are capped at 10. Two calibration constraints,
found against the first real load: the base leaves headroom (35 of 42 bills on the Câmara floor carry
an "Urgência" regime, so a high base marks everything urgent and the badge stops informing), and the
houses must be comparable (the Senado publishes no regime, so its situation vocabulary supplies the
base instead — otherwise no Senado bill could ever out-rank a Câmara one). Retuning needs no
re-import: `npm run reprioritize` recomputes from stored columns. Bands: Urgente (≥80),
Prioritário (≥60), Tramitação normal (≥30), Baixa prioridade.

`Theme.classifications` stores the official subject taxonomy verbatim (Câmara `codTema`/`relevancia`,
Senado `classificacoes` with hierarchy). The source's numeric code stays internal — the DTO exposes
label, hierarchy and the "main subject" flag only.

### Authorship, and why it can go missing

A theme's accountable face — the proposing parliamentarian, else the órgão that authored it, else
the rapporteur — is resolved from a **second** request per bill (Câmara `/proposicoes/{id}/autores`;
Senado `autoriaIniciativa` in the detail, plus `/processo/relatoria`). That is the whole of the
fragility: `upsertTheme` maps a null author to `undefined` so a lookup that failed never wipes an
author we already had — the right call — but the cost is that a bill first written **without** one
keeps the hole, and the weekly sweeps only revisit bills that moved in the last 30–90 days. A bill
parked at "Pronta para Pauta" is exactly the kind the themes list ranks highest and exactly the kind
the sweeps never come back to, which is how the order paper ended up with no faces on it.

Three things follow, and all three are load-bearing:

- **`agentIdByRef` is a required parameter** of both houses' `upsertBillTheme`. While it was
  optional, the authorship branch read `inProgress && agentIdByRef`, so a call site that forgot the
  map skipped author *and* rapporteur silently — the bill still written, its regime, situation and
  classification intact, only its face missing. A required parameter makes that a compile error.
- **`npm run reauthor`** repairs what is already stored: it re-resolves authorship for in-progress
  bills that have neither `proposerId` nor `proposerName`, most prioritised first, and is idempotent
  and interruptible. It is the network-bound twin of `reprioritize`/`requality` — priority and
  quality recompute from stored columns, authorship has to be asked of the houses again.
- **`check:sources` asserts `/proposicoes/{id}/autores`**, its `proponente` and its `uri`. It did
  not, and that is why the gap was silent: an empty response is indistinguishable from "this bill
  has no author".

### Sync design

- **Pull/polling** model: scheduled jobs query each source's "recently updated" endpoint, then fetch
  details only for changed items. No source pushes to us.
- **Idempotent upserts:** store each source's native identifier as an internal `source` +
  `external_ref` pair and upsert on it, so re-runs never duplicate. (These are the government's IDs,
  used only internally for dedup — they are **not** exposed externally; our public identifiers remain
  `kid` / `tsuuid` per §5.)
- **Relevance has to be derived.** Neither house ranks bills, and the Câmara's `/proposicoes` silently
  ignores `codSituacao`, so "the ones that matter" cannot be queried. The floor agenda is the closest
  proxy that exists: `*:agenda` jobs read `orgaos/180/eventos` → `eventos/{id}/pauta` (Câmara) and
  `processo?siglaSituacao=` (Senado, which does filter server-side). They overlap with the broad
  `*:themes` sweep on purpose — cheap high-signal first, exhaustive second.
- **One job per (source × domain)** — parties, agents, agenda, themes, votes — registered in
  `src/lib/integration/jobs.ts`. Jobs are independent in the sense that matters for failure: an
  agent job creates a missing party, a vote job creates a missing agent, so running them out of
  order loses detail but never correctness.

### One chain, not sixteen clocks

They are **not** independent in the sense that matters for completeness, and a weekly slot per job
encoded the ordering as a hope: every slot fired whether or not the previous one had finished. The
bill import resolves its authors against the agent roster, `camara:expenses` reads the legislatures
`camara:mandate` writes, and `metrics:quality` ranks a cohort the vote jobs supply. Nothing failed —
the record was quietly incomplete, which is worse, because it looks like data.

There is now **one command**, `src/lib/integration/pipeline.ts`, and every surface calls it: the CLI
(`npm run sync`), the worker's weekly slot and boot, `POST /api/cron/all`, and "Sincronizar tudo" on
`/admin/sincronizacao`.

- **Order is declared, not scheduled.** Each job carries `after` (ordering only — a failure upstream
  costs detail) and `needs` (the job would publish a *wrong* figure without it, so a failed
  dependency holds it back for the next run). `needs` appears twice, on the two batch indexes, and
  both times on the vote jobs — because both read the *whole cohort*, not one agent. Half a
  roll-call import does not give `metrics:quality` a thinner reading, it tells every agent they are
  in a cohort that is not theirs; and it does not give `metrics:positioning` a coarser one, it gives
  every theme the wrong weight, since an item's weight is the division it produced on the floor.
  The topological sort is **stable** — a registry already in a valid order comes out exactly as the
  file reads, and the sort only intervenes where the file is wrong.
- **A job that succeeded inside `FRESH_FOR_DAYS` (7) is skipped.** The houses publish daily, but the
  legislative week is the unit anything changes in, and re-importing an untouched window costs
  thousands of requests to write rows that are already there. This is also what makes the chain safe
  to trigger by hand.
- **Freshness alone would strand the tail of the chain**, so a job whose dependency finished *after*
  its own last success is never fresh. If the vote job runs today, the index that ran yesterday is
  stale despite being one day old — that clause is what carries an import down the whole chain in a
  single pass instead of one job per week.
- **Naming one job bypasses the window** (`npm run sync camara:votes`, the per-job button, the
  per-job HTTP route): naming it is an explicit instruction. `--force` / "Refazer tudo" /
  `--max-age 0` drop the window for the whole chain. `npm run sync -- --dry` prints the plan.
- **Worker:** a dedicated container (`scripts/worker.ts`) runs the chain on `PIPELINE_SCHEDULE`
  (Sunday early morning, America/São_Paulo) and again on boot — boot is just another chain run, and
  freshness decides whether it costs anything, so a fresh deployment populates itself and a restart
  is free.
- **Single flight, two levels:** the chain holds a `SyncJob` row of its own (`pipeline`, 12h lease,
  the chain being the sum of its jobs) and each job still takes its own (4h), so a worker run and a
  manual trigger never import the same window concurrently.
- **The panel shows the plan, not just the history.** `/admin/sincronizacao` renders `planPipeline()`
  — the same computation the button runs — so each row says what the next run would do to it and
  why. "Última execução: OK" answers whether a job worked; it does not answer whether the record is
  complete, which is what an operator is actually asking.
- **Provenance & trust:** every imported theme keeps its official identifier, house, situation and a
  link back to the source page; `ImportRun` logs every attempt.
- **Resilience:** rate-limit, retry with backoff, tolerate source downtime without data loss. An
  agent run that returns nothing never retires the whole house.
- **Two indexes are computed in batch, not at write time.** `metrics:positioning` needs the whole
  cohort's distribution; `metrics:quality` no longer does — its goalposts are fixed — but it still
  reads a year of roll calls, service spans and quota documents per agent, which is a sweep and not a
  write-time computation. Both are jobs while `Theme.priority` is written by the importers. Both
  refuse to publish a house they could not measure properly: quality below 70% of sitting members
  measured (a half-imported window does not give a thinner reading, it gives one whose attendance
  denominator is wrong for everybody), positioning when any of its three gates fails (§3.2). Both are retunable without re-importing — `npm run requality` and
  `npm run reposition` recompute from stored columns, the way `reprioritize` does.
- **Mandates end, history doesn't:** agents dropped from the official roster get `inOffice = false`
  instead of being deleted — their votes are what the alignment index is built from.
- **Contract check:** `npm run check:sources` asserts every field the importers read is still present
  in the live responses, without touching the database. Neither house versions its open data. It also
  asserts the chain itself — that the dependency graph resolves, that every dependency precedes the
  job declaring it, and that the freshness rule decides the five cases correctly (`decide` takes
  every input as a parameter precisely so this needs no database).

---

## 9. Design

> The full system — tokens, type, patterns, brand assets and a pre-ship checklist — lives in
> [`docs/design.md`](docs/design.md). It is the source of truth; this section is the intent.

**Positioning: "papel & pigmento".** Votto is a public institution that happens to be a website,
so it reads like a well-set document rather than a dashboard. Governmental gravitas with
high-end design quality (most Brazilian public-sector products are poorly made; Votto must not
be), but the reference is a printed record, not a fintech app.

- **Warm paper, never white** (`canvas #fcfaf6`). Structure is a **1px ink rule**, never a shadow.
- **Sober colors of Brazil, as pigment:** warm ink, **pinho** (institutional green), **terracota**
  (action) and **ocre** (highlight). Votes are moss / brick / stone; abstention is always neutral.
- **Newspaper serif (Newsreader) at weight 500** for every display size and for the indexes
  (`.vt-num`, tabular); **Instrument Sans** for labels, buttons, table headers and microcopy.
  There is no 700/800 weight in the system.
- **Paper folds, it does not round:** 4px corners (`--radius-card`), 2px on tags.
- **One decoration:** a 3.5% paper grain in multiply over the document. No auroras, no grids.
- Lists are documents: themes are an order paper with a voting panel, rankings are tables with an
  index column, filters are labelled rules with no box.
- **Every page opens on a masthead, not on a heading.** `PageIntro` (index pages) and `RecordIntro`
  (one agent, one party) are a full-bleed band on a deeper paper stock, closed by a hairline:
  eyebrow, display type one step under the home hero's, lead, action — and, on the right, a **plate
  of that page's own figures** (`IndexPlate` for a cut of one total, `ReadingPlate` for an index
  reading at full size). A masthead always carries a figure that exists: where alignment cannot be
  computed yet, the roll-call record stands in for it.
- **The party is a mark, not a tag.** The curated logos carry the acronym in the party's own
  lettering, so the acronym is never printed beside the mark — it is the fallback for a party with
  no curated mark. Marks always sit in a box bounded on both sides (proportions run from 6.5:1 to
  taller than wide).
- **Voting is the loudest thing on the page,** because it is the platform's action and its
  reading. The panel leads with the winning share in the serif numerals over a keyed tally
  (`TemperatureBar`), and the ballot is three equal columns filled solid with the vote pigments
  (`VoteButtons`), under a terracota prompt — the one place a card opens with a terracota rule.
- **Following is a small outline button, in ink — the same shape as "Compartilhar".** They are the
  two secondary actions a record carries and they sit side by side on the masthead, so they take
  one treatment; terracota stays reserved for the ballot, which is the page's loud action and must
  not compete with anything. It opens a sheet
  — through a portal into `<body>`, like every overlay here — that explains the whole thing before
  anything is recorded: what following is, what it feeds, that it is one per office, that it is
  revocable, and that only the total is ever published. Where an office is taken the control is
  *absent*, replaced by a quiet line naming who holds it.
- **Forms are ours, including the parts browsers usually keep.** One surface for every control
  (`src/components/ui/control.ts`) in two treatments — boxed in the admin, a printed rule in the
  public filters. `Select` replaces the OS dropdown with a paper listbox while the native
  `<select>` stays the field, so filtering still works without JavaScript; radio and checkbox are
  ink ballot marks. Never reach for a bare `<input>`, `<select>` or `type="radio"`.
- The **animated `AlignmentRadar`** is the brand made visible — and, until per-area alignment is
  computed, it is illustration, not a chart (see §11). `PositioningChart` is its **still form**:
  the same mass, hairlines and hand-drawn petal (geometry shared in `src/lib/viz/figure.ts`),
  leaning toward the quadrant a voting record points at. Unlike the radar it is **not**
  illustration — it draws a measured reading, and on a record page it never appears alone:
  `PositioningPlate` prints the two axis figures, the count of classified bills, the margin and the
  most influential bill beside it (§3.2), so the shape can never be read as more precision than
  was measured.
- **A page is composed, not animated.** Blocks arrive with the scroll as ink settling on paper:
  the opener's rule draws itself, index bars enter from the left, the masthead rule fills with
  terracota as the document is read. One vocabulary (`src/components/public/motion.tsx` + the
  motion block in `globals.css`) covers every public screen. Two invariants: resting states live
  only inside `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`, so the
  page is never blank without JavaScript; and first-screen blocks play from CSS keyframes
  (`autoplay`) rather than waiting for hydration, so motion never costs LCP.
- Fully **responsive**; all motion honours `prefers-reduced-motion`.

---

## 10. Conventions

- All database objects, columns, and code are in **English**.
- Every backend method has a descriptive doc comment.
- Never expose internal IDs externally (§5).
- Never run DB statements/migrations from this environment (§5).
- Imported records are upserted idempotently by `(source, external_ref)`; never expose source IDs
  externally (§8).
- Prefer the simplest design that meets the requirement.

---

## 11. Open Questions / To Validate

- **Residualise the government↔opposition component instead of discounting it.** This is now the
  single blocking defect of the positioning index, and it is measured rather than suspected: on
  2026-08-23 the Câmara's party means spanned **15 points against the anchor's 160** (ratio 0.08),
  with PSOL at −9 and PL at +4 — the two poles of the Brazilian economic spectrum, thirteen points
  apart. `itemWeight` multiplies by `(1 − contamination)`, and since a vote that divides the house is
  almost always a coalition vote, that factor guts precisely the items that carry information, while
  `MIN_DISCRIMINATION` removes the rest. The principled repair is the one Zucco & Lauderdale use:
  model the government↔opposition dimension **explicitly** and score the axis on the *residual*,
  which preserves variance, rather than shrinking contaminated items toward zero, which destroys it.
  It is a methodology change — new version, new `changedAt`, new fingerprint — so it is a product
  decision and not a tuning pass. Two notes for whoever picks it up: **96% of items are already on
  the format-2 tags**, so classification volume is not the constraint it looked like; and the
  *ordering* already carries signal (PSOL/REDE/PSB/PT negative, PL/PSD/PP/MDB positive), so what is
  broken is the scale, not the sign structure.

  **This was measured on 2026-08-24, and reweighting is NOT the defect.**
  `--weights=raw` recomputes with the `(1 − contamination)` factor switched off and *nothing else*
  changed (`WeightMode` in `src/lib/indexes/positioning.ts`). Câmara, discount → raw:

  | | discount | raw |
  |---|---|---|
  | agents with a reading | 458/513 | 490/513 |
  | governismo r | −0.19 | **−0.42** |
  | anchor ρ | 0.63 | 0.69 |
  | **spread** | **9%** | **9%** |
  | axes against each other | −0.48 | −0.48 |

  The governismo correlation more than doubled, so the coalition items really did come back and the
  weights really did change — **and the spread did not move one point.** That excludes weighting as
  the cause, and residualisation is a *more sophisticated* handling of the same factor: applied to
  the scores it would `Var × (1 − r²)`, i.e. take the spread from 9% **down** to ~8%.

  The arithmetic says why no reweighting could have worked. The axis is a weighted mean of
  `vote × direction` over [−1, +1]; a party mean of −0.05 means that for *every* deputy the items
  agreeing with the tagged direction almost exactly cancel the ones disagreeing. Reweighting a set
  of fair coins does not produce heads. And the signal is demonstrably in the votes — governismo
  r = −0.42 is strong structure — so it is **`tag.direction` that fails to align with it**. Three
  confirmations: the axis-to-axis r is **identical** (−0.48) in both modes, hence a property of the
  tags and not the weights; the ordering got *worse* where it should improve (CIDADANIA −12,
  SOLIDARIEDADE −11 and PSDB −6 became the most left-wing benches in the house, left of PSOL and
  PCdoB); and the Senado woke up (46/81 agents) reading **inverted**, ρ = −0.23.

  **So the §11 item above is mis-stated: the repair is not "residualise instead of discount", it is
  to change the ESTIMATOR.** Zucco & Lauderdale do not residualise a weighted mean over tagged
  items — they recover the dimensions from the vote matrix itself and use labels only to *orient*
  which recovered dimension is which. Tag quality then matters far less: enough tags to point an
  axis, not to weight every item. The evidence is already in
  [`docs/posicionamento.md`](docs/posicionamento.md): the first principal component over the 15
  roll calls **without government orientation** correlates **+0.917 with the BLS** — unsupervised,
  no tags, above our 0.85 bar — while the current estimator with 217 tagged items returns 0.69.

  **`--weights=clean` then ran, and item selection is not the fix either.** It takes items at full
  weight below a contamination ceiling and drops the rest (an unmeasured contamination drops too —
  the mode asserts the coalition did *not* drive the vote, and a `null` cannot assert it). The
  Câmara's histogram is why the ceiling has to be low: **140 of 217 items sit above 0.5**, so a high
  ceiling stops filtering and converges on `raw`. At ≤0.3 the subset is 35 items — over
  `MIN_HOUSE_ITEMS`, under `MIN_EFFECTIVE_ITEMS` for every one of the 513 deputies, which is what
  `--min-effective-items` exists to get past (party ordering is the mean of 12–91 members; the floor
  protects an individual's published position, and nothing is published here).

  | Câmara | discount | raw | clean ≤0.3 · floor 2 | clean ≤0.3 · floor 4 |
  |---|---|---|---|---|
  | items | 217 | 217 | 35 | 35 |
  | agents scored | 458 | 490 | 470 | 218 |
  | governismo r | −0.19 | −0.42 | **+0.06** | +0.17 |
  | anchor ρ | 0.63 | 0.69 | **0.27** | **0.25** |
  | spread | 9% | 9% | 26% | 35% |

  Two findings, and the second is the one that redirects the work.

  **The compression really was the contaminated items cancelling.** Spread goes 9% → 26% → 35% as
  the clean subset narrows. That half of §3.2's documented mechanism is confirmed.

  **But removing the coalition removes the anchor correlation with it.** Governismo r falls to
  +0.06 — the subset is genuinely clean — and ρ collapses to 0.27, *below* the contaminated set's
  0.63. So most of the 0.63–0.69 was riding on the governismo dimension rather than on ideology,
  which is the exact failure §3.2 says gates 2 and 4 cannot catch for each other.

  **The tags are what fail, and the sample size does not explain it.** On the clean subset
  **PT sits to the RIGHT of PL** — +13 vs +12 at floor 2 (n = 61, 91), +15 vs +11 at floor 4
  (n = 34, 49) — where the BLS has them at −69 and +49. ρ is stable at 0.27/0.25 across both floors.
  Two benches of dozens of members, at opposite poles of Brazilian politics, voting
  indistinguishably *relative to the directions we tagged*: `tag.direction` does not align with how
  the house actually votes.

  **Conclusion: change the estimator, and tag quality is no longer the critical path.** The decisive
  comparison is two numbers over near-identical items in the same house — **PCA on the vote matrix,
  unsupervised, ρ = 0.917; our tag-weighted mean on the clean subset, ρ = 0.27.** A dimension-recovery
  estimator (PCA/IRT), with tags used only to *orient* which recovered dimension is which, is robust
  to tag noise by construction — it is the path that does not depend on solving AI classification,
  which is exactly where the failure was just measured. `CODING_RUNS = 2` stays real debt, but it
  would repair the estimator being abandoned.

  None of these modes is publishable: `recomputePositioningIndex` throws before touching the
  database under any mode that is not `discount` **or any floor other than `MIN_EFFECTIVE_ITEMS`**,
  and `check:positioning` pins the contract (a unanimous item still weighs zero in every mode —
  discrimination has nothing to do with the coalition; the measurement floor changes admission and
  never the value).

  **The estimator was then changed, and it works — `--estimator=pca`.** Direction and weight come
  from the first principal component of the house's vote matrix (`src/lib/indexes/recovery.ts`);
  tags are demoted to a diagnostic. Everything downstream is untouched — same weighted mean, same
  Kish standard error, same `MIN_EFFECTIVE_ITEMS`, same four gates — so the change is falsifiable by
  the tests that failed the old one. Measured on the Câmara, 2026-08-24:

  | | tags/discount | pca (217 items) | pca (339 items, after backfill) |
  |---|---|---|---|
  | anchor ρ | 0.63 | 0.79 | 0.69 (0.71 unweighted) |
  | spread | 9% | 104% | 91% |
  | governismo r | −0.19 | −0.45 | −0.38 |

  The Senado went from unmeasurable to measured: 114 items, signal 2.40×, governismo +0.17,
  spread 63%, ρ 0.47. **Both houses now fail on gate 4 alone.**

  Five things this cost, each a defect found by measuring and worth not repeating:

  - **A principal component has no sign.** Orienting it by tags put the whole Brazilian spectrum on
    the page mirrored (PSOL +62, PL −59) because tag agreement was −0.10 — noise. Worse, orientation
    had *two owners* with different measures (the power-iteration seed, and a post-hoc flip). Now
    `canonicaliseSign` makes the pre-orientation sign a pure function of the matrix and `orientAxis`
    is the sole authority, naming the poles from the anchor's three extremes per side. **That spends
    one bit of gate 4, and the methodology must say so**: the gate tests ordering, not sign.
  - **The social axis has no external ruler.** `anchors.ts` publishes left-right only; orienting PC2
    with `anchorFor` named a morals axis with an economic ruler. An axis that cannot be oriented is
    not published — PC2 stays as the figure, the number goes.
  - **"17% of variance" is not a claim on its own.** The Marchenko–Pastur edge `(1+√(M/N))²/M` is the
    ruler: 1.0% for a 503×339 matrix, 4.2% for 54×114. `MIN_SIGNAL_RATIO` blocks a component
    indistinguishable from a random matrix — which is what the Senado was at 38 items (1.93×).
  - **The recovery estimator must not inherit the tags estimator's item filter.** `dimensions is not
    null` kept the matrix at 217 items after a backfill that imported seven years of roll calls.
    Dropping it for `pca` took the Câmara to 339 and the Senado to 114 — and the noise floor falls
    with M, which is what rescued the Senate. "Never classified" and "classified and excluded" are
    now distinct: the AI's `scoreable: false` is respected, a missing tag is not.
  - **A minimum bench size was the wrong shape for a real problem.** Spearman counts a 2-member
    party like a 104-member one; excluding thin benches cost the Câmara twice (0.79→0.78, 0.71→0.65)
    and **blocked the Senado entirely** — with 81 seats over fifteen parties almost no bench reaches
    ten, so the pairs emptied and spread came back `null`. `weightedSpearman` weights each pair by
    bench size instead: no threshold, nothing discarded, no house where it misbehaves. It reads
    **lower** than unweighted here (0.69 vs 0.71) and is kept anyway — picking the higher number
    would be choosing the result. Both are printed.

  **What still blocks gate 4 is resolution inside the right bloc.** PC1 separates the left (PSOL,
  PT, PCdoB, PSB, PV) cleanly and orders the rest badly: PL — the largest measured bench at 104 and
  the anchor's most right-wing party at +76 — reads +48, *below* MDB, PSDB, PODE, PP, UNIÃO and
  REPUBLICANOS, which the anchor places from +30 to +67. Eight parties covering ~380 deputies fall
  in 19 points where the ruler spreads them over 46. Two candidates, in order of cost: filter
  procedural votes (the 122 items the backfill added were never seen by the AI, and
  `docs/posicionamento.md` measures **58.8% of Câmara plenary votes as procedural by description**),
  then replace PCA with IRT/Optimal Classification, which models each vote's cutting line rather
  than variance and is the literature's answer to exactly this.

  **The procedural filter was the first real gain after the estimator change.** A vote on a
  *requerimento* — urgency, waiving an interstice, taking a bill off the order paper — is not a
  position on the merits of anything; it is a position on **procedure**, and procedure is decided
  along the government↔opposition line almost by definition. `Theme.identifier` cannot see it
  (`--items=policy` dropped **5 of 339**) because `proposicoesAfetadas` resolves to the underlying
  bill: an urgency vote on PL X becomes a position on "PL X". The field that can see it is
  `RollCall.description`, which always arrived in the list response `syncVotes` already downloads —
  it was simply never stored. `npm run redescribe` fills the history with **list calls only**.

  The classifier was written *after* reading real descriptions, and the format is not what one would
  assume: there is no type label — the description is the **outcome sentence**, and what decides is
  its object, right after the verb. `"Aprovado o Requerimento nº 4.491/2024… quebra de interstício"`
  is procedure; `"Mantido o texto. Sim: 335; Não: 117"` is **merit** (it is a *destaque*, on which
  provision survives). The regex anchors at the start of the sentence for the `isDeliberativeSession`
  reason. Validated against the source rather than intuition: **59% of 100 real plenary votes**
  classify as procedure, against the **58.8%** `docs/posicionamento.md` measured independently — and
  **62% of the Câmara's 339 items** in the live run.

  | Câmara | tags | pca (339 items) | **pca + substantive (129)** |
  |---|---|---|---|
  | anchor ρ | 0.63 | 0.69 | **0.75** |
  | ρ unweighted | — | 0.71 | 0.72 |
  | governismo r | −0.19 | −0.38 | −0.34 |
  | spread | 9% | 91% | 76% |
  | signal | — | 13.2× | 5.7× |

  **The weighted ρ went above the unweighted for the first time** (0.75 vs 0.72). In every earlier
  run weighting pulled the number down; now the large benches are better placed than the small ones,
  which is the right way round.

  **What is left is still PL.** 102 deputies — the largest measured bench, so it dominates the
  weighted Spearman — read at **+43** where the anchor puts it at **+76**, *below* REPUBLICANOS
  (+63), UNIÃO (+57), PP (+55) and MDB (+53). Our right pole is the centrão and the house's most
  anti-government party reads as centre-right, which is the signature of governismo that was not
  separated. Two notes for whoever picks this up: `repairDescriptions` is **Câmara-only**, so the
  Senado still has no procedural filter (ρ 0.47); and `HouseReport.itemsByTerm` now prints how the
  items split across presidential terms — if they concentrate in the current one, the identification
  the 2019 backfill was for is not actually in the corpus, because the matrix holds only *sitting*
  agents and a first-term deputy has no vote before 2023.

  **Gate 2 caught a 0.94, and that is the most valuable measurement in this whole line of work.**
  Run locally on the restored copy, 2026-08-24, `--items=substantive`:

  | Câmara | anchor ρ | spread | **governismo r** | signal |
  |---|---|---|---|---|
  | column residualisation (baseline) | 0.75 | 76% | **−0.34** ✓ | 5.7× |
  | `--residual=off` | **0.94** | 112% | **−0.83** ✗ | 18.2× |
  | `--score=residual` | 0.56 | 69% | −0.00 | 5.7× |

  Senado under `--residual=off`: ρ **0.83**, spread 129%, governismo **−0.86**.

  Without residualisation PC1 *is* the government↔opposition dimension, and §3.2 predicted the
  consequence exactly: a pure support-for-the-Executive index scores 0.81–0.93 against the anchor
  because within one presidency the Brazilian coalition is ideologically ordered. So **ρ = 0.94 is
  the failure mode, not the result** — an index measuring support for the Executive and printing
  "Estado ↔ Mercado". It clears `MIN_ANCHOR_CORRELATION` comfortably and is stopped by
  `MAX_GOVERNMENT_CORRELATION` alone. Nobody should ever propose relaxing that constant; this is
  what it is for, demonstrated on live data rather than argued.

  `--score=residual` remains over-control: governismo goes to 0.00 by construction and ρ collapses
  to 0.56, even now that the corpus spans two presidencies. Linear subtraction takes ideology with it.

  **0.75 therefore stands as the best VALID configuration, and the distance to 0.94 is exactly the
  governismo component.** Closing it legitimately needs an estimator that *separates* the two
  dimensions rather than removing one — recover both, then **name** which is which (the governista
  one by its correlation with `governismo`, the ideological one by the anchor), so nothing is
  subtracted and no ideology is lost with it. That is what Zucco & Lauderdale do, and the corpus now
  supports it: `itemsByTerm` measures **41% of Câmara items from 2019–2022** and 59% from 2023+
  (Senado 68%/32%), so the sign inversion that identifies the two dimensions is present in the data.

  **The frontier was then mapped, and the region the gates require is EMPTY for this corpus.**
  Partial residualisation (`--residual=<λ>`, λ ∈ [0,1]) traces the trade-off directly. Câmara,
  `--items=substantive`:

  | λ | anchor ρ | governismo | spread |
  |---|---|---|---|
  | 0 | 0.94 | −0.83 | 112% |
  | 0.7 | 0.93 | −0.62 | 120% |
  | **0.8** | **0.83** | **−0.49** | 99% |
  | 0.9 | 0.75 | −0.40 | 86% |
  | 1 | 0.75 | −0.34 | 76% |

  At the exact λ where governismo crosses inside `MAX_GOVERNMENT_CORRELATION` (0.8 → −0.49), ρ is
  **0.83** — two hundredths under the bar. The curve grazes both limits and never enters
  (ρ ≥ 0.85 **and** |gov| ≤ 0.50).

  **λ = 0.8 is the number not to propose.** It clears gate 2 by 0.01, the parameter has no source,
  and choosing the value that squeaks past two thresholds is fabricating the result — which is why
  `RecoveryOptions.residualise` says, in writing and before the sweep was run, that the interval
  exists to draw the frontier and not to pick a point on it. It would fail gate 4 regardless.
  **The only λ with a justification is 1**: "remove a known confounder entirely" is a claim,
  "remove 80% of it" is not.

  **And the two-dimensional repair does not work here — measured, not assumed.** The plan was to
  recover both dimensions and *name* them rather than subtract one. The second component does not
  carry ideology: on the Câmara without residualisation PC2 measures governismo **+0.66** and anchor
  **−0.17**; with residualisation, governismo **+0.81** and anchor **−0.92**. Every direction in this
  matrix that correlates well with the ruler also correlates well with governismo. They are not two
  dimensions to separate — they are one, exactly as Izumi and Zucco & Lauderdale describe, now
  measured on our own data.

  **So the standing position is: roll-call positioning is not publishable for Brazil under these
  gates.** The best justified configuration is λ = 1, `--estimator=pca --items=substantive`, at
  ρ 0.75 / governismo −0.34 / spread 76% / signal 5.7×, which fails gate 4 by 0.10. What is *not* in
  doubt is the machinery: the estimator change took the Câmara from 0.63 to 0.75 and rescued the
  Senado from unmeasurable, and gate 2 caught a 0.94 that would otherwise have been published as
  ideology. `governismo` remains published on its own (§3.2), which is the reading a Brazilian
  nominal vote actually supports.

  Three ways forward, and all three are product decisions rather than engineering ones: restate the
  provenance of `MIN_ANCHOR_CORRELATION` (see below) and decide what bar a *roll-call-against-survey*
  comparison deserves; find a data source that is not roll calls; or accept publishing governismo
  alone and retire the axes.

  **When a configuration finally passes, `/sobre` and `/metodologia` must be rewritten in the same
  change** — the formulas, the constants in force, the gates and what each one refuses. §2 makes
  `/metodologia` the page where every published constant is *imported* rather than typed, so a
  methodology change that skips it leaves the site quoting numbers the code no longer computes.

  **And `MIN_ANCHOR_CORRELATION = 0.85` needs its provenance restated before it blocks anything
  else.** §3.2 justifies it by Brazilian survey measures agreeing with each other at 0.947–0.988 —
  that is survey against survey. This is *roll call* against survey, a different and harder
  comparison, and no published Brazilian benchmark for it is cited anywhere in this repo. The bar
  may still be right; the argument printed next to it is not the argument for it.
- **Two documented claims the 2026-08-24 run contradicts, to fix before quoting §3.2.**
  (a) The Senado's block is **not** `MIN_HOUSE_ITEMS`: it has **38** usable items, over the floor of
  20, and failed on **0/81 agents with a reading** — every senator was under `MIN_EFFECTIVE_ITEMS`,
  which the `(1 − contamination)` factor alone explains, and `--weights=raw` confirmed it by
  returning **46/81**. "The Senate cannot be scaled" is over-stated: the house has the items, and
  what it does not have is a *correct* reading (anchor ρ = **−0.23**, inverted). Its clean subset is
  4 items at ≤0.3 and 7 at ≤0.5, so nothing above can be measured there at all. (b) The two axes
  measure **r = −0.48**, where CHES-LA measures **+0.94** for Brazilian parties — wrong magnitude
  *and wrong sign*, and invariant to the weighting. §11 already names this case: below the
  literature points at noisy tags, not an unusual country.
- **`MIN_SPREAD_RATIO` is provisional at 0.40**, like the other cut points. The mechanism is what is
  settled — an axis that compresses the known spectrum lies even when its ordering is right, and
  Spearman is structurally blind to it. The exact point recalibrates against a real histogram once
  the residualisation above changes the distribution it is measuring.
- **Recalibrate the positioning floors against a real histogram** (§3.2). The mechanism is built and
  it refuses to publish on its own; what is still guessed are the cut points. `MIN_EFFECTIVE_ITEMS`
  is the one to settle first — its own docstring argues for eight and the constant says four, and it
  decides whether an axis is published at all. Then the band thresholds, once bands are on the table
  again. Run `npm run reposition -- --dry` against real data, the way `requality -- --dry` is meant
  to be run.
- **Watch the three gates on live data before quoting any positioning figure.** "PL at Centro" is no
  longer the regression test — it was absent data printed as a measurement, and that path is closed.
  The test now is whether the anchor correlation clears **0.85** over 60% of seats and the governismo
  correlation stays under 0.50 on the real bench. Until a house passes, it publishes nothing, which
  is the intended failure mode and not a bug to work around.
- **`CODING_RUNS = 1` is a known debt, not a conclusion** (`src/lib/ai/summarize.ts`). The audit
  protocol in [`docs/posicionamento.md`](docs/posicionamento.md) calls for two independent codings
  with acceptance only where the signs agree — Gunes & Florczak measured 83% accuracy on the 65%
  slice where two models agreed, against 58–83% overall. Raising it to 2 doubles the AI cost of a
  pass over hundreds of bills, so it is a product decision. While it is 1, every tag stores
  `consistency: null` and the methodology page says so.
- **Expect the social axis to be suppressed as a number, and check that it is.** `MAX_AXIS_CORRELATION`
  fires when the two axes correlate above 0.85, which is the *expected* Brazilian result (CHES-LA
  measures 0.94), not an anomaly. What is worth watching in `npm run reposition -- --dry` is the
  opposite case: if the measured correlation comes in far *below* the literature's, the tags are more
  likely to be noisy than the country to be unusual.
- Exact similarity formula and theme weighting for the **Alignment Index**.
- **Theme → axis tagging at scale.** The AI pass (`ai:summaries`) proposes the two-axis tags, and
  everything in §3.2 is downstream of their quality: an axis with too few classified bills is `null`
  by design, so thin tagging shows up as no reading rather than a wrong one. The official
  classification (`Theme.classifications`) is still the obvious input to cross-check it against, and
  is still unused. Inter-coder reliability (Krippendorff's alpha on the direction, which is a
  three-class nominal judgement) has not been measured.
- Tune the **priority** weights in `src/lib/domain/priority.ts` against real editorial judgement.
- **Provider credentials:** register the app with Google, Apple and Meta and fill the `.env`
  (click-by-click: `docs/login-social-passo-a-passo.md`; rationale: `docs/integracao.md` §5). Google is the cheapest to get working and has the widest reach —
  start there. Apple needs a paid account and an https callback (it refuses http, even on
  localhost), so it needs a tunnel to test locally.
- **CPF registry contract:** verified end to end against the live Receita Federal registry on
  2026-08-22 (`npm run check:cpf`), and against the documented payload by `npm run
  check:cpf:contract`. What remains is configuration: `CPF_VALIDATION_PROVIDER=mock` accepts any
  well-formed CPF, so **production is still unverified** until the Infosimples token reaches
  `.env.production` (~R$0,24/lookup, R$100/month floor).
- **A real proof of CPF possession.** What ships is CPF + birth date against the registry, which
  proves the CPF is real but not that it is the person's. The Pix of R$0,01 is the deferred
  candidate; revisit before the platform's numbers are quoted as representative.
- **Following has no geographic check.** A citizen in SP can only elect a deputy from SP, but the
  platform does not store the citizen's state (minimal collection, §5), so nothing validates it.
  Revisit if base readings start being quoted as representative of a state.
- **The base index is recomputed whole** on a 120s cache (`base:agents:v1`, dropped on follow). The
  replacement at volume is a materialized per-agent aggregate updated incrementally on each vote.
- **Calibrate the quality index's band cut points against a real load** (§3.3). The bands
  (80/60/40) predate fixed goalposts and the geometric mean, and the geometric mean pulls the
  composite *down* rather than to the centre, so the old worry (mass piling at 50) is not the current
  one. Re-read `npm run requality -- --dry` against the observed histogram before touching them.
  Whatever they become, the labels stay comparative: "Muito acima da média" is a claim the arithmetic
  can support and "Excelente" is not.
- **The Senate's CEAPS ceiling table is from 2017** and no newer per-state table exists at any Senate
  address (§3.3). Senators' cost is therefore read against a floor that is probably low. `npm run
  requality` prints median utilisation per house so the gap is measurable — if the Senate's median
  sits far above the Câmara's, the ceiling is what is wrong, not the senators. Do **not** adopt the
  Ranking dos Políticos' 2026 table: it is `max(2017 × 1,192477, CEAP × 0,879121)`, a reconstruction
  credited to the Senate. `check:sources` hashes the PDF so a republish surfaces immediately.
- **Privileges, leadership posts and final convictions** are three dimensions of conduct the Ranking
  dos Políticos measures and we do not (auxílio-moradia, passaporte diplomático para familiares,
  aposentadoria especial; presidências e lideranças; condenações transitadas em julgado). None are in
  the open APIs — they collect them by hand, by LAI and from a paid legal-data platform. Candidate
  pillars, subject to the §3.3 both-houses rule.
- **Emendas parlamentares executed as a fifth quality pillar** — the positive counterpart of custeio,
  and the reason custeio had to be scoped so narrowly. Neither house's open data carries it; it would
  come from the Portal da Transparência / SIOP. Only worth building if it can cover both houses.
- The Câmara's rapporteur count is a **floor**, not a count. `check:sources` watches
  `statusProposicao` for the day the history is published, so the floor can be replaced.
- **Plenary presence** (`eventos/{id}/deputados`, verified to be real presence: ~480 at a deliberative
  sitting, 0 at a solemn one) would be a finer attendance signal than roll calls — but only the
  Câmara publishes it, so it fails the both-houses rule and stays unbuilt.
- Confirm hosting choice (Fly.io `gru` vs AWS `sa-east-1`).
- Which state/municipal bodies expose open data, and whether the AI enrichment step (§4) should run
  on the newly imported bills (it is not wired into the importers yet).
- **Per-area alignment** for the hero's `AlignmentRadar`: it needs themes grouped by policy area
  and the alignment maths run per group (the same computation as `citizenAgentAlignments`, only
  partitioned). Until then the radar's data is fictional and it stands as brand illustration —
  see `docs/design.md` §4.
- The two layouts the humanized study proposed but this pass did not apply: agent/party lists as
  tables, and the theme detail page with the official record as a marginal column
  (`docs/design.md` §7).
