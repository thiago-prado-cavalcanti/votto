/**
 * Responsive strip of headline statistics (themes, agents, parties, votes).
 */
import { Stat } from "@/components/ui";

export function StatStrip({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; hint?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {items.map((item) => (
        <Stat key={item.label} label={item.label} value={item.value} hint={item.hint} />
      ))}
    </div>
  );
}
