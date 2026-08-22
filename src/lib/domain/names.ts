/**
 * Presenting a person's name the way it is written, not the way a registry
 * stores it.
 *
 * The Receita Federal returns names in full caps — `THIAGO DE PAULA PRADO
 * OLIVEIRA CAVALCANTI` — and Votto greets people by name in the header. Storing
 * that verbatim makes the site shout at the citizen on every page, and caps are
 * measurably harder to read besides.
 *
 * The rule that matters for Brazilian names is the connectives: `de`, `da`,
 * `dos`, `e` stay lowercase inside a name but are capitalized when they open it
 * — someone may well be recorded as `Da Silva`.
 */

/** Connectives that stay lowercase unless they lead the name. */
const PARTICLES = new Set([
  "de", "do", "da", "dos", "das", "e",
  // Occasional in Brazilian records, from Italian/Spanish/Dutch/German lines.
  "di", "du", "del", "della", "van", "von", "y",
]);

/**
 * Title-case a person's name, leaving already mixed-case input alone.
 *
 * Input that is not all-caps is returned untouched: a provider that already
 * sends `Ana Beatriz` knows better than this function, and a name deliberately
 * written `McDonald` or `d'Ávila` must not be flattened.
 */
export function formatPersonName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) return "";

  // Only rewrite when there is no lowercase letter at all — i.e. registry caps.
  if (/\p{Ll}/u.test(name)) return name;

  return name
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (index > 0 && PARTICLES.has(word)) return word;
      return capitalizeWord(word);
    })
    .join(" ");
}

/**
 * Capitalize a single word, including the parts of a hyphenated or
 * apostrophized one (`ANA-MARIA` → `Ana-Maria`, `D'AVILA` → `D'Avila`).
 */
function capitalizeWord(word: string): string {
  return word.replace(/(^|[-'’])(\p{L})/gu, (_match, boundary: string, letter: string) =>
    boundary + letter.toLocaleUpperCase("pt-BR"),
  );
}

/**
 * Split a full name into the first name and everything after it, which is how
 * `User` stores it. Mirrors the importers' rule for agent names.
 */
export function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const parts = formatPersonName(raw).split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}
