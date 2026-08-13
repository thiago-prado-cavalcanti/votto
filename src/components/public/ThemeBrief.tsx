/**
 * A theme as a one-line entry in someone else's document — an agent's list of
 * authored bills, a party's agenda — where the record on the screen is the
 * person, not the bill.
 *
 * `ThemeRow` is the full order-paper entry: summary, subject tags, tally and the
 * ballot. That is right on the themes list and far too much repeated eight times
 * inside a profile, so this is the same grammar compressed to what identifies the
 * bill — house and official identifier in small caps, the plain-language headline
 * in the serif, the role that ties it to this record, and the current situation.
 *
 * Rows are hairline-separated and each arrives on its own scroll position, like
 * every other list in the system (docs/design.md).
 */
import Link from "next/link";
import { Reveal } from "@/components/public/motion";
import { PriorityBadge } from "@/components/public/PriorityBadge";
import { houseShortLabel } from "@/lib/labels";
import { priorityBand } from "@/lib/domain/priority";
import type { House } from "@/generated/prisma";

export interface ThemeBriefItem {
  kid: string;
  /** Plain-language headline when we have one, else the official ementa. */
  title: string;
  identifier: string | null;
  house: House | null;
  priority: number;
  situation: string | null;
  urgency: string | null;
  /** How this record relates to the bill — "Autor", "Relator". */
  role?: string;
}

export function ThemeBriefList({ items }: { items: ThemeBriefItem[] }) {
  return (
    <div className="divide-y divide-[var(--color-line)] border-b border-line">
      {items.map((item, i) => (
        <Reveal
          as="article"
          key={item.kid}
          // Only the first entries on a screen are offset; past that the scroll
          // is the stagger, as in `ThemeList`.
          delay={Math.min(i, 3) * 80}
          className="py-5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              {item.house ? houseShortLabel[item.house] : null}
              {item.house && item.identifier ? " · " : null}
              {item.identifier}
            </span>
            {item.role ? (
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ochre-ink)]">
                {item.role}
              </span>
            ) : null}
            <PriorityBadge
              band={priorityBand(item.priority)}
              urgency={item.urgency}
              situation={item.situation}
            />
          </div>

          <Link href={`/temas/${item.kid}`} className="group mt-1.5 block">
            <h3 className="text-[1.15rem] leading-snug text-navy-900 group-hover:underline">
              {item.title}
            </h3>
          </Link>

          {item.situation ? (
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">{item.situation}</p>
          ) : null}
        </Reveal>
      ))}
    </div>
  );
}
