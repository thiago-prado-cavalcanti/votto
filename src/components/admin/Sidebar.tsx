"use client";

/**
 * Admin sidebar navigation, highlighting the active section based on the current
 * pathname.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/agentes", label: "Agentes Públicos" },
  { href: "/admin/partidos", label: "Partidos" },
  { href: "/admin/temas", label: "Temas" },
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
            className={cn(
              "rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-navy-700 text-white"
                : "text-navy-100 hover:bg-navy-700/40 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
