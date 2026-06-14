"use client";
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from "wagmi";
import { parseUnits, decodeEventLog } from "viem";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  PROPERTY_TOKEN_FACTORY_ABI,  PROPERTY_TOKEN_FACTORY_ADDRESS,
  CRE_FACTORY_ABI,             CRE_FACTORY_ADDRESS,
  PROPERTY_NFT_FACTORY_ABI,    PROPERTY_NFT_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import CREDeployWizard from "./CREDeployWizard";
import { ArrowLeft, Wallet, Zap, Building2, ShieldCheck, ImageIcon, Cpu, ExternalLink } from "lucide-react";
import { explorerAddressUrl, explorerTxUrl, AddressLink, truncateAddr } from "@/lib/explorer";
import { formatUsd } from "@/lib/utils";

type TokenType = "property" | "cre" | "nft";

// ── small helpers ──────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, mono, hint, readOnly }: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; mono?: boolean; hint?: string; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{label}</label>
      <input value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder} readOnly={readOnly}
        className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm placeholder-zinc-600
          focus:outline-none focus:border-[var(--color-blue)]
          ${mono ? "font-mono" : ""}
          ${readOnly ? "text-[var(--color-text-muted)] cursor-default" : "text-[var(--color-text)]"}`} />
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

function AddressDisplay({ label, value, color = "text-[var(--color-text)]" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-mono ${color}`}><AddressLink address={value} chars={10} /></span>
        <a href={explorerAddressUrl(value)} target="_blank" rel="noopener noreferrer"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={10} /></a>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function WalletMintPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [tokenType, setTokenType] = useState<TokenType>("property");

  // ── shared ────────────────────────────────────────────────────────────────
  const [geoId,         setGeoId]         = useState("");
  const [metadataUri,   setMetadataUri]   = useState("");
  const [resolvedValue, setResolvedValue] = useState<number | null>(null);
  const [resolving,     setResolving]     = useState(false);

  // ── residential PropertyToken fields ─────────────────────────────────────
  const [propName, setPropName] = useState("");
  const [physAddr, setPhysAddr] = useState("");
  const [usdcAddr, setUsdcAddr] = useState("");
  const [supply,   setSupply]   = useState("1000000");

  // Optional DistributionAutomation
  const [withAutomation, setWithAutomation] = useState(false);
  const [minDistAmount,  setMinDistAmount]  = useState("100");  // USDC
  const [minInterval,    setMinInterval]    = useState("604800"); // 1 week in seconds
  const [deployedTokenAddr, setDeployedTokenAddr] = useState<`0x${string}` | null>(null);
  const [automationDeploying, setAutomationDeploying] = useState(false);
  const [automationAddr, setAutomationAddr] = useState<`0x${string}` | null>(null);

  // ── CRE fields ────────────────────────────────────────────────────────────
  const [creName,   setCreName]   = useState("");
  const [creSymbol, setCreSymbol] = useState("");
  // crePropertyName + crePhysAddr reuse propName + physAddr
  const [creUsdcAddr, setCreUsdcAddr] = useState("");

  // Deployed CRE system addresses (decoded from tx receipt)
  const [creSystem, setCreSystem] = useState<{
    securityToken: string; distributionManager: string;
  } | null>(null);

  // ── NFT fields ────────────────────────────────────────────────────────────
  // reuses propName, physAddr, usdcAddr

  // ── factory reads ─────────────────────────────────────────────────────────
  const { data: propTotal } = useReadContract({
    address: PROPERTY_TOKEN_FACTORY_ADDRESS, abi: PROPERTY_TOKEN_FACTORY_ABI,
    functionName: "totalDeployed", query: { enabled: !!PROPERTY_TOKEN_FACTORY_ADDRESS },
  });
  const { data: creTotal } = useReadContract({
    address: CRE_FACTORY_ADDRESS, abi: CRE_FACTORY_ABI,
    functionName: "totalDeployed", query: { enabled: !!CRE_FACTORY_ADDRESS },
  });
  const { data: nftTotal } = useReadContract({
    address: PROPERTY_NFT_FACTORY_ADDRESS, abi: PROPERTY_NFT_FACTORY_ABI,
    functionName: "totalDeployed", query: { enabled: !!PROPERTY_NFT_FACTORY_ADDRESS },
  });

  // ── write ─────────────────────────────────────────────────────────────────
  const { writeContract, data: txHash, isPending: writing, error: writeError, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // ── Automation write (second step for PropertyToken) ──────────────────────
  // DistributionAutomation cannot be deployed via browser wallet (no bytecode in wagmi).
  // After deploying PropertyToken, users should deploy DistributionAutomation via:
  //   forge script or the backend, then call setAuthorizedDistributor via Rentline Sandbox.
  const automationConfirmed = false;

  // Auto-fill metadataUri + property name from geoId
  useEffect(() => {
    if (!geoId.trim()) { setMetadataUri(""); setResolvedValue(null); return; }
    const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    setMetadataUri(`${base}/metadata/${geoId.trim()}.json`);
    setResolving(true);
    api.metadata.get(geoId.trim())
      .then((data: Record<string, unknown>) => {
        setResolvedValue(typeof data.value === "number" ? data.value : null);
        const prop = data.property as Record<string, unknown> | undefined;
        const addrBlock = prop?.address as Record<string, unknown> | undefined;
        const fullAddr = (addrBlock?.full_address ?? addrBlock?.street ?? "") as string;
        if (!propName) setPropName(geoId.trim());
        if (!physAddr && fullAddr) setPhysAddr(fullAddr);
        if (!creName) setCreName(geoId.trim());
      })
      .catch(() => setResolvedValue(null))
      .finally(() => setResolving(false));
  }, [geoId]);

  // After PropertyToken confirmed — extract token address from event and optionally deploy automation
  useEffect(() => {
    if (!confirmed || !txHash || tokenType !== "property" || !withAutomation) return;
    if (!publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: PROPERTY_TOKEN_FACTORY_ABI,
            eventName: "PropertyTokenCreated",
            data: log.data,
            topics: log.topics,
          });
          const tokenAddr = (decoded.args as Record<string, unknown>).tokenAddress as `0x${string}`;
          setDeployedTokenAddr(tokenAddr);
          break;
        } catch {}
      }
    })();
  }, [confirmed, txHash, tokenType, withAutomation]);

  // After CRE confirmed — decode CRESystemCreated event to get all 4 addresses
  useEffect(() => {
    if (!confirmed || !txHash || tokenType !== "cre") return;
    if (!publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: CRE_FACTORY_ABI,
            eventName: "CRESystemCreated",
            data: log.data,
            topics: log.topics,
          });
          const args = decoded.args as Record<string, unknown>;
          setCreSystem({
            securityToken:       args.securityToken       as string,
            distributionManager: args.distributionManager as string,
          });
        } catch {}
      }
    })();
  }, [confirmed, txHash, tokenType]);

  const handleDeploy = () => {
    if (!address || !metadataUri) return;
    reset(); setCreSystem(null); setDeployedTokenAddr(null);

    if (tokenType === "property") {
      if (!PROPERTY_TOKEN_FACTORY_ADDRESS) { console.error("PROPERTY_TOKEN_FACTORY_ADDRESS not set — check broadcast files"); return; }
      writeContract({
        address: PROPERTY_TOKEN_FACTORY_ADDRESS,
        abi: PROPERTY_TOKEN_FACTORY_ABI,
        functionName: "create",
        args: [propName || geoId, physAddr, usdcAddr as `0x${string}`, metadataUri, parseUnits(supply, 18)],
      });
    } else if (tokenType === "cre") {
      if (!CRE_FACTORY_ADDRESS) { console.error("CRE_FACTORY_ADDRESS not set — check broadcast files"); return; }
      writeContract({
        address: CRE_FACTORY_ADDRESS,
        abi: CRE_FACTORY_ABI,
        functionName: "create",
        args: [creName || geoId, creSymbol, creUsdcAddr as `0x${string}`, metadataUri],
      });
    } else {
      if (!PROPERTY_NFT_FACTORY_ADDRESS) { console.error("PROPERTY_NFT_FACTORY_ADDRESS not set — check broadcast files"); return; }
      writeContract({
        address: PROPERTY_NFT_FACTORY_ADDRESS,
        abi: PROPERTY_NFT_FACTORY_ABI,
        functionName: "create",
        args: [propName || geoId, physAddr, usdcAddr as `0x${string}`, metadataUri],
      });
    }
  };

  if (!isConnected) return (
    <div className="max-w-xl">
      <Card className="text-center py-12 space-y-4">
        <Wallet size={32} className="mx-auto text-[var(--color-text-muted)]" />
        <p className="text-[var(--color-text-secondary)] text-sm">Connect your wallet to deploy tokens from the factory.</p>
        <p className="text-xs text-[var(--color-text-muted)]">Use the Connect Wallet button in the top nav.</p>
      </Card>
    </div>
  );

  const factoryMissing =
    tokenType === "property" ? !PROPERTY_TOKEN_FACTORY_ADDRESS
    : tokenType === "cre"    ? !CRE_FACTORY_ADDRESS
    : !PROPERTY_NFT_FACTORY_ADDRESS;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/wallet" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Deploy RWA Token</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Your wallet signs the factory — you own all contracts from block 0</p>
        </div>
      </div>

      {/* Factory status */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {[
          { label: "PropertyTokenFactory", addr: PROPERTY_TOKEN_FACTORY_ADDRESS, total: propTotal, color: "emerald" },
          { label: "CREFactory",           addr: CRE_FACTORY_ADDRESS,            total: creTotal,  color: "purple"  },
          { label: "PropertyNFTFactory",   addr: PROPERTY_NFT_FACTORY_ADDRESS,   total: nftTotal,  color: "blue"    },
        ].map(({ label, addr, total, color }) => (
          <div key={label} className={`p-3 rounded-lg border ${addr ? `border-${color}-800 bg-${color}-500/5` : "border-[var(--color-border)]"}`}>
            <p className="text-[var(--color-text-muted)] mb-0.5">{label}</p>
            {addr ? <>
              <p className={`font-mono text-${color}-400 truncate`}>{addr.slice(0, 16)}…</p>
              <p className="text-[var(--color-text-muted)] mt-0.5">{total?.toString() ?? "—"} deployed</p>
            </> : <p className="text-amber-500">Not configured</p>}
          </div>
        ))}
      </div>

      {/* Token type selector */}
      <div className="flex rounded-lg border border-[var(--color-border)] p-1 gap-1 w-fit">
        {([
          ["property", "PropertyToken (Residential)", Building2,   "ERC-20 fractional + USDC vault"],
          ["cre",      "CRE System",                  ShieldCheck, "SecurityToken + DistributionManager + PropertyLLC + InvestorRegistry"],
          ["nft",      "PropertyNFT",                 ImageIcon,   "ERC-721 deed + USDC vault"],
        ] as const).map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTokenType(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer
              ${tokenType === t ? "bg-[var(--color-surface)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}>
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      {/* Description banner */}
      {tokenType === "cre" && (
        <div className="rounded-xl border border-purple-800 bg-purple-500/5 px-4 py-3 text-xs text-purple-600 space-y-1">
          <p className="font-semibold text-purple-200">CRE Full System — 4 contracts deployed in 1 transaction</p>
          <p className="text-purple-600">SecurityToken · DistributionManager · PropertyLLC · InvestorRegistry</p>
          <p className="text-purple-500">Your wallet becomes governance multisig + compliance manager. Governance contract can be added later via Rentline Sandbox.</p>
        </div>
      )}

      <Card>
        <CardHeader
          title={tokenType === "property" ? "Deploy PropertyToken" : tokenType === "cre" ? "Deploy CRE System" : "Deploy PropertyNFT"}
          subtitle={
            tokenType === "property" ? "Residential fractional ERC-20 with USDC rent vault" :
            tokenType === "cre"      ? "Full commercial real estate tokenization suite" :
                                       "Single ERC-721 deed with USDC yield vault"
          }
        />

        <div className="space-y-4">
          {/* Geo ID */}
          <div>
            <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Geo ID <span className="text-[var(--color-text-muted)]">(links to property in the registry)</span></label>
            <input value={geoId} onChange={e => setGeoId(e.target.value)} placeholder="geo-382910"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] font-mono" />
            {resolving && <p className="text-xs text-[var(--color-text-muted)] mt-1">Resolving…</p>}
            {resolvedValue !== null && <p className="text-xs text-emerald-600 mt-1">✓ Found — valuation: {formatUsd(resolvedValue)}</p>}
            {geoId && !resolving && resolvedValue === null && <p className="text-xs text-amber-500 mt-1">No metadata found — token will deploy but oracle will be empty.</p>}
          </div>

          {/* Metadata URI */}
          <Field label="Metadata URI (auto-filled from Geo ID)" value={metadataUri}
            onChange={setMetadataUri} placeholder="http://localhost:8000/metadata/geo-123.json" mono readOnly={!!geoId} />

          {/* Property info — shared across types */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Property Name" value={propName} onChange={setPropName} placeholder={geoId || "123 Main St"} />
            <Field label="Physical Address" value={physAddr} onChange={setPhysAddr} placeholder="123 Main St, City, Country" />
          </div>

          {/* Type-specific fields */}
          {tokenType === "property" && <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="USDC Address *" value={usdcAddr} onChange={setUsdcAddr} placeholder="0x…" mono />
              <div>
                <label className="block text-xs text-[var(--color-text-secondary)] mb-1">Initial Supply</label>
                <input type="number" value={supply} onChange={e => setSupply(e.target.value)} placeholder="1000000"
                  className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Minted to your wallet at 18 decimals.</p>
              </div>
            </div>
            {/* Optional automation toggle */}
            <div className="border border-[var(--color-border)] rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={withAutomation} onChange={e => setWithAutomation(e.target.checked)} className="accent-emerald-500" />
                <span className="text-xs text-[var(--color-text)] flex items-center gap-1"><Cpu size={11} /> Include Chainlink Distribution Automation <span className="text-[var(--color-text-muted)]">(optional, deployed as 2nd step)</span></span>
              </label>
              {withAutomation && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Field label="Min Distribution Amount (USDC)" value={minDistAmount} onChange={setMinDistAmount} placeholder="100" hint="Minimum vault balance before auto-distribute" />
                  <Field label="Min Interval (seconds)" value={minInterval} onChange={setMinInterval} placeholder="604800" hint="604800 = 1 week" />
                </div>
              )}
            </div>
          </>}

          {tokenType === "cre" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Token Name *" value={creName} onChange={setCreName} placeholder="123 Main St CRE Token" />
                <Field label="Symbol *" value={creSymbol} onChange={setCreSymbol} placeholder="123MAIN-SEC" mono />
              </div>
              <Field label="USDC Address * (for DistributionManager)" value={creUsdcAddr} onChange={setCreUsdcAddr} placeholder="0x…" mono />
              <p className="text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded px-3 py-2">
                Your wallet ({address?.slice(0,10)}…) will be compliance manager + governance multisig. Transfer roles via Rentline Sandbox after deployment.
              </p>
              {creName && creSymbol && creUsdcAddr && (
                <CREDeployWizard
                  metadataUri={metadataUri}
                  tokenName={creName}
                  tokenSymbol={creSymbol}
                  usdcAddr={creUsdcAddr}
                  onComplete={({ securityToken, distributionManager, investorRegistry }) => {
                    setCreSystem({ securityToken, distributionManager });
                  }}
                />
              )}
            </div>
          )}

          {tokenType === "nft" && (
            <Field label="USDC Address * (yield vault)" value={usdcAddr} onChange={setUsdcAddr} placeholder="0x…" mono />
          )}

          {/* Errors */}
          {writeError && (
            <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {writeError.message.slice(0, 300)}
            </p>
          )}

          {/* Success — PropertyToken */}
          {confirmed && txHash && tokenType === "property" && (
            <div className="bg-emerald-500/10 border border-emerald-700 rounded-lg px-4 py-3 space-y-2">
              <p className="text-sm text-emerald-600 font-semibold">PropertyToken deployed!</p>
              <p className="text-xs font-mono text-[var(--color-text-secondary)] break-all">tx: {txHash}</p>
              {withAutomation && !automationAddr && deployedTokenAddr && (
                <div className="space-y-2 pt-2 border-t border-emerald-800">
                  <p className="text-xs text-[var(--color-text)]">Now deploy DistributionAutomation and wire it to your token.</p>
                  <p className="text-xs text-[var(--color-text-muted)]">PropertyToken: <span className="font-mono"><AddressLink address={deployedTokenAddr} chars={10} /></span></p>
                  <p className="text-xs text-amber-600">Note: Deploy DistributionAutomation via <code>forge script</code> or Rentline Sandbox — browser wallets cannot deploy contracts with bytecode. After deploying, call <code>setAuthorizedDistributor(automationAddr, true)</code> on the token via Sandbox.</p>
                </div>
              )}
              <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> View on Explorer</a>
            </div>
          )}

          {/* Success — CRE System — wizard handles its own success UI */}

          {/* Success — NFT */}
          {confirmed && txHash && tokenType === "nft" && (
            <div className="bg-blue-500/10 border border-blue-700 rounded-lg px-4 py-3 space-y-1">
              <p className="text-sm text-blue-600 font-semibold">PropertyNFT deployed!</p>
              <p className="text-xs font-mono text-[var(--color-text-secondary)] break-all">tx: {txHash}</p>
              <a href={explorerTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"><ExternalLink size={11} /> View on Explorer</a>
            </div>
          )}

          {/* Deploy button — hidden for CRE since wizard handles it */}
          {tokenType !== "cre" && (
            <>
              {factoryMissing && (
                <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
                  Factory not configured. Set{" "}
                  {tokenType === "property" ? "NEXT_PUBLIC_PROPERTY_TOKEN_FACTORY" : "NEXT_PUBLIC_PROPERTY_NFT_FACTORY"}{" "}
                  in frontend/.env.local.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="primary" onClick={handleDeploy}
                  loading={writing || confirming}
                  disabled={!metadataUri || factoryMissing || (confirmed && !withAutomation)}>
                  <Zap size={13} />
                  {writing ? "Awaiting signature…" : confirming ? "Confirming…" : "Deploy via Factory"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
