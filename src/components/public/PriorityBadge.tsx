/**
 * Badge for a theme's legislative priority.
 *
 * The score itself (0–100) is an internal ranking signal; what a citizen needs
 * to know is whether the bill is about to be voted. Only the two upper bands get
 * a badge — labelling everything else "normal" would be noise on every card.
 * The source's own wording (regime + situation) is kept in the tooltip, so the
 * derived band is always traceable to what the house actually published.
 */
import { Badge } from "@/components/ui";
import { priorityBandLabel, type PriorityBand } from "@/lib/domain/priority";

const TONE: Partial<Record<PriorityBand, "negative" | "neutral">> = {
  URGENT: "negative",
  HIGH: "neutral",
};

export function PriorityBadge({
  band,
  urgency,
  situation,
}: {
  band: PriorityBand;
  urgency?: string | null;
  situation?: string | null;
}) {
  const tone = TONE[band];
  if (!tone) return null;

  const detail = [urgency, situation].filter(Boolean).join(" · ");
  return (
    <Badge tone={tone} className={detail ? "cursor-help" : undefined}>
      <span title={detail || undefined}>{priorityBandLabel[band]}</span>
    </Badge>
  );
}
