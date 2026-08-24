/**
 * The sign-in buttons: one row per provider, each a plain link to that
 * provider's `start` route. No client JavaScript — a link is all a redirect
 * flow needs, and login must work on the worst connection in the country.
 *
 * Design notes (docs/design.md, CLAUDE.md §9): the buttons are paper with a 1px
 * ink rule, not shadowed chips, and the label is Instrument Sans. The provider
 * marks are treated the way party logos are — a mark is a mark, so it keeps its
 * own form. Google's "G" stays in its four colours because Google's branding
 * terms require the official mark on a light button; Apple and Meta both permit
 * a monochrome treatment, so they take the page's ink and stop the row from
 * turning into four competing logos.
 *
 * `Instagram` is a button, not a provider: it runs the Facebook Login flow (see
 * `resolveProvider`). It is offered because a great many Brazilians think of
 * their Instagram account as their identity and would not recognize that their
 * Facebook credentials are the same login.
 */
import { availableButtons, type ButtonKey } from "@/lib/auth/social/providers";

/** Official Google "G", the only mark rendered in colour. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Apple mark, in ink. */
function AppleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0 fill-current" aria-hidden="true">
      <path d="M13.09 9.55c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.29.69-2.88.69-.6 0-1.51-.67-2.48-.66-1.28.02-2.46.74-3.12 1.88-1.33 2.3-.34 5.71.96 7.58.64.91 1.39 1.94 2.38 1.9.96-.04 1.32-.62 2.48-.62 1.15 0 1.48.62 2.49.6 1.03-.02 1.68-.93 2.31-1.85.73-1.06 1.03-2.09 1.04-2.14-.02-.01-2-.77-2.02-3.03ZM11.2 3.94c.53-.64.89-1.53.79-2.42-.76.03-1.69.51-2.24 1.15-.49.56-.92 1.47-.8 2.34.85.06 1.71-.43 2.25-1.07Z" />
    </svg>
  );
}

/** Facebook "f", in ink. */
function FacebookMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0 fill-current" aria-hidden="true">
      <path d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.69-1.47 1.4V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9Z" />
    </svg>
  );
}

/** Instagram glyph, in ink. */
function InstagramMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-[18px] shrink-0 fill-current" aria-hidden="true">
      <path d="M9 1.62c2.4 0 2.69.01 3.64.05.88.04 1.35.19 1.67.31.42.16.72.36 1.03.67.31.31.51.61.67 1.03.12.32.27.79.31 1.67.04.95.05 1.24.05 3.65s-.01 2.7-.05 3.65c-.04.88-.19 1.35-.31 1.67-.16.42-.36.72-.67 1.03-.31.31-.61.51-1.03.67-.32.12-.79.27-1.67.31-.95.04-1.24.05-3.64.05s-2.69-.01-3.64-.05c-.88-.04-1.35-.19-1.67-.31a2.78 2.78 0 0 1-1.03-.67 2.78 2.78 0 0 1-.67-1.03c-.12-.32-.27-.79-.31-1.67-.04-.95-.05-1.24-.05-3.65s.01-2.7.05-3.65c.04-.88.19-1.35.31-1.67.16-.42.36-.72.67-1.03.31-.31.61-.51 1.03-.67.32-.12.79-.27 1.67-.31.95-.04 1.24-.05 3.64-.05M9 0C6.56 0 6.25.01 5.29.05c-.96.05-1.61.2-2.18.42-.6.23-1.1.55-1.6 1.05-.5.5-.81 1-1.05 1.6-.22.57-.37 1.22-.42 2.18C.01 6.26 0 6.56 0 9s.01 2.75.05 3.71c.05.96.2 1.61.42 2.18.23.6.55 1.1 1.05 1.6.5.5 1 .81 1.6 1.05.57.22 1.22.37 2.18.42.96.04 1.27.05 3.71.05s2.75-.01 3.71-.05c.96-.05 1.61-.2 2.18-.42.6-.23 1.1-.55 1.6-1.05.5-.5.81-1 1.05-1.6.22-.57.37-1.22.42-2.18.04-.96.05-1.27.05-3.71s-.01-2.75-.05-3.71c-.05-.96-.2-1.61-.42-2.18a4.4 4.4 0 0 0-1.05-1.6c-.5-.5-1-.81-1.6-1.05-.57-.22-1.22-.37-2.18-.42C11.75.01 11.44 0 9 0Z" />
      <path d="M9 4.38a4.62 4.62 0 1 0 0 9.24 4.62 4.62 0 0 0 0-9.24ZM9 12a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
      <circle cx="13.81" cy="4.19" r="1.08" />
    </svg>
  );
}

const BUTTONS: Record<ButtonKey, { label: string; mark: () => React.ReactElement }> = {
  google: { label: "Continuar com Google", mark: GoogleMark },
  apple: { label: "Continuar com Apple", mark: AppleMark },
  facebook: { label: "Continuar com Facebook", mark: FacebookMark },
  instagram: { label: "Continuar com Instagram", mark: InstagramMark },
};

/**
 * Render the buttons for every provider currently usable. Returns null when
 * none are — the login page decides what to say in that case.
 */
export function SocialButtons({ returnTo }: { returnTo?: string | null }) {
  const keys = availableButtons();
  if (keys.length === 0) return null;

  // Already sanitized by the page; encoded here because it becomes a query
  // value. A citizen sent here mid-vote gets put back on that bill afterwards.
  const suffix = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";

  return (
    <div className="flex flex-col gap-2.5">
      {keys.map((key) => {
        const { label, mark: Mark } = BUTTONS[key];
        return (
          <a
            key={key}
            href={`/api/auth/social/${key}/start${suffix}`}
            className={
              "flex h-12 items-center gap-3 rounded-card border border-line bg-surface px-4 " +
              "text-sm font-medium text-navy-900 transition-colors hover:bg-navy-50 " +
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
            }
          >
            <Mark />
            <span>{label}</span>
          </a>
        );
      })}
    </div>
  );
}
