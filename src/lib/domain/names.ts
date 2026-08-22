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

/**
 * Generational suffixes, which trail a name without being the surname.
 *
 * `JOSÉ CARLOS SILVA JÚNIOR` has `Silva` as its last surname — asking for the
 * "último sobrenome" and demanding `Júnior` would reject a great many people
 * for knowing their own name. Either answer is accepted.
 */
const SUFFIXES = new Set(["filho", "filha", "junior", "neto", "neta", "sobrinho", "sobrinha", "segundo", "terceiro"]);

/**
 * Whether a typed first + last name match the name the registry holds.
 *
 * The point of asking is that the citizen must *know* the name behind the CPF,
 * checked against the authoritative source rather than against the display name
 * they chose on Google. It raises the bar over CPF + birth date alone; it does
 * not stop someone holding a leaked record, which carries all three together.
 *
 * Matching is forgiving in the ways names are *written* and strict in the way
 * that carries the security:
 *
 *  - **Accents and case are ignored.** Nobody should fail for typing `Jose`.
 *  - **The first name must be the first name**, and **the last surname must be
 *    the last one.** Accepting any surname was the first cut here and it was
 *    wrong: the middle surname is precisely the one that circulates socially —
 *    someone is publicly `Thiago Prado` while the record ends in `Cavalcanti`.
 *    Against the realistic attacker, a relative or a colleague, the final
 *    surname is the part that lives on the document rather than in conversation.
 *  - **Generational suffixes are not the surname.** `SILVA JÚNIOR` accepts both
 *    `Silva` and `Júnior`; the citizen decides which one they call theirs.
 *  - **Particles do not count.** `de`, `dos`, `e` are never the answer.
 */
export function nameMatchesRegistry(
  typed: { firstName: string; lastName: string },
  registryName: string,
): boolean {
  const tokens = tokenize(registryName);
  const first = fold(typed.firstName);
  const last = fold(typed.lastName);
  if (!first || !last || tokens.length === 0) return false;

  if (tokens[0] !== first) return false;

  const surnames = tokens.slice(1).filter((token) => !PARTICLES.has(token));
  // A single-token record has no surname to check; the first name is all there
  // is, and rejecting the citizen for our source's brevity would be wrong.
  if (surnames.length === 0) return true;

  // The accepted answers: the final token, plus the surname before it whenever
  // that final token is only a generational suffix.
  const accepted = new Set<string>([surnames[surnames.length - 1]]);
  for (let i = surnames.length - 1; i > 0 && SUFFIXES.has(surnames[i]); i--) {
    accepted.add(surnames[i - 1]);
  }
  return accepted.has(last);
}

/** Lowercase, unaccented, punctuation-free words. */
function tokenize(name: string): string[] {
  return fold(name).split(" ").filter(Boolean);
}

/** Normalize one string for comparison: no accents, no case, no punctuation. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
