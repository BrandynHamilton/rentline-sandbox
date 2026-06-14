import { PropertyStatus, ScrapeStatus } from "@/lib/api";

/** Format a USD number as $1,234,567 */
export function formatUsd(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Truncate an EVM address: 0x1234...abcd */
export function truncateAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "—";
  return `${addr.slice(0, 2 + chars)}...${addr.slice(-chars)}`;
}

/** Shorten a tx hash for display */
export function truncateTx(hash: string | null | undefined): string {
  return truncateAddr(hash, 6);
}

/** Relative time: "2 hours ago", "just now" */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Status → Tailwind color classes */
export function statusColor(status: PropertyStatus | string): string {
  switch (status) {
    case "deployed":  return "bg-emerald-100 text-emerald-800";
    case "ready":     return "bg-blue-100 text-blue-800";
    case "scraping":  return "bg-amber-100 text-amber-800";
    case "draft":     return "bg-zinc-100 text-zinc-600";
    default:          return "bg-zinc-100 text-zinc-600";
  }
}

export function scrapeColor(status: ScrapeStatus | string): string {
  switch (status) {
    case "done":     return "text-emerald-600";
    case "running":  return "text-amber-600 animate-pulse";
    case "failed":   return "text-red-500";
    default:         return "text-zinc-400";
  }
}

/** BPS → percent string: 800 → "8.00%" */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
