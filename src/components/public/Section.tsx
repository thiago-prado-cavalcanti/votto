/**
 * Editorial page and section openers.
 *
 * Every public page opens the same way: a 3px ink rule (`.vt-rule-ink`, the one
 * opener of the system — never a double rule), the title in the newspaper serif,
 * then a lead paragraph. Sections inside a page repeat the pattern one step down,
 * with room for an action on the right (docs/design.md).
 *
 * `PageIntro` is a **masthead**, not a heading: a band that runs the full width
 * of the paper on a slightly deeper stock and closes on a rule, carrying an
 * eyebrow, display type one step under the home hero's, the lead, an action, and
 * — on the right — a plate of the page's own figures. The three index pages
 * (temas, agentes, partidos) have nothing above their filter bar, so set as a
 * plain heading they opened weightless, straight into a row of controls; given a
 * nameplate they open the way the home page does, and the first screen already
 * says how large the subject is. It therefore sits **outside** the page's
 * `Container`, which is what makes the band full-bleed.
 *
 * `RecordIntro` is the same band for a single record — an agent, a party: the
 * portrait as a plate on the left of the name, and the record's own headline
 * reading (its alignment) as the figure on the right, instead of that reading
 * being filed in a sidebar card below the fold.
 *
 * The opener is also where the page's motion starts: the rule draws itself from
 * the left, and the title, the lead and the trailing content settle after it, one
 * beat apart. Because every screen opens with one of these, the whole site
 * inherits the same reading rhythm without any page arranging it.
 */
import * as React from "react";
import { Reveal } from "@/components/public/motion";
import { Container } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Delay of a part inside a revealed block (see the motion block in globals.css). */
const beat = (ms: number) => ({ "--vt-d": `${ms}ms` }) as React.CSSProperties;

export function PageIntro({
  eyebrow,
  title,
  lead,
  figure,
  children,
  className,
}: {
  /** Small-caps line above the title: what this index is, in two or three words. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  /** Standing box of figures on the right — usually an `IndexPlate`. */
  figure?: React.ReactNode;
  /** Optional trailing content (an action, a note). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-line bg-navy-100/45", className)}>
      <Container className="py-8 sm:py-14 lg:py-16">
        <div
          className={cn(
            "grid gap-7 sm:gap-10",
            figure ? "lg:grid-cols-[1fr_minmax(0,21rem)] lg:items-end lg:gap-16" : null,
          )}
        >
          {/* `autoplay`: a page opener is always the first thing on the screen and
              is usually its largest paint, so it opens from CSS instead of waiting
              to be hydrated and observed. `SectionHead` below the fold keeps the
              observer. */}
          <Reveal as="header" variant="fade" autoplay>
            <hr className="vt-rule-ink vt-grow w-14" />
            {eyebrow ? (
              <p
                className="vt-lift mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-500"
                style={beat(120)}
              >
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                "vt-lift text-[2.05rem] leading-[1.04] sm:text-[3.05rem] sm:leading-[1.02] lg:text-[3.45rem]",
                eyebrow ? "mt-3" : "mt-5",
              )}
              style={beat(220)}
            >
              {title}
            </h1>
            {lead ? (
              <p
                className="vt-lift mt-3.5 max-w-xl text-[0.95rem] leading-relaxed text-navy-700 sm:mt-5 sm:text-lg"
                style={beat(340)}
              >
                {lead}
              </p>
            ) : null}
            {children ? (
              <div className="vt-lift mt-5 sm:mt-7" style={beat(440)}>
                {children}
              </div>
            ) : null}
          </Reveal>

          {figure ? (
            <Reveal variant="figure" delay={200} autoplay>
              {figure}
            </Reveal>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

export function RecordIntro({
  back,
  portrait,
  eyebrow,
  title,
  figure,
  children,
  className,
}: {
  /** The way back to the list, plus any record-level action (share). */
  back?: React.ReactNode;
  /** Squared portrait plate to the left of the name — photo, logo, initials. */
  portrait?: React.ReactNode;
  /** Small-caps line above the name: office, house, mandate. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** The record's headline reading — usually a `ReadingPlate`. */
  figure?: React.ReactNode;
  /** Everything under the name: tags, biography, official link. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-line bg-navy-100/45", className)}>
      <Container className="py-7 sm:py-12 lg:py-14">
        {back ? (
          <Reveal
            variant="fade"
            autoplay
            className="mb-6 flex items-center justify-between gap-3 sm:mb-9"
          >
            {back}
          </Reveal>
        ) : null}

        <div
          className={cn(
            "grid gap-7 sm:gap-10",
            figure ? "lg:grid-cols-[1fr_minmax(0,20rem)] lg:items-end lg:gap-16" : null,
          )}
        >
          <Reveal as="header" variant="fade" autoplay>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
              {portrait ? (
                <div className="vt-lift shrink-0" style={beat(80)}>
                  {portrait}
                </div>
              ) : null}

              <div className="min-w-0">
                <hr className="vt-rule-ink vt-grow w-14" />
                {eyebrow ? (
                  <p
                    className="vt-lift mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-navy-500"
                    style={beat(120)}
                  >
                    {eyebrow}
                  </p>
                ) : null}
                <h1
                  className={cn(
                    "vt-lift text-[1.95rem] leading-[1.05] sm:text-[2.8rem] sm:leading-[1.03] lg:text-[3.1rem]",
                    eyebrow ? "mt-2.5" : "mt-5",
                  )}
                  style={beat(220)}
                >
                  {title}
                </h1>
                {children ? (
                  <div className="vt-lift mt-5" style={beat(340)}>
                    {children}
                  </div>
                ) : null}
              </div>
            </div>
          </Reveal>

          {figure ? (
            <Reveal variant="figure" delay={220} autoplay>
              {figure}
            </Reveal>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

export function SectionHead({
  title,
  lead,
  action,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal
      variant="fade"
      className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}
    >
      <div>
        <hr className="vt-rule-ink vt-grow w-10" />
        <h2 className="vt-lift mt-4 text-[1.7rem] leading-tight" style={beat(140)}>
          {title}
        </h2>
        {lead ? (
          <p
            className="vt-lift mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-muted)]"
            style={beat(240)}
          >
            {lead}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="vt-lift" style={beat(340)}>
          {action}
        </div>
      ) : null}
    </Reveal>
  );
}
