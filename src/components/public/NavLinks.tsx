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
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-navy-50 text-navy-800"
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
