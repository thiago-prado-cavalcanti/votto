/**
 * Votto wordmark used in the header and footer.
 */
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700 text-sm font-bold text-white">
        V
      </span>
      <span className="text-lg font-bold tracking-tight text-navy-900">Votto</span>
    </Link>
  );
}
