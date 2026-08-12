/**
 * Registry status vocabulary, shared by every CPF provider.
 *
 * Each source spells the status differently — Serpro returns a numeric code
 * plus a label, screen-scraping providers return only the label — so the label
 * matcher is the common denominator and lives here rather than in one adapter.
 */
import type { CpfSituation } from "@/lib/identity/validation";

/**
 * Normalize a Receita Federal status label.
 *
 * Deliberately conservative: an unrecognized label becomes `UNKNOWN`, never
 * `REGULAR`. Only an explicit match may let a citizen through, so a wording
 * change upstream fails closed instead of silently admitting suspended or
 * deceased holders.
 */
export function situationFromDescription(description: string | undefined): CpfSituation {
  const text = (description ?? "").toLowerCase();
  if (text.includes("regular")) return "REGULAR";
  if (text.includes("suspens")) return "SUSPENDED";
  if (text.includes("cancelad")) return "CANCELLED";
  if (text.includes("nul")) return "NULL";
  if (text.includes("falecid") || text.includes("óbito") || text.includes("obito")) {
    return "DECEASED";
  }
  if (text.includes("pendente") || text.includes("regulariza")) return "SUSPENDED";
  return "UNKNOWN";
}
