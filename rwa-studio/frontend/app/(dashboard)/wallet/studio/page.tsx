"use client";
import { useAccount, useReadContracts } from "wagmi";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PROPERTY_TOKEN_FACTORY_ABI, PROPERTY_TOKEN_FACTORY_ADDRESS,
  CRE_FACTORY_ABI,            CRE_FACTORY_ADDRESS,
  PROPERTY_NFT_FACTORY_ABI,  PROPERTY_NFT_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import { useBroadcastFactories } from "@/lib/useBroadcastFactories";
import { explorerAddressUrl, AddressLink, truncateAddr } from "@/lib/explorer";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { FlaskConical, Building2, ShieldCheck, ImageIcon, ArrowRight, Search } from "lucide-react";

export default function StudioLandingPage() {
  const { isConnected } = useAccount();
  const router = useRouter();
  const [manualAddr, setManualAddr] = useState("");
  const runtimeFactories = useBroadcastFactories();

  const propFactoryAddr = runtimeFactories.PROPERTY_TOKEN_FACTORY ?? PROPERTY_TOKEN_FACTORY_ADDRESS;
  const creFactoryAddr  = runtimeFactories.CRE_FACTORY            ?? CRE_FACTORY_ADDRESS;
  const nftFactoryAddr  = runtimeFactories.PROPERTY_NFT_FACTORY   ?? PROPERTY_NFT_FACTORY_ADDRESS;

  // Load all tokens from all factories
  const { data: totals } = useReadContracts({
    contracts: [
      ...(propFactoryAddr ? [{ address: propFactoryAddr, abi: PROPERTY_TOKEN_FACTORY_ABI, functionName: "totalDeployed" as const }] : []),
      ...(creFactoryAddr  ? [{ address: creFactoryAddr,  abi: CRE_FACTORY_ABI,            functionName: "totalDeployed" as const }] : []),
      ...(nftFactoryAddr  ? [{ address: nftFactoryAddr,  abi: PROPERTY_NFT_FACTORY_ABI,  functionName: "totalDeployed" as const }] : []),
    ],
  });

  const propTotal = Number(totals?.[0]?.result ?? 0n);
  const creTotal  = Number(totals?.[1]?.result ?? 0n);
  const nftTotal  = Number(totals?.[2]?.result ?? 0n);

  const { data: tokenData } = useReadContracts({
    contracts: [
      ...(propFactoryAddr && propTotal > 0 ? [{ address: propFactoryAddr, abi: PROPERTY_TOKEN_FACTORY_ABI, functionName: "getTokens" as const, args: [0n, BigInt(Math.min(propTotal, 50))] as const }] : []),
      ...(creFactoryAddr  && creTotal  > 0 ? [{ address: creFactoryAddr,  abi: CRE_FACTORY_ABI,            functionName: "getTokens" as const, args: [0n, BigInt(Math.min(creTotal,  50))] as const }] : []),
      ...(nftFactoryAddr  && nftTotal  > 0 ? [{ address: nftFactoryAddr,  abi: PROPERTY_NFT_FACTORY_ABI,  functionName: "getTokens" as const, args: [0n, BigInt(Math.min(nftTotal,  50))] as const }] : []),
    ],
  });

  const propTokens = (tokenData?.[0]?.result ?? []) as `0x${string}`[];
  const creTokens  = (tokenData?.[1]?.result ?? []) as `0x${string}`[];
  const nftTokens  = (tokenData?.[2]?.result ?? []) as `0x${string}`[];

  const groups = [
    { label: "PropertyToken",  icon: Building2,   color: "text-emerald-600", bg: "border-emerald-800 bg-emerald-500/5", tokens: propTokens },
    { label: "CRE System",     icon: ShieldCheck, color: "text-purple-600",  bg: "border-purple-800 bg-purple-500/5",  tokens: creTokens  },
    { label: "PropertyNFT",    icon: ImageIcon,   color: "text-blue-600",    bg: "border-blue-800 bg-blue-500/5",      tokens: nftTokens  },
  ];

  const allTokens = [...propTokens, ...creTokens, ...nftTokens];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
          <FlaskConical size={20} className="text-[var(--color-text)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Rentline Sandbox</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Full contract management for every deployed RWA token</p>
        </div>
      </div>

      {/* Manual address entry */}
      <Card>
        <CardHeader title="Open by Contract Address" subtitle="Paste any deployed token address to open its studio" />
        <div className="flex gap-2">
          <input
            value={manualAddr}
            onChange={e => setManualAddr(e.target.value)}
            placeholder="0x…"
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] font-mono focus:outline-none focus:border-[var(--color-blue)]"
          />
          <Button
            variant="primary"
            disabled={!manualAddr || manualAddr.length < 10}
            onClick={() => router.push(`/wallet/studio/${manualAddr}`)}
          >
            <Search size={13} /> Open Studio
          </Button>
        </div>
      </Card>

      {/* Registry */}
      {allTokens.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Deployed Tokens — Select to Manage</h2>
          {groups.map(({ label, icon: Icon, color, bg, tokens }) => tokens.length > 0 && (
            <Card key={label}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={14} className={color} />
                <span className="text-sm font-semibold text-[var(--color-text)]">{label}</span>
                <span className="text-xs text-[var(--color-text-muted)]">({tokens.length})</span>
              </div>
              <div className="space-y-2">
                {tokens.map(addr => (
                  <Link key={addr} href={`/wallet/studio/${addr}`}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${bg} hover:opacity-80 transition-opacity group`}>
                    <span className={`text-xs font-mono ${color}`}><AddressLink address={addr} chars={16} /></span>
                    <ArrowRight size={13} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-colors" />
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {allTokens.length === 0 && isConnected && (
        <Card>
          <div className="text-center py-10 space-y-3">
            <FlaskConical size={32} className="mx-auto text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-muted)]">No tokens found in the factory registry.</p>
            <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
              Deploy a token first, then come back here to manage it — or paste a contract address above.
            </p>
            <Link href="/wallet/mint">
              <Button size="sm" variant="primary">Deploy Token</Button>
            </Link>
          </div>
        </Card>
      )}

      {!isConnected && (
        <Card>
          <div className="text-center py-10">
            <p className="text-sm text-[var(--color-text-muted)]">Connect your wallet to see your deployed tokens.</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Or paste a contract address above to open any token's studio.</p>
          </div>
        </Card>
      )}

      {/* What Studio can do */}
      <Card>
        <CardHeader title="What you can do in Studio" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-[var(--color-text-secondary)]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-600 font-semibold"><Building2 size={12} /> PropertyToken</div>
            <p>Deposit rent · Push distributions · Mint/burn · Update metadata · Manage authorized distributors · Withdraw fees · View holders</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-purple-600 font-semibold"><ShieldCheck size={12} /> CRE System</div>
            <p>Approve/reject investors · Update lockups · Transfer controls · Configure waterfall · Process distributions · KYC registry · PropertyLLC rent · Governance</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-blue-600 font-semibold"><ImageIcon size={12} /> PropertyNFT</div>
            <p>Withdraw yield · Deposit rent · Push yield · Transfer NFT · Set metadata · Manage distributors</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
