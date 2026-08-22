"use client";

/**
 * Primary navigation links for the public header, highlighting the active route.
 *
 * `account` appends "Conta" for a logged-in citizen. The header greeting is the
 * way in on a wide screen, but it is hidden below `sm` where the header has no
 * room for it — without this the account, and therefore the way to change who
 * represents you, would be unreachable on a phone.
 *
 * The row **wraps**, and has to now that it carries six entries at its longest
 * ("Sobre" plus "Conta"). Below the `sm` breakpoint it is rendered as its own
 * band under the masthead, where the six words measure past a 360px screen: on
 * one line they would either overflow the paper or force a scroll gesture no
 * other part of the site asks for. Wrapping costs the header 28px on the
 * narrowest phones and nothing anywhere else.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/temas", label: "Temas" },
  { href: "/agentes", label: "Agentes" },
  { href: "/partidos", label: "Partidos" },
  { href: "/sobre", label: "Sobre" },
];

export function NavLinks({ account = false }: { account?: boolean }) {
  const pathname = usePathname();
  const links = account ? [...LINKS, { href: "/conta", label: "Conta" }] : LINKS;
  return (
    <nav className="flex flex-wrap items-center gap-1">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              // The active route is marked with an ink rule under the word, not
              // with a tinted pill.
              "px-2.5 py-2 text-sm transition-colors",
              active
                ? "font-medium text-navy-900 underline decoration-navy-900 decoration-2 underline-offset-[7px]"
                : "text-[var(--color-muted)] hover:text-navy-800",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
