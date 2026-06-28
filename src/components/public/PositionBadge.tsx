/**
 * Small badge showing the left↔right positioning band (e.g. "Centro-direita"),
 * tinted by band. Server-component friendly (no client hooks).
 */
import { Badge } from "@/components/ui";

type Tone = "navy" | "colonial" | "positive" | "negative" | "neutral" | "gray";

const BAND_TONE: Record<string, Tone> = {
  esquerda: "negative",
  "centro-esquerda": "neutral",
  centro: "gray",
  "centro-direita": "colonial",
  direita: "navy",
};

export function PositionBadge({
  profileLabel,
  profileKey,
  basis,
}: {
  profileLabel: string;
  profileKey?: string;
  basis?: number;
}) {
  if (basis !== undefined && basis === 0) {
    return <Badge tone="gray">Posição indisponível</Badge>;
  }
  return <Badge tone={(profileKey && BAND_TONE[profileKey]) || "gray"}>{profileLabel}</Badge>;
}
