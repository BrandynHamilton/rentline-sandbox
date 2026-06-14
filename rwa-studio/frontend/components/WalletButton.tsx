"use client";
import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, useBalance } from "wagmi";
import { useState, useRef, useEffect } from "react";
import { Wallet, ChevronDown, LogOut, AlertTriangle, Copy, Check, ExternalLink, Droplets } from "lucide-react";
import { TARGET_CHAIN_ID, targetChain, FAUCET_URL } from "@/lib/wagmi";
import { truncateAddr } from "@/lib/utils";

export default function WalletButton({ compact }: { compact?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wrongNetwork = isConnected && chainId !== TARGET_CHAIN_ID;
  const { data: balance } = useBalance({ address, chainId: TARGET_CHAIN_ID, query: { enabled: isConnected && !wrongNetwork } });
  const lowBalance = isConnected && !wrongNetwork && balance && balance.value === 0n;
  const [open, setOpen] = useState(false);
  const [connectorMenuOpen, setConnectorMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Surface connection errors to console
  useEffect(() => {
    if (connectError) console.error("[WalletButton] connect error:", connectError);
  }, [connectError]);

  // Debug: log available connectors once on mount
  useEffect(() => {
    console.log("[WalletButton] connectors:", connectors.map(c => ({ id: c.id, name: c.name, type: c.type })));
  }, [connectors]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConnectorMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setConnectorMenuOpen(v => !v)}
          disabled={isPending}
          className={`${compact
            ? "flex items-center justify-center w-7 h-7 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-blue-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] transition-colors cursor-pointer disabled:opacity-50"
            : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-blue-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-sm text-[var(--color-text)] transition-colors cursor-pointer disabled:opacity-50"
          }`}
        >
          <Wallet size={compact ? 14 : 14} className="text-[var(--color-blue)]" />
          {!compact && (isPending ? "Connecting…" : "Connect Wallet")}
        </button>

        {connectorMenuOpen && (
          <div className={`absolute ${compact ? "left-0" : "right-0"} top-full mt-1.5 w-52 bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 overflow-hidden`}>
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider px-3 pt-3 pb-1">
              Select wallet
            </p>
            {connectors.map(connector => (
              <button
                key={connector.id}
                onClick={() => {
                  console.log("[WalletButton] connecting with:", connector.id, connector.name);
                  connect({ connector });
                  setConnectorMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--sidebar-accent)] transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded bg-[var(--color-muted)] flex items-center justify-center text-[10px]">
                  {connector.name.slice(0, 2)}
                </span>
                {connector.name}
              </button>
            ))}
            {connectError && (
              <p className="px-3 py-2 text-[11px] text-red-600 border-t border-[var(--color-border)]">
                {connectError.message}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`transition-colors cursor-pointer ${
          compact
            ? `flex items-center justify-center w-7 h-7 rounded-lg border ${
                wrongNetwork
                  ? "border-amber-600 bg-amber-500/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)]"
              }`
            : `flex items-center gap-1.5 w-full px-3 py-2 rounded-lg border text-sm ${
                wrongNetwork
                  ? "border-amber-600 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                  : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)]"
              }`
        }`}
      >
        {wrongNetwork
          ? <AlertTriangle size={compact ? 14 : 13} className="text-amber-600" />
          : compact
            ? <Wallet size={14} className="text-emerald-600" />
            : <span className="w-2 h-2 rounded-full bg-emerald-400" />
        }
        {!compact && (
          <>
            <span className="font-mono text-xs">
              {wrongNetwork ? "Wrong Network" : truncateAddr(address)}
            </span>
            <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {open && (
        <div className={`absolute ${compact ? "left-0" : "right-0"} top-full mt-1.5 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 overflow-hidden`}>
          {/* Address display */}
          <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border)]">
            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1">Connected</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-[var(--color-text)] flex-1 truncate">{address}</p>
              <button onClick={copyAddress} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer">
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              </button>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              {chainId === TARGET_CHAIN_ID ? targetChain.name : `Chain ${chainId}`}
            </p>
          </div>

          {/* Wrong network warning */}
          {wrongNetwork && (
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <button
                onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                className="w-full flex items-center gap-2 text-xs text-amber-600 hover:text-amber-100 cursor-pointer"
              >
                <AlertTriangle size={12} />
                Switch to {targetChain.name}
              </button>
            </div>
          )}

          {/* Faucet link for low balance */}
          {lowBalance && (
            <div className="px-4 py-3 border-b border-[var(--color-border)]">
              <a
                href={`${FAUCET_URL}/?address=${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-600 transition-colors"
              >
                <Droplets size={12} />
                Get free test RBH from faucet
                <ExternalLink size={10} className="ml-auto opacity-60" />
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut size={13} />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
