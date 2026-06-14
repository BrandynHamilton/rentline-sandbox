import { statusColor, scrapeColor } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(status)}`}>
      {status}
    </span>
  );
}

export function ScrapeBadge({ status }: { status: string }) {
  const icons: Record<string, string> = {
    done: "✓",
    running: "⟳",
    failed: "✗",
    pending: "·",
  };
  return (
    <span className={`text-xs font-mono ${scrapeColor(status)}`}>
      {icons[status] ?? "·"} {status}
    </span>
  );
}
