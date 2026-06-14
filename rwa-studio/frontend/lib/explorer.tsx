"use client";
import { ExternalLink } from "lucide-react";

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.testnet.chain.robinhood.com";

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function explorerTxUrl(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function truncateAddr(addr: string | null | undefined, chars = 4): string {
  if (!addr) return "—";
  return `${addr.slice(0, 2 + chars)}...${addr.slice(-chars)}`;
}

export function AddressLink({ address, chars = 6 }: { address: string | null | undefined; chars?: number }) {
  if (!address) return <span className="text-[var(--color-text-muted)]">—</span>;
  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-emerald-600 hover:underline inline-flex items-center gap-1"
    >
      {truncateAddr(address, chars)}
      <ExternalLink size={10} />
    </a>
  );
}

export function TxLink({ hash, label = "View" }: { hash: string | undefined; label?: string }) {
  if (!hash) return null;
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      {label}
    </a>
  );
}
