"use client";
import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from "wagmi";
import { useAuth } from "@clerk/nextjs";
import { parseUnits, decodeEventLog, type Log } from "viem";
import { api, Property, ValuationSource, CapitalStackConfig } from "@/lib/api";
import { formatUsd, bpsToPercent, timeAgo } from "@/lib/utils";
import { explorerAddressUrl, explorerTxUrl, truncateAddr, AddressLink, TxLink } from "@/lib/explorer";
import { StatusBadge, ScrapeBadge } from "@/components/Badges";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { PageLoader } from "@/components/Spinner";
import {
  PROPERTY_TOKEN_FACTORY_ABI, PROPERTY_TOKEN_FACTORY_ADDRESS,
  SECURITY_TOKEN_FACTORY_ABI, SECURITY_TOKEN_FACTORY_ADDRESS,
  PROPERTY_NFT_FACTORY_ABI,  PROPERTY_NFT_FACTORY_ADDRESS,
  CRE_FACTORY_ABI,           CRE_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import CREDeployWizard from "@/app/(dashboard)/wallet/mint/CREDeployWizard";
import {
  ArrowLeft, RefreshCw, ExternalLink, Zap, BarChart2,
  Coins, Settings, Trash2, RotateCcw, Plus, Wallet, CheckCircle2,
} from "lucide-react";

// ── Sub-components ────────────────────────────────────────────────────────────

function ValuationPanel({ geo_id, sources, onRefresh }: {
  geo_id: string;
  sources: ValuationSource[];
  onRefresh: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [avmLoading, setAvmLoading] = useState(false);
  const [err, setErr] = useState("");

  const setPrimary = async (id: number) => {
    setLoading(true);
    try { await api.valuations.setPrimary(geo_id, id); onRefresh(); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  const triggerAVM = async () => {
    setAvmLoading(true);
    try { await api.valuations.fetch(geo_id); onRefresh(); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : "AVM fetch failed"); }
    finally { setAvmLoading(false); }
  };

  const addManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.valuations.addManual(geo_id, parseFloat(manualValue), manualNotes || undefined);
      setManualOpen(false);
      setManualValue("");
      setManualNotes("");
      onRefresh();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  const sourceColors: Record<string, string> = {
    scrape:  "text-amber-600",
    zillow:  "text-blue-600",
    attom:   "text-purple-600",
    manual:  "text-emerald-600",
  };

  return (
    <Card>
      <CardHeader
        title="Valuations"
        subtitle="AVM sources — pick one as primary"
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={triggerAVM} loading={avmLoading}>
              <Zap size={12} /> Fetch AVM
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setManualOpen(true)}>
              <Plus size={12} /> Manual
            </Button>
          </div>
        }
      />

      {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

      {sources.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)] py-2">No valuation sources yet.</p>
      ) : (
        <div className="space-y-2">
          {sources.map(vs => (
            <div
              key={vs.id}
              className={`flex items-center justify-between p-2.5 rounded-lg border
                ${vs.is_primary ? "border-emerald-700 bg-emerald-500/5" : "border-[var(--color-border)]"}`}
            >
              <div>
                <span className={`text-xs font-mono font-semibold uppercase ${sourceColors[vs.source] ?? "text-[var(--color-text-secondary)]"}`}>
                  {vs.source}
                </span>
                <p className="text-sm font-semibold text-[var(--color-text)] mt-0.5">{formatUsd(vs.avm_value)}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{timeAgo(vs.fetched_at)}</p>
              </div>
              {vs.is_primary ? (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-600 px-2 py-0.5 rounded-full">Primary</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setPrimary(vs.id)} loading={loading}>
                  Set primary
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Add Manual Valuation">
        <form onSubmit={addManual} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Value (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm">$</span>
              <input
                type="number" required
                value={manualValue} onChange={e => setManualValue(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-7 pr-4 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]"
                placeholder="850000"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Notes (optional)</label>
            <input
              value={manualNotes} onChange={e => setManualNotes(e.target.value)}
              placeholder="Broker opinion / appraisal"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-blue)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={loading}>Add &amp; Set Primary</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

function CreateRentlineButton({ geo_id, onCreated, property }: { geo_id: string; onCreated: (rentlinePropertyId: string) => void; property: Property }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { getToken } = useAuth();

  const handleClick = async () => {
    setCreating(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const rentlineUrl = process.env.NEXT_PUBLIC_RENTLINE_URL || "http://localhost:6531";
      const resp = await fetch(`${rentlineUrl}/api/properties`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: property.display_address || geo_id,
          wallet_address: "0x0000000000000000000000000000000000000000",
          street_address: property.display_address || null,
          city: property.display_city || null,
          state: property.display_state || null,
          zip_code: null,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Rentline error ${resp.status}: ${err}`);
      }

      const result = await resp.json();
      onCreated(result.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create Rentline property");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <button onClick={handleClick} disabled={creating}
        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline underline-offset-2 decoration-[var(--color-border)] disabled:opacity-40 cursor-pointer">
        {creating ? "Creating in Rentline…" : "Create in Rentline"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function TokenPanel({ geo_id, prop, onRefresh }: { geo_id: string; prop: Property; onRefresh: () => void }) {
  const { address: walletAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [deployOpen, setDeployOpen] = useState(false);
  const [tokenType, setTokenType] = useState<"property" | "cre" | "nft">("property");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverAddr, setRecoverAddr] = useState("");
  const [recoverManual, setRecoverManual] = useState(false);
  const [recoverErr, setRecoverErr] = useState("");
  const [pushOpen, setPushOpen] = useState(false);
  const [rentlinePropId, setRentlinePropId] = useState("");
  const [pushTokenAddr, setPushTokenAddr] = useState("");
  const [pushCustom, setPushCustom] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleVerify = async (tokenType: string, address: string) => {
    setVerifying(address);
    try { await api.tokens.verify(geo_id, tokenType, address); }
    catch { /* ignore */ }
    finally { setVerifying(null); }
  };

  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const metadataUri = `${base}/metadata/${geo_id}.json`;
  const defaultName = prop.display_address || geo_id;
  const defaultPhys = prop.display_address || "";

  const [propName,   setPropName]   = useState(defaultName);
  const [physAddr,   setPhysAddr]   = useState(defaultPhys);
  const [usdcAddr,   setUsdcAddr]   = useState(process.env.NEXT_PUBLIC_USDC_TOKEN ?? "");
  const [supply,     setSupply]     = useState("1000000");
  const [creName,    setCreName]    = useState(`${defaultName} CRE Token`);
  const [creSymbol,  setCreSymbol]  = useState("");
  const [creUsdcAddr, setCreUsdcAddr] = useState(process.env.NEXT_PUBLIC_USDC_TOKEN ?? "");

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  // After tx confirmed: decode the Created event → register address with backend
  useEffect(() => {
    if (!confirmed || !receipt || !txHash) return;

    // Pick the right ABI and event name for the current token type
    const abiMap = {
      property: { abi: PROPERTY_TOKEN_FACTORY_ABI, event: "PropertyTokenCreated" },
      nft:      { abi: PROPERTY_NFT_FACTORY_ABI,   event: "PropertyNFTCreated"    },
      cre:      { abi: CRE_FACTORY_ABI,             event: "CRESystemCreated"      },
    } as const;
    const { abi, event: eventName } = abiMap[tokenType];

    let deployedAddress: string | undefined;
    for (const log of receipt.logs as Log[]) {
      try {
        const decoded = decodeEventLog({ abi, eventName, topics: log.topics, data: log.data });
        const args = decoded.args as Record<string, unknown>;
        // All factory Created events have tokenAddress or securityToken as first indexed arg
        deployedAddress = (args.tokenAddress ?? args.securityToken) as string | undefined;
        if (deployedAddress) break;
      } catch { /* wrong log, skip */ }
    }

    if (deployedAddress) {
      api.tokens.register(geo_id, tokenType, deployedAddress, txHash)
        .then(onRefresh)
        .catch(console.error);
    } else {
      // Fallback: just refresh — backend may pick it up another way
      onRefresh();
    }
  }, [confirmed]);

  const recoverCRE = async () => {
    setRecovering(true);
    setRecoverErr("");
    try {
      // Query last deployed SecurityToken from the CRE factory
      const total = await publicClient!.readContract({
        address: CRE_FACTORY_ADDRESS,
        abi: CRE_FACTORY_ABI,
        functionName: "totalDeployed",
      }) as bigint;
      if (total <= 0n) { setRecoverErr("No CRE systems found on the factory."); setRecovering(false); return; }
      const secTok = await publicClient!.readContract({
        address: CRE_FACTORY_ADDRESS,
        abi: CRE_FACTORY_ABI,
        functionName: "allTokens",
        args: [total - 1n],
      }) as string;
      if (!secTok || secTok === "0x0000000000000000000000000000000000000000") {
        setRecoverErr("Last deployed token is zero address."); setRecovering(false); return;
      }
      await api.tokens.register(geo_id, "cre", secTok);
      await onRefresh();
    } catch (e: unknown) {
      setRecoverErr(e instanceof Error ? e.message : "Recovery failed. Try entering the address manually.");
    } finally {
      setRecovering(false);
    }
  };

  const submitRecoverManual = async () => {
    const a = recoverAddr.trim();
    if (!a.startsWith("0x") || a.length !== 42) { setRecoverErr("Enter a valid 0x-prefixed address"); return; }
    setRecovering(true);
    setRecoverErr("");
    try {
      await api.tokens.register(geo_id, "cre", a);
      await onRefresh();
    } catch (e: unknown) {
      setRecoverErr(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setRecovering(false);
    }
  };

  const handleDeploy = () => {
    reset();
    if (tokenType === "property") {
      if (!PROPERTY_TOKEN_FACTORY_ADDRESS) { console.error("PROPERTY_TOKEN_FACTORY_ADDRESS not set"); return; }
      writeContract({
        address: PROPERTY_TOKEN_FACTORY_ADDRESS, abi: PROPERTY_TOKEN_FACTORY_ABI,
        functionName: "create",
        args: [propName, physAddr, usdcAddr as `0x${string}`, metadataUri, parseUnits(supply || "0", 18)],
      });
    } else if (tokenType === "nft") {
      if (!PROPERTY_NFT_FACTORY_ADDRESS) { console.error("PROPERTY_NFT_FACTORY_ADDRESS not set"); return; }
      writeContract({
        address: PROPERTY_NFT_FACTORY_ADDRESS, abi: PROPERTY_NFT_FACTORY_ABI,
        functionName: "create",
        args: [propName, physAddr, usdcAddr as `0x${string}`, metadataUri],
      });
    } else {
      if (!CRE_FACTORY_ADDRESS) { console.error("CRE_FACTORY_ADDRESS not set"); return; }
      writeContract({
        address: CRE_FACTORY_ADDRESS, abi: CRE_FACTORY_ABI,
        functionName: "create",
        args: [creName, creSymbol, creUsdcAddr as `0x${string}`, metadataUri],
      });
    }
  };

  const onClose = () => { setDeployOpen(false); reset(); };
  const anyDeployed = prop.property_token_address || prop.security_token_address || prop.nft_token_address;

  return (
    <Card>
      <CardHeader title="Token Contracts" subtitle="Deploy on-chain tokens for this property" />
      <div className="space-y-3">

        {/* Status grid */}
        <div className="grid grid-cols-3 gap-3">
          <TokenCell
            label="PropertyToken (ERC-20)"
            address={prop.property_token_address}
            color="emerald"
            tokenType="property"
            verifying={verifying}
            onVerify={handleVerify}
          />
          <TokenCell
            label="SecurityToken (CRE)"
            address={prop.security_token_address}
            color="purple"
            tokenType="security"
            verifying={verifying}
            onVerify={handleVerify}
          />
          <TokenCell
            label="PropertyNFT (ERC-721)"
            address={prop.nft_token_address}
            color="blue"
            tokenType="nft"
            verifying={verifying}
            onVerify={handleVerify}
          />
        </div>

        {!isConnected ? (
          <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5"><Wallet size={12} /> Connect wallet to deploy tokens</p>
        ) : (
          <Button variant={anyDeployed ? "secondary" : "primary"} size="sm"
            disabled={!prop.primary_value} onClick={() => setDeployOpen(true)}>
            <Coins size={13} /> {anyDeployed ? "Deploy Another" : "Deploy Token"}
          </Button>
        )}
        {!prop.primary_value && (
          <p className="text-xs text-amber-500">Set a valuation before deploying.</p>
        )}

        {/* Recover already-deployed CRE that wasn't registered */}
        {!prop.security_token_address && prop.property_token_address && (
          <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={recoverCRE} disabled={recovering}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline underline-offset-2 decoration-[var(--color-border)] disabled:opacity-40 cursor-pointer">
                {recovering ? "Checking factory…" : "Recover existing CRE"}
              </button>
              <button onClick={() => setRecoverManual(!recoverManual)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline underline-offset-2 decoration-[var(--color-border)] cursor-pointer">
                enter address
              </button>
            </div>
            {recoverErr && <p className="text-xs text-amber-600">{recoverErr}</p>}
            {recoverManual && (
              <div className="flex gap-2">
                <input value={recoverAddr} onChange={e => setRecoverAddr(e.target.value)}
                  placeholder="0x…"
                  className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-blue)]" />
                <button onClick={submitRecoverManual} disabled={recovering}
                  className="text-xs bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] border border-[var(--color-border)] rounded px-3 py-1.5 text-[var(--color-text)] disabled:opacity-40 cursor-pointer">
                  Register
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create in Rentline + Push to Rentline */}
        {prop.status === "ready" && !prop.property_token_address && (
          <div className="border-t border-[var(--color-border)] pt-3">
            <CreateRentlineButton geo_id={geo_id} property={prop} onCreated={(rlpId) => {
              setRentlinePropId(rlpId);
              setPushOpen(true); setPushResult(null); setPushCustom(false);
            }} />
          </div>
        )}
        {prop.property_token_address && (
          <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
            <CreateRentlineButton geo_id={geo_id} property={prop} onCreated={(rlpId) => {
              setRentlinePropId(rlpId);
              setPushOpen(true); setPushResult(null); setPushCustom(false);
            }} />
            <button onClick={() => {
              setPushOpen(true); setPushResult(null); setRentlinePropId(""); setPushCustom(false);
              setPushTokenAddr(prop.property_token_address || prop.security_token_address || prop.nft_token_address || "");
            }}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline underline-offset-2 decoration-[var(--color-border)] cursor-pointer">
              Push to Rentline
            </button>
          </div>
        )}
      </div>

      <Modal open={pushOpen} onClose={() => setPushOpen(false)} title="Push Token to Rentline" width="max-w-sm">
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            Register a deployed token with Rentline&#39;s treasury engine so rent payments flow through to token holders.
          </p>

          {/* Token address selector */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1.5">Token Address</label>
            <div className="space-y-1.5">
              {([
                { label: "PropertyToken (ERC-20)", addr: prop.property_token_address, color: "text-emerald-600" },
                { label: "SecurityToken (CRE)",     addr: prop.security_token_address, color: "text-purple-600" },
                { label: "PropertyNFT (ERC-721)",   addr: prop.nft_token_address,      color: "text-blue-600" },
              ] as const).filter(t => t.addr).map(t => (
                <button key={t.addr} type="button" onClick={() => { setPushTokenAddr(t.addr!); setPushCustom(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer
                    ${!pushCustom && pushTokenAddr === t.addr
                      ? "border-[var(--color-border-strong)] bg-[var(--color-surface)] " + t.color
                      : "border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${!pushCustom && pushTokenAddr === t.addr ? "bg-current" : "bg-[var(--color-surface-raised)]"}`} />
                  <span className="font-mono">{t.label}</span>
                </button>
              ))}
              <button type="button" onClick={() => { setPushTokenAddr(""); setPushCustom(true); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer
                  ${pushCustom
                    ? "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/50 text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)]"}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${pushCustom ? "bg-[var(--color-surface)]" : "bg-[var(--color-surface-raised)]"}`} />
                Custom address
              </button>
              {pushCustom && (
                <input value={pushTokenAddr} onChange={e => setPushTokenAddr(e.target.value)}
                  placeholder="0x…"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-xs font-mono text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-blue)]" />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Rentline Property ID *</label>
            <input value={rentlinePropId} onChange={e => setRentlinePropId(e.target.value)}
              placeholder="prop-abc123"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-2 text-sm font-mono text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-blue)]" />
          </div>
          {pushResult && (
            <p className={`text-xs rounded px-3 py-2 ${pushResult.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
              {pushResult.msg}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPushOpen(false)}>Close</Button>
            <Button variant="primary" loading={pushing} disabled={!rentlinePropId || !pushTokenAddr}
              onClick={async () => {
                setPushing(true);
                setPushResult(null);
                try {
                  await api.tokens.pushRentline(geo_id, rentlinePropId, pushTokenAddr || undefined);
                  setPushResult({ ok: true, msg: "Token pushed to Rentline successfully." });
                } catch (e: unknown) {
                  setPushResult({ ok: false, msg: e instanceof Error ? e.message : "Push failed." });
                } finally {
                  setPushing(false);
                }
              }}>
              Push
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={deployOpen} onClose={onClose} title="Deploy Token" width="max-w-xl">
        {confirmed && txHash ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600 font-semibold">Token deployed!</p>
            <div className="bg-[var(--color-surface)] rounded-lg p-3 space-y-1 text-xs font-mono">
              <p className="text-[var(--color-text-secondary)]">Tx: <span className="text-[var(--color-text)]">{truncateAddr(txHash, 10)}</span></p>
              <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                className="text-emerald-600 hover:underline text-xs">View on Explorer</a>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              The token address will appear in the registry once the block is indexed. Open Rentline Sandbox to manage it.
            </p>
            <Button variant="secondary" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Token type tabs */}
            <div className="flex rounded-lg border border-[var(--color-border)] p-1 gap-1 w-fit">
              {(["property", "cre", "nft"] as const).map(t => (
                <button key={t} type="button" onClick={() => setTokenType(t)}
                  className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer
                    ${tokenType === t ? "bg-[var(--color-surface-raised)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}>
                  {t === "property" ? "PropertyToken" : t === "cre" ? "CRE System" : "PropertyNFT"}
                </button>
              ))}
            </div>

            {/* Description */}
            <p className="text-xs text-[var(--color-text-muted)]">
              {tokenType === "property"
                ? "Fractional ERC-20 — your wallet becomes propertyOwner and receives the initial supply."
                : tokenType === "nft"
                ? "ERC-721 deed — 1 NFT minted to your wallet with a USDC yield vault."
                : "CRE system — deploys SecurityToken, DistributionManager, and InvestorRegistry in sequence."}
            </p>

            {/* Auto-filled read-only fields */}
            <div className="bg-[var(--color-surface)] rounded-lg px-3 py-2 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Metadata URI</span><span className="font-mono text-[var(--color-text-secondary)] truncate ml-2 max-w-[260px]">{metadataUri}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Valuation</span><span className="text-[var(--color-text)]">{prop.primary_value ? formatUsd(prop.primary_value) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-[var(--color-text-muted)]">Deploying as</span><span className="font-mono text-[var(--color-text)]">{walletAddress ? truncateAddr(walletAddress, 8) : "—"}</span></div>
            </div>

            {/* Token-type-specific fields */}
            {tokenType === "property" && (
              <div className="space-y-3">
                <Field label="Property Name" value={propName} onChange={setPropName} placeholder={geo_id} />
                <Field label="Physical Address" value={physAddr} onChange={setPhysAddr} placeholder="123 Main St" />
                <Field label="USDC Address *" value={usdcAddr} onChange={setUsdcAddr} placeholder="0x…" mono />
                <div>
                  <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Initial Supply</label>
                  <input type="number" value={supply} onChange={e => setSupply(e.target.value)}
                    className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]" />
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">Minted to your wallet at 18 decimals.</p>
                </div>
              </div>
            )}
            {tokenType === "nft" && (
              <div className="space-y-3">
                <Field label="Property Name" value={propName} onChange={setPropName} placeholder={geo_id} />
                <Field label="Physical Address" value={physAddr} onChange={setPhysAddr} placeholder="123 Main St" />
                <Field label="USDC Address * (yield vault)" value={usdcAddr} onChange={setUsdcAddr} placeholder="0x…" mono />
                <p className="text-xs text-blue-600 bg-blue-500/10 border border-blue-700/30 rounded px-3 py-2">
                  1 NFT (tokenId = 0) minted to your wallet. NFT holder receives 100% of vault yield.
                </p>
              </div>
            )}
            {tokenType === "cre" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Token Name *" value={creName} onChange={setCreName} placeholder="123 Main St CRE Token" />
                  <Field label="Symbol *" value={creSymbol} onChange={setCreSymbol} placeholder="123MAIN-SEC" mono />
                </div>
                <Field label="USDC Address * (for DistributionManager)" value={creUsdcAddr} onChange={setCreUsdcAddr} placeholder="0x…" mono />
                {creName && creSymbol && creUsdcAddr ? (
                  <CREDeployWizard
                    metadataUri={metadataUri}
                    tokenName={creName}
                    tokenSymbol={creSymbol}
                    usdcAddr={creUsdcAddr}
                    onComplete={(addrs) => {
                      api.tokens.register(geo_id, "cre", addrs.securityToken)
                        .then(() => { onRefresh(); onClose(); });
                    }}
                  />
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">Fill Token Name, Symbol, and USDC Address above to continue.</p>
                )}
              </div>
            )}

            {writeError && (
              <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                {writeError.message.slice(0, 200)}
              </p>
            )}

            {tokenType !== "cre" && (
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="primary" loading={isPending || confirming}
                  disabled={tokenType === "property" && !usdcAddr}
                  onClick={handleDeploy}>
                  <Zap size={13} />
                  {isPending ? "Awaiting signature…" : confirming ? "Confirming…" : "Deploy via Wallet"}
                </Button>
              </div>
            )}
            {tokenType === "cre" && !creName || tokenType === "cre" && !creSymbol || tokenType === "cre" && !creUsdcAddr ? (
              <div className="flex justify-end pt-1">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </Card>
  );
}

function CapitalStackPanel({ geo_id, prop }: { geo_id: string; prop: Property }) {
  const [config, setConfig] = useState<CapitalStackConfig | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [prefReturn, setPrefReturn] = useState("800");
  const [promote, setPromote] = useState("2000");
  const [threshold, setThreshold] = useState("0");
  const [target, setTarget] = useState("");
  const [minInvest, setMinInvest] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (prop.security_token_address) {
      api.capitalStack.getConfig(geo_id).then(setConfig).catch(() => {});
    }
  }, [geo_id, prop.security_token_address]);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr("");
    try {
      const c = await api.capitalStack.setConfig(geo_id, {
        preferred_return_bps: parseInt(prefReturn),
        sponsor_promote_bps: parseInt(promote),
        waterfall_threshold: parseFloat(threshold),
        equity_raise_target: target ? parseFloat(target) : undefined,
        min_investment_usd: minInvest ? parseFloat(minInvest) : undefined,
      });
      setConfig(c); setConfigOpen(false);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Error"); }
    finally { setLoading(false); }
  };

  if (!prop.security_token_address) return null;

  return (
    <Card>
      <CardHeader
        title="Capital Stack"
        subtitle="CRE waterfall configuration"
        action={
          <Button size="sm" variant="ghost" onClick={() => setConfigOpen(true)}>
            <Settings size={12} /> {config ? "Edit" : "Configure"}
          </Button>
        }
      />

      {config ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Preferred Return" value={bpsToPercent(config.preferred_return_bps)} />
          <Stat label="Sponsor Promote" value={bpsToPercent(config.sponsor_promote_bps)} />
          <Stat label="Waterfall Threshold" value={formatUsd(config.waterfall_threshold)} />
          {config.equity_raise_target && <Stat label="Raise Target" value={formatUsd(config.equity_raise_target)} />}
          {config.min_investment_usd && <Stat label="Min Investment" value={formatUsd(config.min_investment_usd)} />}
          {config.distribution_manager_address && (
            <div>
              <p className="text-xs text-[var(--color-text-muted)] mb-0.5">DistributionManager</p>
              <a href={explorerAddressUrl(config.distribution_manager_address)} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-purple-600 hover:underline">{truncateAddr(config.distribution_manager_address, 6)}</a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">No waterfall configuration yet.</p>
      )}

      <Modal open={configOpen} onClose={() => setConfigOpen(false)} title="Capital Stack Config">
        <form onSubmit={saveConfig} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Preferred Return (BPS)" value={prefReturn} onChange={setPrefReturn} type="number" placeholder="800" />
            <Field label="Sponsor Promote (BPS)" value={promote} onChange={setPromote} type="number" placeholder="2000" />
          </div>
          <Field label="Waterfall Threshold (USD)" value={threshold} onChange={setThreshold} type="number" placeholder="0" />
          <Field label="Equity Raise Target (USD)" value={target} onChange={setTarget} type="number" placeholder="5000000" />
          <Field label="Min Investment (USD)" value={minInvest} onChange={setMinInvest} type="number" placeholder="25000" />
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setConfigOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={loading}>Save Config</Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// Tiny reusable input helper
function Field({ label, value, onChange, placeholder, type = "text", mono = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-blue)] ${mono ? "font-mono" : ""}`} />
    </div>
  );
}

const TOKEN_CELL_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-700", bg: "bg-emerald-500/5", text: "text-emerald-600" },
  purple:  { border: "border-purple-700",  bg: "bg-purple-500/5",  text: "text-purple-600" },
  blue:    { border: "border-blue-700",    bg: "bg-blue-500/5",    text: "text-blue-600" },
};

function TokenCell({ label, address, color, tokenType, verifying, onVerify }: {
  label: string;
  address: string | null;
  color: string;
  tokenType: string;
  verifying: string | null;
  onVerify: (tokenType: string, address: string) => void;
}) {
  const s = TOKEN_CELL_STYLES[color] ?? TOKEN_CELL_STYLES.emerald;
  return (
    <div className={`p-3 rounded-lg border ${address ? s.border + " " + s.bg : "border-[var(--color-border)]"}`}>
      <p className="text-xs text-[var(--color-text-muted)] mb-1">{label}</p>
      {address ? (
        <div className="flex items-center gap-1.5">
          <a href={explorerAddressUrl(address)} target="_blank" rel="noopener noreferrer"
            className={`text-xs font-mono ${s.text} hover:underline`}>
            {truncateAddr(address, 6)}
          </a>
          <button onClick={() => onVerify(tokenType, address)} disabled={verifying === address}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 cursor-pointer">
            <CheckCircle2 size={12} />
          </button>
        </div>
      ) : <p className="text-xs text-[var(--color-text-muted)]">Not deployed</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ geo_id: string }>;
}) {
  const { geo_id } = use(params);
  const router = useRouter();
  const [prop, setProp] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [valueOpen, setValueOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [valueReason, setValueReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scrapeDoneNoValue, setScrapeDoneNoValue] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.properties.get(geo_id)
      .then(setProp)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [geo_id]);

  useEffect(() => { load(); }, [load]);

  // Poll while scraping
  useEffect(() => {
    if (!prop || !["pending", "running"].includes(prop.scrape_status)) return;
    const id = setInterval(() => {
      api.properties.status(geo_id).then(s => {
        if (s.scrape_status === "done" || s.scrape_status === "failed") {
          clearInterval(id);
          load();
          // If scrape finished without a value, prompt user to enter one
          if (s.scrape_status === "done" && !s.primary_value) {
            setScrapeDoneNoValue(true);
            setValueOpen(true);
          }
        }
      }).catch(() => clearInterval(id));
    }, 3000);
    return () => clearInterval(id);
  }, [prop, geo_id, load]);

  if (loading) return <PageLoader />;
  if (!prop) return <p className="text-[var(--color-text-muted)]">Property not found.</p>;

  const meta = prop.display_address
    ? [prop.display_address, prop.display_city, prop.display_state].filter(Boolean).join(", ")
    : prop.geo_id;

  const handleSetValue = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.properties.setValue(geo_id, parseFloat(newValue), valueReason || undefined);
      setValueOpen(false); setNewValue(""); setValueReason("");
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this property? This cannot be undone.")) return;
    setDeleting(true);
    try { await api.properties.delete(geo_id); router.push("/properties"); }
    catch (e) { console.error(e); setDeleting(false); }
  };

  const retriggerScrape = async () => {
    await api.properties.retriggerScrape(geo_id);
    load();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link href="/properties" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[var(--color-text)] truncate">{meta}</h1>
            <StatusBadge status={prop.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-muted)]">
            <span className="font-mono">{prop.geo_id}</span>
            <span>·</span>
            <ScrapeBadge status={prop.scrape_status} />
            {prop.source_url && (
              <>
                <span>·</span>
                <a href={prop.source_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-[var(--color-text)]">
                  Source <ExternalLink size={10} />
                </a>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw size={13} />
          </Button>
          {prop.scrape_status === "failed" && (
            <Button size="sm" variant="ghost" onClick={retriggerScrape}>
              <RotateCcw size={13} /> Retry scrape
            </Button>
          )}
          {prop.status !== "deployed" && (
            <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>

      {/* Scrape banner */}
      {(prop.scrape_status === "pending" || prop.scrape_status === "running") && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <p className="text-sm text-amber-600">
            Scrape job {prop.scrape_status === "running" ? "in progress" : "pending"} — extracting property data from source URL…
          </p>
        </div>
      )}
      {prop.scrape_status === "failed" && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-red-600">
            Scrape failed. Set a value manually below or retry the scrape.
          </p>
        </div>
      )}
      {scrapeDoneNoValue && (
        <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3">
          <p className="text-sm text-blue-600">
            Scrape completed but couldn&apos;t extract a price from the source URL.
            Enter the value you see on the listing page below.
          </p>
          <button onClick={() => setScrapeDoneNoValue(false)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] ml-auto shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <div className="flex items-start justify-between">
            <Stat label="Primary Value" value={formatUsd(prop.primary_value)} />
            <Button size="sm" variant="ghost" onClick={() => setValueOpen(true)}>
              <Settings size={12} />
            </Button>
          </div>
        </Card>
        <Card>
          <Stat
            label="Valuation Sources"
            value={prop.valuation_sources.length}
            sub={prop.valuation_sources.find(s => s.is_primary)?.source ?? "none primary"}
          />
        </Card>
        <Card>
          <Stat
            label="PropertyToken"
            value={prop.property_token_address ? <AddressLink address={prop.property_token_address} /> : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="SecurityToken"
            value={prop.security_token_address ? <AddressLink address={prop.security_token_address} /> : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="PropertyNFT"
            value={prop.nft_token_address ? <AddressLink address={prop.nft_token_address} /> : "—"}
          />
        </Card>
      </div>

      {/* Two-col layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left */}
        <div className="space-y-4">
          {/* Property details */}
          <Card>
            <CardHeader title="Property Details" />
            {prop.display_address ? (
              <div className="space-y-2 text-sm">
                <Row label="Address" value={prop.display_address} />
                <Row label="City / State" value={[prop.display_city, prop.display_state].filter(Boolean).join(", ")} />
                <Row label="Type" value={prop.property_type || "—"} />
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)]">
                No metadata yet.{" "}
                {prop.source_url
                  ? "Scrape is running or failed — retry or set manually."
                  : "Add a source URL or enter metadata manually."}
              </p>
            )}
          </Card>

          {/* Oracle JSON */}
          <Card>
            <CardHeader
              title="Oracle Metadata"
              subtitle="tokenURI endpoint consumed by the valuation feed"
              action={
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/metadata/${geo_id}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1"
                >
                  View JSON <ExternalLink size={10} />
                </a>
              }
            />
            <p className="text-xs font-mono text-[var(--color-text-muted)] break-all">
              {`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/metadata/${geo_id}.json`}
            </p>
          </Card>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <ValuationPanel geo_id={geo_id} sources={prop.valuation_sources} onRefresh={load} />
          <TokenPanel geo_id={geo_id} prop={prop} onRefresh={load} />
          <CapitalStackPanel geo_id={geo_id} prop={prop} />
        </div>
      </div>

      {/* Set Value Modal */}
      <Modal open={valueOpen} onClose={() => setValueOpen(false)} title="Override Primary Value">
        <form onSubmit={handleSetValue} className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Value (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-sm">$</span>
              <input type="number" required value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder={String(prop.primary_value ?? 850000)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-7 pr-4 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Reason (optional)</label>
            <input value={valueReason} onChange={e => setValueReason(e.target.value)}
              placeholder="Broker opinion, appraisal report…"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-blue)]" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setValueOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={saving}>Update Value</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--color-text)] text-right">{value || "—"}</span>
    </div>
  );
}
