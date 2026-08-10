/**
 * Weekly schedule arithmetic in a fixed IANA time zone.
 *
 * The workers must fire at "Sunday 02:00 in Brasília" regardless of where the
 * container's clock is set, so schedules are resolved against
 * `America/Sao_Paulo` rather than the host's local time. Brazil has not observed
 * DST since 2019, but the offset is read from the zone on each computation
 * instead of being hardcoded, so a future change would not silently shift every
 * job by an hour.
 *
 * Deliberately dependency-free: `Intl` already knows the zone.
 */
import type { WeeklySchedule } from "@/lib/integration/jobs";

export const TIME_ZONE = "America/Sao_Paulo";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Wall-clock fields of an instant, as seen in {@link TIME_ZONE}. */
interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

/** Decompose an instant into its {@link TIME_ZONE} wall-clock fields. */
export function zonedParts(instant: Date): ZonedParts {
  const map = new Map(PARTS.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
    hour: Number(map.get("hour")) % 24,
    minute: Number(map.get("minute")),
    second: Number(map.get("second")),
    weekday: WEEKDAYS[map.get("weekday") ?? "Sun"] ?? 0,
  };
}

/**
 * Offset of {@link TIME_ZONE} from UTC at `instant`, in milliseconds
 * (negative west of Greenwich, so −3h for Brasília).
 */
function zoneOffsetMs(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision on both sides so the difference is a clean offset.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which `schedule` next fires strictly after `from`.
 *
 * The target wall-clock is converted to an instant using the zone offset at that
 * date (not at `from`), so a schedule that straddles a hypothetical DST change
 * still lands on the intended local time.
 */
export function nextOccurrence(schedule: WeeklySchedule, from: Date = new Date()): Date {
  const local = zonedParts(from);

  let daysAhead = (schedule.weekday - local.weekday + 7) % 7;
  const minutesNow = local.hour * 60 + local.minute;
  const minutesTarget = schedule.hour * 60 + schedule.minute;
  // Today's slot has already passed (or is exactly now) — go to next week.
  if (daysAhead === 0 && minutesTarget <= minutesNow) daysAhead = 7;

  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + daysAhead, schedule.hour, schedule.minute, 0));
  // `target` currently holds the wall-clock read as UTC; shift it by the zone's
  // offset at that moment to get the real instant.
  const approx = new Date(target.getTime() - zoneOffsetMs(from));
  return new Date(target.getTime() - zoneOffsetMs(approx));
}

/** Format an instant as `dd/MM/yyyy HH:mm` in {@link TIME_ZONE}, for logs and the dashboard. */
export function formatZoned(instant: Date): string {
  const p = zonedParts(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.day)}/${pad(p.month)}/${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** PT-BR weekday names, indexed like `Date#getDay()`. */
export const WEEKDAY_LABELS = [
  "domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado",
] as const;

/** Human description of a weekly slot, e.g. "domingos às 02:00 (Brasília)". */
export function describeSchedule(schedule: WeeklySchedule): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${WEEKDAY_LABELS[schedule.weekday]}s às ${pad(schedule.hour)}:${pad(schedule.minute)} (Brasília)`;
}
