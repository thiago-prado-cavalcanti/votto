"use client";

/**
 * Primary navigation links for the public header, highlighting the active route.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/temas", label: "Temas" },
  { href: "/agentes", label: "Agentes" },
  { href: "/partidos", label: "Partidos" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
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
