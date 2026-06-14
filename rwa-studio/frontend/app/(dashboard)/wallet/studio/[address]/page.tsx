"use client";
import { useState, useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, ShieldCheck, Cpu, BarChart3, Users, Landmark, Shield, ExternalLink, ImageIcon } from "lucide-react";
import {
  PROPERTY_TOKEN_ABI, SECURITY_TOKEN_ABI, PROPERTY_NFT_ABI,
  CRE_FACTORY_ABI, CRE_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import { explorerAddressUrl, AddressLink, truncateAddr } from "@/lib/explorer";
import Card from "@/components/Card";
import PropertyTokenPanel from "./PropertyTokenPanel";
import DistributionAutomationPanel from "./DistributionAutomationPanel";
import SecurityTokenPanel from "./SecurityTokenPanel";
import DistributionManagerPanel from "./DistributionManagerPanel";
import InvestorRegistryPanel from "./InvestorRegistryPanel";
import PropertyLLCPanel from "./PropertyLLCPanel";
import GovernancePanel from "./GovernancePanel";
import PropertyNFTPanel from "./PropertyNFTPanel";
import OptionalCREDeployPanel from "./OptionalCREDeployPanel";
import CREDeployWizard from "@/app/(dashboard)/wallet/mint/CREDeployWizard";
import { useBroadcastFactories } from "@/lib/useBroadcastFactories";

// ── Tab definitions ────────────────────────────────────────────────────────────

type TokenType = "property" | "security" | "nft" | "unknown";

type TabId =
  | "property-token"
  | "automation"
  | "nft-token"
  | "security-token"
  | "distribution-manager"
  | "investor-registry"
  | "property-llc"
  | "governance";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
  forType: TokenType | "both";
  description: string;
}

const TABS: Tab[] = [
  { id: "property-token",        label: "PropertyToken",         icon: Building2,   forType: "property", description: "Vault, distribution, supply, config" },
  { id: "automation",            label: "Automation",            icon: Cpu,          forType: "property", description: "Chainlink upkeep status and config" },
  { id: "nft-token",             label: "PropertyNFT",           icon: ImageIcon,    forType: "nft",      description: "ERC-721 deed + yield vault" },
  { id: "security-token",        label: "SecurityToken",         icon: ShieldCheck,  forType: "security", description: "Compliance, investors, transfer controls" },
  { id: "distribution-manager",  label: "Distribution Manager",  icon: BarChart3,    forType: "security", description: "CRE waterfall engine" },
  { id: "investor-registry",     label: "Investor Registry",     icon: Users,        forType: "security", description: "KYC/AML on-chain registry" },
  { id: "property-llc",          label: "PropertyLLC",           icon: Landmark,     forType: "security", description: "LLC wrapper and rent distribution" },
  { id: "governance",            label: "Governance",            icon: Shield,       forType: "security", description: "Multisig, emergency admin, timelock" },
];

// ── Address input for linked contracts ────────────────────────────────────────

function AddressInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-muted)] mb-1">{label}</label>
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]"
      />
    </div>
  );
}

// ── Main studio page ───────────────────────────────────────────────────────────

export default function StudioPage() {
  const params = useParams();
  const tokenAddress = (Array.isArray(params.address) ? params.address[0] : params.address) as `0x${string}`;

  const { address: walletAddress, isConnected } = useAccount();

  // Detect token type by trying to read from each ABI
  const { data: propData }  = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "propertyOwner" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "name" },
    ],
  });
  const { data: secData } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "complianceManager" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "name" },
    ],
  });
  const { data: nftData } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "ownerOf", args: [0n] },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "name" },
    ],
  });

  const hasPropertyOwner = !!propData?.[0]?.result && propData[0].status === "success";
  const hasComplianceMgr = !!secData?.[0]?.result  && secData[0].status  === "success";
  // NFT: ownerOf(0) succeeds and propertyOwner doesn't (ERC-721 doesn't have propertyOwner at that slot)
  const hasNFTOwner      = !!nftData?.[0]?.result   && nftData[0].status  === "success" && !hasPropertyOwner;

  const tokenType: TokenType = hasPropertyOwner ? "property"
    : hasNFTOwner      ? "nft"
    : hasComplianceMgr ? "security"
    : "unknown";

  const tokenName = (propData?.[1]?.result ?? nftData?.[1]?.result ?? secData?.[1]?.result ?? "—") as string;

  const broadcastFactories = useBroadcastFactories();
  const creFactoryAddress = CRE_FACTORY_ADDRESS ?? broadcastFactories.CRE_FACTORY;

  // Linked contract addresses — auto-loaded from factory + localStorage
  const [automationAddr,  setAutomationAddr]  = useState("");
  const [distMgrAddr,     setDistMgrAddr]     = useState("");
  const [investorRegAddr, setInvestorRegAddr] = useState("");
  const [llcAddr,         setLlcAddr]         = useState("");
  const [govAddr,         setGovAddr]         = useState("");

  const storageKey = `cre-linked-${tokenAddress.toLowerCase()}`;

  // Load saved addresses from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      if (saved.distMgr)          setDistMgrAddr(saved.distMgr);
      if (saved.investorRegistry) setInvestorRegAddr(saved.investorRegistry);
      if (saved.propertyLLC)      setLlcAddr(saved.propertyLLC);
      if (saved.governance)       setGovAddr(saved.governance);
      if (saved.automation)       setAutomationAddr(saved.automation);
    } catch {}
  }, [storageKey]);

  // Persist to localStorage whenever addresses change
  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      localStorage.setItem(storageKey, JSON.stringify({
        ...current,
        ...(distMgrAddr     ? { distMgr:          distMgrAddr     } : {}),
        ...(investorRegAddr ? { investorRegistry:  investorRegAddr } : {}),
        ...(llcAddr         ? { propertyLLC:       llcAddr         } : {}),
        ...(govAddr         ? { governance:        govAddr         } : {}),
        ...(automationAddr  ? { automation:        automationAddr  } : {}),
      }));
    } catch {}
  }, [distMgrAddr, investorRegAddr, llcAddr, govAddr, automationAddr, storageKey]);

  // Auto-load DistributionManager from CREFactory.systemByToken
  // No tokenType guard — query runs as soon as factory address is available
  const { data: creSystem } = useReadContracts({
    contracts: creFactoryAddress ? [{
      address: creFactoryAddress,
      abi: CRE_FACTORY_ABI,
      functionName: "systemByToken" as const,
      args: [tokenAddress],
    }] : [],
    query: { enabled: !!creFactoryAddress },
  });

  useEffect(() => {
    const sys = creSystem?.[0]?.result as { securityToken: string; distributionManager: string } | undefined;
    if (sys?.distributionManager && sys.distributionManager !== "0x0000000000000000000000000000000000000000") {
      setDistMgrAddr(sys.distributionManager);
    }
  }, [creSystem]);

  // Determine which tabs to show
  const activeTabs = TABS.filter(t => t.forType === "both" || t.forType === tokenType || tokenType === "unknown");
  const [activeTab, setActiveTab] = useState<TabId>("property-token");

  // Once token type resolves from on-chain, switch to the correct default tab
  useEffect(() => {
    if (tokenType === "security") setActiveTab("distribution-manager");
    else if (tokenType === "nft")  setActiveTab("nft-token");
    else if (tokenType === "property") setActiveTab("property-token");
  }, [tokenType]);

  const isOwner = walletAddress ? (
    (propData?.[0]?.result as string | undefined)?.toLowerCase() === walletAddress.toLowerCase() ||
    (secData?.[0]?.result  as string | undefined)?.toLowerCase() === walletAddress.toLowerCase()
  ) : false;

  if (!isConnected) {
    return (
      <div className="max-w-xl">
        <Card className="text-center py-12">
          <p className="text-[var(--color-text-secondary)] text-sm">Connect your wallet to use Rentline Sandbox.</p>
        </Card>
      </div>
    );
  }

  // For security tokens: which contracts are wired up?
  const creContracts = tokenType === "security" ? [
    { id: "distribution-manager",  label: "Distribution Manager", addr: distMgrAddr,     required: true,  hint: "Deploy via SecurityToken → Deploy Contracts" },
    { id: "investor-registry",     label: "Investor Registry",    addr: investorRegAddr, required: true,  hint: "Deploy via SecurityToken → Deploy Contracts" },
    { id: "property-llc",          label: "PropertyLLC",          addr: llcAddr,         required: false, hint: "Optional — deploy via SecurityToken → Deploy Contracts" },
    { id: "governance",            label: "Governance",           addr: govAddr,         required: false, hint: "Optional — deploy via SecurityToken → Deploy Contracts" },
  ] : [];

  const missingRequired = creContracts.filter(c => c.required && !c.addr);

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/wallet" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[var(--color-text)]">Rentline Sandbox</h1>
              {tokenType === "property" && <span className="text-[10px] bg-emerald-500/15 text-emerald-600 border border-emerald-700/40 px-2 py-0.5 rounded-full">PropertyToken</span>}
              {tokenType === "nft"      && <span className="text-[10px] bg-blue-500/15 text-blue-600 border border-blue-700/40 px-2 py-0.5 rounded-full">PropertyNFT</span>}
              {tokenType === "security" && <span className="text-[10px] bg-purple-500/15 text-purple-600 border border-purple-700/40 px-2 py-0.5 rounded-full">SecurityToken</span>}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs font-mono text-[var(--color-text-muted)]">{tokenName} · <AddressLink address={tokenAddress} chars={10} /></p>
              <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"><ExternalLink size={11} /></a>
            </div>
          </div>
        </div>
      </div>

      {/* CRE system status — always visible for security tokens */}
      {tokenType === "security" && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[var(--color-text)]">CRE System Contracts</p>
            {missingRequired.length > 0 && (
              <span className="text-[10px] bg-amber-500/15 text-amber-600 border border-amber-700/40 px-2 py-0.5 rounded-full">
                {missingRequired.length} contract{missingRequired.length > 1 ? "s" : ""} not wired
              </span>
            )}
            {missingRequired.length === 0 && (
              <span className="text-[10px] bg-emerald-500/15 text-emerald-600 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                System ready
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {creContracts.map(c => (
              <div key={c.id}
                className={`rounded-lg border p-2.5 cursor-pointer transition-colors ${c.addr
                  ? "border-emerald-800 bg-emerald-500/5"
                  : c.required
                    ? "border-amber-800 bg-amber-500/5"
                    : "border-[var(--color-border)]"
                }`}
                onClick={() => { if (c.addr) setActiveTab(c.id as TabId); else setActiveTab("security-token"); }}>
                <div className="flex items-center gap-1.5 mb-1">
                  {c.addr
                    ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    : <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.required ? "bg-amber-400" : "bg-[var(--color-surface-raised)]"}`} />
                  }
                  <span className="text-[10px] font-semibold text-[var(--color-text)] truncate">{c.label}</span>
                </div>
                {c.addr
                  ? <p className="text-[10px] font-mono text-[var(--color-text-muted)] truncate">{c.addr.slice(0, 16)}…</p>
                  : <p className="text-[10px] text-amber-500/80">{c.required ? "Not deployed" : "Optional"}</p>
                }
              </div>
            ))}
          </div>
          {/* Editable addresses — always visible, not collapsed */}
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[var(--color-text-muted)] mb-1">
                Distribution Manager {distMgrAddr && <span className="text-emerald-500">● auto-loaded</span>}
              </label>
              <input value={distMgrAddr} onChange={e => setDistMgrAddr(e.target.value)} placeholder="0x…"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <AddressInput label="Investor Registry" value={investorRegAddr} onChange={setInvestorRegAddr} placeholder="0x…" />
            <AddressInput label="PropertyLLC"        value={llcAddr}         onChange={setLlcAddr}         placeholder="0x… (optional)" />
            <AddressInput label="Governance"         value={govAddr}         onChange={setGovAddr}         placeholder="0x… (optional)" />
          </div>
        </div>
      )}

      {/* PropertyToken automation — always visible */}
      {tokenType === "property" && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-4">
          <AddressInput label="Distribution Automation (optional — Chainlink upkeep)" value={automationAddr} onChange={setAutomationAddr} placeholder="0x…" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-[var(--color-surface-page)] border border-[var(--color-border)] rounded-xl">
        {activeTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer
                ${isActive ? "bg-[var(--color-surface)] text-[var(--color-text)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"}`}>
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      <div>
        {activeTab === "property-token" && walletAddress && (
          <PropertyTokenPanel tokenAddress={tokenAddress} walletAddress={walletAddress} />
        )}
        {activeTab === "nft-token" && walletAddress && (
          <PropertyNFTPanel tokenAddress={tokenAddress} walletAddress={walletAddress} />
        )}
        {activeTab === "automation" && automationAddr && walletAddress && (
          <DistributionAutomationPanel automationAddress={automationAddr as `0x${string}`} isOwner={isOwner} />
        )}
        {activeTab === "automation" && !automationAddr && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Enter the DistributionAutomation contract address above to manage Chainlink upkeep.</p>
          </div>
        )}
        {activeTab === "security-token" && walletAddress && (
          <div className="space-y-5">
            <SecurityTokenPanel tokenAddress={tokenAddress} walletAddress={walletAddress} />
            <OptionalCREDeployPanel securityTokenAddress={tokenAddress} walletAddress={walletAddress} />
          </div>
        )}
        {activeTab === "distribution-manager" && distMgrAddr && walletAddress && (
          <DistributionManagerPanel managerAddress={distMgrAddr as `0x${string}`} isOwner={isOwner} />
        )}
        {activeTab === "distribution-manager" && !distMgrAddr && walletAddress && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-800 bg-amber-500/5 p-5">
              <p className="text-sm font-semibold text-amber-600 mb-1">DistributionManager not deployed</p>
              <p className="text-xs text-[var(--color-text-secondary)] mb-4">
                This SecurityToken needs a DistributionManager to handle yield distributions.
                Deploy one now — your wallet will sign a single transaction.
              </p>
              <CREDeployWizard
                metadataUri=""
                tokenName={tokenName}
                tokenSymbol=""
                usdcAddr=""
                existingSecurityToken={tokenAddress}
                onComplete={({ distributionManager, investorRegistry }) => {
                  setDistMgrAddr(distributionManager);
                  if (investorRegistry) setInvestorRegAddr(investorRegistry);
                  setActiveTab("distribution-manager");
                }}
              />
            </div>
          </div>
        )}
        {activeTab === "investor-registry" && investorRegAddr && walletAddress && (
          <InvestorRegistryPanel registryAddress={investorRegAddr as `0x${string}`} isOwner={isOwner} />
        )}
        {activeTab === "investor-registry" && !investorRegAddr && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Enter the InvestorRegistry address above to manage KYC.</p>
          </div>
        )}
        {activeTab === "property-llc" && llcAddr && walletAddress && (
          <PropertyLLCPanel llcAddress={llcAddr as `0x${string}`} isOwner={isOwner} />
        )}
        {activeTab === "property-llc" && !llcAddr && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Enter the PropertyLLC address above to manage rent distribution.</p>
          </div>
        )}
        {activeTab === "governance" && govAddr && walletAddress && (
          <GovernancePanel govAddress={govAddr as `0x${string}`} walletAddress={walletAddress} />
        )}
        {activeTab === "governance" && !govAddr && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-page)] p-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Enter the Governance contract address above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
