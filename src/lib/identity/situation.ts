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
  // Two spellings for the same state: the Receita's portal says "REGULAR",
  // while Infosimples' documented payload says "ATIVA". Missing either one is
  // not a near miss — an unmatched label fails closed, so it would reject every
  // valid CPF with "situação que não reconhecemos".
  if (text.includes("regular") || text.includes("ativa")) return "REGULAR";
  if (text.includes("suspens")) return "SUSPENDED";
  if (text.includes("cancelad")) return "CANCELLED";
  if (text.includes("nul")) return "NULL";
  if (text.includes("falecid") || text.includes("óbito") || text.includes("obito")) {
    return "DECEASED";
  }
  if (text.includes("pendente") || text.includes("regulariza")) return "SUSPENDED";
  return "UNKNOWN";
}
