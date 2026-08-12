"use client";

/**
 * Admin sidebar navigation, highlighting the active section based on the current
 * pathname. Dark "control room" treatment with an orange accent for the active
 * item.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/agentes", label: "Agentes Públicos" },
  { href: "/admin/partidos", label: "Partidos" },
  { href: "/admin/temas", label: "Temas" },
  { href: "/admin/sincronizacao", label: "Sincronização" },
  { href: "/admin/administradores", label: "Administradores" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center rounded-card px-3.5 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-navy-50/10 text-navy-50"
                : "text-navy-200 hover:bg-navy-50/5 hover:text-navy-50",
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 bg-accent-500 transition-opacity",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
