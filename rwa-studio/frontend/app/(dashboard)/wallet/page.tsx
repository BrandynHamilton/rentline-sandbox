"use client";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState, useEffect } from "react";
import Link from "next/link";
import { formatUnits } from "viem";
import { api } from "@/lib/api";
import {
  PROPERTY_TOKEN_ABI,
  PROPERTY_TOKEN_FACTORY_ABI, PROPERTY_TOKEN_FACTORY_ADDRESS,
  CRE_FACTORY_ABI,            CRE_FACTORY_ADDRESS,
  PROPERTY_NFT_FACTORY_ABI,  PROPERTY_NFT_FACTORY_ADDRESS,
  SECURITY_TOKEN_FACTORY_ABI, SECURITY_TOKEN_FACTORY_ADDRESS,
  PROPERTY_NFT_ABI,
  SECURITY_TOKEN_ABI,
} from "@/lib/contracts/abis";
import { useBroadcastFactories } from "@/lib/useBroadcastFactories";
import { explorerAddressUrl, AddressLink, truncateAddr } from "@/lib/explorer";
import { formatUsd, timeAgo } from "@/lib/utils";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { PageLoader } from "@/components/Spinner";
import {
  Wallet, Plus, ExternalLink, Coins, TrendingUp,
  RefreshCw, FlaskConical, Building2, ShieldCheck, ImageIcon,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

type TokenKind = "property" | "security" | "nft" | "unknown";

function kindLabel(kind: TokenKind) {
  if (kind === "property") return { label: "ERC-20",   color: "text-emerald-600", bg: "bg-emerald-500/10 border-emerald-700/40" };
  if (kind === "security") return { label: "CRE",      color: "text-purple-600",  bg: "bg-purple-500/10 border-purple-700/40"  };
  if (kind === "nft")      return { label: "ERC-721",  color: "text-blue-600",    bg: "bg-blue-500/10 border-blue-700/40"      };
  return                          { label: "Token",    color: "text-[var(--color-text-secondary)]",    bg: "bg-[var(--color-surface)] border-[var(--color-border)]"            };
}

// ── PropertyToken card ────────────────────────────────────────────────────────
function PropertyTokenCard({ tokenAddress, walletAddress, onRefresh }: {
  tokenAddress: `0x${string}`; walletAddress: `0x${string}`; onRefresh: () => void;
}) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "name" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "balanceOf",         args: [walletAddress] },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "totalSupply" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "getAvailableRewards", args: [walletAddress] },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "getVaultBalance" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "totalDistributed" },
    ],
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });
  useEffect(() => { if (confirmed) { refetch(); onRefresh(); reset(); } }, [confirmed]);

  if (isLoading) return <Card><div className="h-24 flex items-center justify-center"><PageLoader /></div></Card>;

  const [name, symbol, balance, totalSupply, pendingRewards, vaultBalance, totalDist] = data?.map(r => r.result) ?? [];
  const bal  = balance    ? formatUnits(balance    as bigint, 18) : "0";
  const sup  = totalSupply ? formatUnits(totalSupply as bigint, 18) : "0";
  const rwds = pendingRewards ? formatUnits(pendingRewards as bigint, 6) : "0";
  const vlt  = vaultBalance   ? formatUnits(vaultBalance   as bigint, 6) : "0";
  const dst  = totalDist      ? formatUnits(totalDist      as bigint, 6) : "0";
  const pct  = totalSupply && balance ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(4) : "0";
  const hasRewards = pendingRewards && (pendingRewards as bigint) > 0n;

  return (
    <Card className={hasRewards ? "border-emerald-800" : ""}>
      <TokenCardHeader tokenAddress={tokenAddress} name={name as string} symbol={symbol as string} kind="property" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Your Balance"    value={Number(bal).toLocaleString()} sub="tokens" />
        <Stat label="Ownership"       value={`${pct}%`} />
        <Stat label="Pending Rewards" value={`$${Number(rwds).toFixed(4)}`} sub="USDC" />
        <Stat label="Vault Balance"   value={`$${Number(vlt).toFixed(4)}`}  sub="USDC" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-muted)]">Total distributed: ${Number(dst).toFixed(2)} USDC</p>
        <div className="flex items-center gap-2">
          {hasRewards && (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              onClick={() => writeContract({ address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "withdrawRewards" })}>
              <Coins size={12} /> Withdraw ${Number(rwds).toFixed(4)}
            </Button>
          )}
          {confirmed && <span className="text-xs text-emerald-600">Withdrawn!</span>}
        </div>
      </div>
    </Card>
  );
}

// ── PropertyNFT card ──────────────────────────────────────────────────────────
function PropertyNFTCard({ tokenAddress, walletAddress, onRefresh }: {
  tokenAddress: `0x${string}`; walletAddress: `0x${string}`; onRefresh: () => void;
}) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "name" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "ownerOf",          args: [0n] },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getVaultBalance" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getAvailableYield" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getTotalDistributed" },
    ],
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });
  useEffect(() => { if (confirmed) { refetch(); onRefresh(); reset(); } }, [confirmed]);

  if (isLoading) return <Card><div className="h-24 flex items-center justify-center"><PageLoader /></div></Card>;

  const [name, symbol, nftOwner, vaultBalance, availableYield, totalDist] = data?.map(r => r.result) ?? [];
  const isHolder = (nftOwner as string | undefined)?.toLowerCase() === walletAddress.toLowerCase();
  const vlt   = vaultBalance   ? formatUnits(vaultBalance   as bigint, 6) : "0";
  const yld   = availableYield ? formatUnits(availableYield as bigint, 6) : "0";
  const dst   = totalDist      ? formatUnits(totalDist      as bigint, 6) : "0";
  const hasYield = availableYield && (availableYield as bigint) > 0n && isHolder;

  return (
    <Card className={hasYield ? "border-blue-800" : ""}>
      <TokenCardHeader tokenAddress={tokenAddress} name={name as string} symbol={symbol as string} kind="nft" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="You Own NFT"     value={isHolder ? "Yes — tokenId 0" : "No"} />
        <Stat label="Vault Balance"   value={`$${Number(vlt).toFixed(4)}`} sub="USDC" />
        <Stat label="Available Yield" value={`$${Number(yld).toFixed(4)}`} sub="USDC" />
        <Stat label="Total Distributed" value={`$${Number(dst).toFixed(2)}`} sub="USDC" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-muted)]">NFT owner: {nftOwner ? <AddressLink address={nftOwner as string} chars={8} /> : "—"}</p>
        <div className="flex items-center gap-2">
          {hasYield && (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              onClick={() => writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "withdrawYield" })}>
              <Coins size={12} /> Withdraw ${Number(yld).toFixed(4)}
            </Button>
          )}
          {confirmed && <span className="text-xs text-emerald-600">Withdrawn!</span>}
        </div>
      </div>
    </Card>
  );
}

// ── SecurityToken card ────────────────────────────────────────────────────────
function SecurityTokenCard({ tokenAddress, walletAddress }: {
  tokenAddress: `0x${string}`; walletAddress: `0x${string}`;
}) {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "name" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "balanceOf",         args: [walletAddress] },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "totalSupply" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "transferEnabled" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "complianceManager" },
    ],
  });

  if (isLoading) return <Card><div className="h-24 flex items-center justify-center"><PageLoader /></div></Card>;

  const [name, symbol, balance, totalSupply, transferEnabled, complianceManager] = data?.map(r => r.result) ?? [];
  const bal = balance    ? formatUnits(balance    as bigint, 18) : "0";
  const sup = totalSupply ? formatUnits(totalSupply as bigint, 18) : "0";
  const pct = totalSupply && balance ? ((Number(balance) / Number(totalSupply)) * 100).toFixed(4) : "0";
  const isCompMgr = (complianceManager as string | undefined)?.toLowerCase() === walletAddress.toLowerCase();

  return (
    <Card>
      <TokenCardHeader tokenAddress={tokenAddress} name={name as string} symbol={symbol as string} kind="security" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Your Balance" value={Number(bal).toLocaleString()} sub="tokens" />
        <Stat label="Ownership"    value={`${pct}%`} />
        <Stat label="Transfers"    value={transferEnabled ? "Enabled" : "Disabled"} />
        <Stat label="Your Role"    value={isCompMgr ? "Compliance Mgr" : "Investor"} />
      </div>
      <div className="pt-3 border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-muted)]">Total supply: {Number(sup).toLocaleString()} tokens</p>
      </div>
    </Card>
  );
}

// ── Shared card header ────────────────────────────────────────────────────────
function TokenCardHeader({ tokenAddress, name, symbol, kind }: {
  tokenAddress: `0x${string}`; name: string; symbol: string; kind: TokenKind;
}) {
  const { label, color, bg } = kindLabel(kind);
  const Icon = kind === "nft" ? ImageIcon : kind === "security" ? ShieldCheck : Building2;
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 p-1.5 rounded-lg border ${bg}`}>
          <Icon size={13} className={color} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-[var(--color-text)]">{name ?? "—"}</p>
            <span className="text-[10px] font-mono bg-[var(--color-surface)] text-[var(--color-text-secondary)] px-1.5 py-0.5 rounded">{symbol ?? "—"}</span>
            <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ${bg} ${color}`}>{label}</span>
          </div>
          <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5"><AddressLink address={tokenAddress} chars={10} /></p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer"
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors" title="View on Explorer">
          <ExternalLink size={13} />
        </a>
        <Link href={`/wallet/studio/${tokenAddress}`} title="Open Rentline Sandbox — full contract management">
          <FlaskConical size={13} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors" />
        </Link>
      </div>
    </div>
  );
}

// ── Token type detector ───────────────────────────────────────────────────────
function TokenPosition({ tokenAddress, walletAddress, onRefresh }: {
  tokenAddress: `0x${string}`; walletAddress: `0x${string}`; onRefresh: () => void;
}) {
  // Detect type by reading distinguishing fields from each ABI
  const { data: propData }  = useReadContracts({ contracts: [{ address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "propertyOwner" }] });
  const { data: nftData }   = useReadContracts({ contracts: [{ address: tokenAddress, abi: PROPERTY_NFT_ABI,   functionName: "TOKEN_ID" }] });
  const { data: secData }   = useReadContracts({ contracts: [{ address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "complianceManager" }] });

  const isProp = propData?.[0]?.status === "success" && !!propData[0].result;
  const isNFT  = !isProp && nftData?.[0]?.status  === "success" && nftData[0].result !== undefined;
  const isSec  = !isProp && !isNFT && secData?.[0]?.status === "success" && !!secData[0].result;

  if (isProp) return <PropertyTokenCard tokenAddress={tokenAddress} walletAddress={walletAddress} onRefresh={onRefresh} />;
  if (isNFT)  return <PropertyNFTCard   tokenAddress={tokenAddress} walletAddress={walletAddress} onRefresh={onRefresh} />;
  if (isSec)  return <SecurityTokenCard tokenAddress={tokenAddress} walletAddress={walletAddress} />;

  // Still detecting
  return (
    <Card>
      <div className="flex items-center gap-3 py-2">
        <PageLoader />
        <p className="text-xs text-[var(--color-text-muted)] font-mono"><AddressLink address={tokenAddress} chars={10} /> — detecting type…</p>
        <div className="ml-auto flex items-center gap-2">
          <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={12} /></a>
          <Link href={`/wallet/studio/${tokenAddress}`}>
            <FlaskConical size={12} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]" />
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ── Main wallet page ──────────────────────────────────────────────────────────
export default function WalletPage() {
  const { address, isConnected } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const runtimeFactories = useBroadcastFactories();

  // Use runtime factory addresses from backend, fall back to static env vars
  const propFactoryAddr = runtimeFactories.PROPERTY_TOKEN_FACTORY ?? PROPERTY_TOKEN_FACTORY_ADDRESS;
  const creFactoryAddr  = runtimeFactories.CRE_FACTORY            ?? CRE_FACTORY_ADDRESS;
  const nftFactoryAddr  = runtimeFactories.PROPERTY_NFT_FACTORY   ?? PROPERTY_NFT_FACTORY_ADDRESS;

  // ── Factory totals ─────────────────────────────────────────────────────────
  const { data: factoryTotals } = useReadContracts({
    contracts: [
      ...(propFactoryAddr ? [{ address: propFactoryAddr, abi: PROPERTY_TOKEN_FACTORY_ABI, functionName: "totalDeployed" as const }] : []),
      ...(creFactoryAddr  ? [{ address: creFactoryAddr,  abi: CRE_FACTORY_ABI,            functionName: "totalDeployed" as const }] : []),
      ...(nftFactoryAddr  ? [{ address: nftFactoryAddr,  abi: PROPERTY_NFT_FACTORY_ABI,  functionName: "totalDeployed" as const }] : []),
    ],
  });

  const propTotal = Number(factoryTotals?.[0]?.result ?? 0n);
  const creTotal  = Number(factoryTotals?.[1]?.result ?? 0n);
  const nftTotal  = Number(factoryTotals?.[2]?.result ?? 0n);

  // ── All tokens from all factories ─────────────────────────────────────────
  const { data: allFactoryData } = useReadContracts({
    contracts: [
      ...(propFactoryAddr && propTotal > 0 ? [{ address: propFactoryAddr, abi: PROPERTY_TOKEN_FACTORY_ABI, functionName: "getTokens" as const, args: [0n, BigInt(Math.min(propTotal, 200))] as const }] : []),
      ...(creFactoryAddr  && creTotal  > 0 ? [{ address: creFactoryAddr,  abi: CRE_FACTORY_ABI,            functionName: "getTokens" as const, args: [0n, BigInt(Math.min(creTotal,  200))] as const }] : []),
      ...(nftFactoryAddr  && nftTotal  > 0 ? [{ address: nftFactoryAddr,  abi: PROPERTY_NFT_FACTORY_ABI,  functionName: "getTokens" as const, args: [0n, BigInt(Math.min(nftTotal,  200))] as const }] : []),
    ],
  });

  const factoryTokens = [
    ...((allFactoryData?.[0]?.result ?? []) as `0x${string}`[]),
    ...((allFactoryData?.[1]?.result ?? []) as `0x${string}`[]),
    ...((allFactoryData?.[2]?.result ?? []) as `0x${string}`[]),
  ];

  // ── Backend tokens (admin-deployed) ───────────────────────────────────────
  const [backendTokens, setBackendTokens] = useState<`0x${string}`[]>([]);
  useEffect(() => {
    if (!isConnected) return;
    api.properties.list("deployed").then(props => {
      const addrs = props.flatMap(p => [
        p.property_token_address,
        p.security_token_address,
        p.nft_token_address,
      ]).filter(Boolean) as `0x${string}`[];
      setBackendTokens(addrs);
    }).catch(() => {});
  }, [isConnected, refreshKey]);

  const allTokens = Array.from(new Set([...factoryTokens, ...backendTokens])) as `0x${string}`[];

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">My Wallet</h1>
        <Card className="text-center py-16 space-y-4">
          <Wallet size={40} className="mx-auto text-[var(--color-text-muted)]" />
          <p className="text-[var(--color-text-secondary)]">No wallet connected</p>
          <p className="text-xs text-[var(--color-text-muted)]">Use the Connect Wallet button in the top nav</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">My Wallet</h1>
          <p className="text-xs font-mono text-[var(--color-text-muted)] mt-0.5">{address}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Link href="/wallet/mint">
            <Button size="sm" variant="primary">
              <Plus size={13} /> Deploy Token
            </Button>
          </Link>
        </div>
      </div>

      {/* Factory status */}
      <Card>
        <CardHeader title="Factory Registry" subtitle="On-chain registry of all deployed tokens across all three factories" />
        <div className="grid grid-cols-3 gap-4 text-xs">
          <div className={`p-3 rounded-lg border ${PROPERTY_TOKEN_FACTORY_ADDRESS ? "border-emerald-800 bg-emerald-500/5" : "border-[var(--color-border)]"}`}>
            <p className="text-[var(--color-text-muted)] mb-1">PropertyTokenFactory</p>
            {PROPERTY_TOKEN_FACTORY_ADDRESS
              ? <><p className="font-mono text-emerald-600 truncate"><AddressLink address={PROPERTY_TOKEN_FACTORY_ADDRESS} chars={8} /></p><p className="text-[var(--color-text-muted)] mt-0.5">{propTotal} tokens</p></>
              : <p className="text-amber-500">Not configured</p>}
          </div>
          <div className={`p-3 rounded-lg border ${CRE_FACTORY_ADDRESS ? "border-purple-800 bg-purple-500/5" : "border-[var(--color-border)]"}`}>
            <p className="text-[var(--color-text-muted)] mb-1">CREFactory</p>
            {CRE_FACTORY_ADDRESS
              ? <><p className="font-mono text-purple-600 truncate"><AddressLink address={CRE_FACTORY_ADDRESS} chars={8} /></p><p className="text-[var(--color-text-muted)] mt-0.5">{creTotal} systems</p></>
              : <p className="text-amber-500">Not configured</p>}
          </div>
          <div className={`p-3 rounded-lg border ${PROPERTY_NFT_FACTORY_ADDRESS ? "border-blue-800 bg-blue-500/5" : "border-[var(--color-border)]"}`}>
            <p className="text-[var(--color-text-muted)] mb-1">PropertyNFTFactory</p>
            {PROPERTY_NFT_FACTORY_ADDRESS
              ? <><p className="font-mono text-blue-600 truncate"><AddressLink address={PROPERTY_NFT_FACTORY_ADDRESS} chars={8} /></p><p className="text-[var(--color-text-muted)] mt-0.5">{nftTotal} NFTs</p></>
              : <p className="text-amber-500">Not configured</p>}
          </div>
        </div>
      </Card>

      {/* Token positions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm text-[var(--color-text)]">
            Token Positions
            <span className="ml-2 text-[var(--color-text-muted)] font-normal">({allTokens.length})</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Tap <FlaskConical size={11} className="inline" /> on any token to open full management (Rentline Sandbox)
          </p>
        </div>

        {allTokens.length === 0 ? (
          <Card>
            <div className="text-center py-10 space-y-3">
              <TrendingUp size={32} className="mx-auto text-[var(--color-text-muted)]" />
              <p className="text-sm text-[var(--color-text-muted)]">No tokens found in any factory registry.</p>
              <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
                Deploy a PropertyToken, SecurityToken, or PropertyNFT via your connected wallet — or go to a property page and use the Deploy Token button there.
              </p>
              <Link href="/wallet/mint">
                <Button size="sm" variant="primary"><Plus size={13} /> Deploy Token</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {allTokens.map(addr => (
              <TokenPosition
                key={addr}
                tokenAddress={addr}
                walletAddress={address!}
                onRefresh={() => setRefreshKey(k => k + 1)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Guide */}
      <Card>
        <CardHeader title="How to use this page" />
        <div className="space-y-2 text-xs text-[var(--color-text-secondary)]">
          <div className="flex gap-3">
            <span className="text-[var(--color-text-muted)] w-5 shrink-0">1.</span>
            <span><strong className="text-[var(--color-text)]">Deploy Token</strong> — connects your wallet to the factory contract. You sign the transaction, you own the token from block 0.</span>
          </div>
          <div className="flex gap-3">
            <span className="text-[var(--color-text-muted)] w-5 shrink-0">2.</span>
            <span><strong className="text-[var(--color-text)]">Token Positions</strong> — all tokens across all three factories appear here. Shows your balance, yield, and a quick withdraw button if rewards are pending.</span>
          </div>
          <div className="flex gap-3">
            <span className="text-[var(--color-text-muted)] w-5 shrink-0">3.</span>
            <span><strong className="text-[var(--color-text)]">Rentline Sandbox <FlaskConical size={11} className="inline" /></strong> — click the flask icon on any token card for full contract management: mint, burn, deposit rent, push distributions, compliance controls, investor registry, governance, and more.</span>
          </div>
          <div className="flex gap-3">
            <span className="text-[var(--color-text-muted)] w-5 shrink-0">4.</span>
            <span><strong className="text-[var(--color-text)]">Properties page</strong> — go to a property, set a valuation via scrape or manual entry, then click Deploy Token to mint directly from there with metadata pre-filled.</span>
          </div>
        </div>
      </Card>

    </div>
  );
}
