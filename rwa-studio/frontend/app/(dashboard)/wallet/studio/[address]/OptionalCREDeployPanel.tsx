"use client";
import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  PROPERTY_LLC_FACTORY_ABI,           PROPERTY_LLC_FACTORY_ADDRESS,
  INVESTOR_REGISTRY_FACTORY_ABI,      INVESTOR_REGISTRY_FACTORY_ADDRESS,
  GOVERNANCE_FACTORY_ABI,             GOVERNANCE_FACTORY_ADDRESS,
  DISTRIBUTION_MANAGER_FACTORY_ABI,   DISTRIBUTION_MANAGER_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { explorerAddressUrl, AddressLink, truncateAddr } from "@/lib/explorer";
import { ExternalLink, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { useEffect } from "react";

function Field({ label, value, onChange, placeholder, mono, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--color-text-secondary)] mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={`w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] ${mono ? "font-mono" : ""}`} />
      {hint && <p className="text-xs text-[var(--color-text-muted)] mt-1">{hint}</p>}
    </div>
  );
}

function DeployedAddress({ label, address, color = "text-[var(--color-text)]" }: { label: string; address: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <div className="flex items-center gap-2">
        <CheckCircle size={11} className="text-emerald-600" />
        <AddressLink address={address} chars={10} />
      </div>
    </div>
  );
}

// ── PropertyLLC deploy block ──────────────────────────────────────────────────
function DeployPropertyLLC({ securityTokenAddress }: { securityTokenAddress: `0x${string}` }) {
  const lsKey = `cre-linked-${securityTokenAddress.toLowerCase()}`;
  const [open, setOpen] = useState(false);
  const [propName, setPropName] = useState("");
  const [physAddr, setPhysAddr] = useState("");
  const [propId,   setPropId]   = useState("");
  const [deployed, setDeployed] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "{}").propertyLLC ?? null; } catch { return null; }
  });
  const publicClient = usePublicClient();

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!confirmed || !txHash || !publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: PROPERTY_LLC_FACTORY_ABI, eventName: "PropertyLLCCreated", data: log.data, topics: log.topics });
          const addr = (decoded.args as Record<string, unknown>).contractAddress as string;
          setDeployed(addr);
          try { const s = JSON.parse(localStorage.getItem(lsKey) ?? "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...s, propertyLLC: addr })); } catch {}
          break;
        } catch {}
      }
    })();
  }, [confirmed, txHash]);

  if (!PROPERTY_LLC_FACTORY_ADDRESS) return (
    <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
      NEXT_PUBLIC_PROPERTY_LLC_FACTORY not set. Run <code>forge script script/DeployOptionalFactories.s.sol</code> first.
    </div>
  );

  return (
    <div className="border border-[var(--color-border)] rounded-xl">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] cursor-pointer hover:bg-[var(--color-surface)]/50 rounded-xl">
        <span>PropertyLLC {deployed && <span className="text-xs text-emerald-600 ml-2 font-normal">✓ deployed</span>}</span>
        {open ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs text-[var(--color-text-muted)]">On-chain LLC wrapper. Links to the SecurityToken for rent collection and distribution.</p>
          <Field label="Property Name" value={propName} onChange={setPropName} placeholder="123 Main St" />
          <Field label="Physical Address" value={physAddr} onChange={setPhysAddr} placeholder="123 Main St, City, Country" />
          <Field label="Property ID" value={propId} onChange={setPropId} placeholder={`prop-${securityTokenAddress.slice(2, 8)}`}
            hint="Short identifier (e.g. MLS number or geo ID)" />
          <div className="text-xs text-[var(--color-text-muted)] font-mono truncate">SecurityToken: <AddressLink address={securityTokenAddress} chars={14} /></div>
          {deployed ? (
            <DeployedAddress label="PropertyLLC deployed at" address={deployed} color="text-emerald-600" />
          ) : (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              disabled={!propName || !physAddr || !propId}
              onClick={() => {
                reset();
                writeContract({
                  address: PROPERTY_LLC_FACTORY_ADDRESS!,
                  abi: PROPERTY_LLC_FACTORY_ABI,
                  functionName: "create",
                  args: [propName, physAddr, propId, securityTokenAddress],
                });
              }}>
              Deploy PropertyLLC
            </Button>
          )}
          {error && <p className="text-xs text-red-600">{error.message.slice(0, 200)}</p>}
        </div>
      )}
    </div>
  );
}

// ── InvestorRegistry deploy block ─────────────────────────────────────────────
function DeployInvestorRegistry({ securityTokenAddress }: { securityTokenAddress: `0x${string}` }) {
  const lsKey = `cre-linked-${securityTokenAddress.toLowerCase()}`;
  const [open, setOpen] = useState(false);
  const [verifier, setVerifier] = useState("");
  const [deployed, setDeployed] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "{}").investorRegistry ?? null; } catch { return null; }
  });
  const publicClient = usePublicClient();

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!confirmed || !txHash || !publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: INVESTOR_REGISTRY_FACTORY_ABI, eventName: "InvestorRegistryCreated", data: log.data, topics: log.topics });
          const addr = (decoded.args as Record<string, unknown>).contractAddress as string;
          setDeployed(addr);
          try { const s = JSON.parse(localStorage.getItem(lsKey) ?? "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...s, investorRegistry: addr })); } catch {}
          break;
        } catch {}
      }
    })();
  }, [confirmed, txHash]);

  if (!INVESTOR_REGISTRY_FACTORY_ADDRESS) return (
    <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
      NEXT_PUBLIC_INVESTOR_REGISTRY_FACTORY not set. Run <code>forge script script/DeployOptionalFactories.s.sol</code> first.
    </div>
  );

  return (
    <div className="border border-[var(--color-border)] rounded-xl">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] cursor-pointer hover:bg-[var(--color-surface)]/50 rounded-xl">
        <span>InvestorRegistry {deployed && <span className="text-xs text-emerald-600 ml-2 font-normal">✓ deployed</span>}</span>
        {open ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs text-[var(--color-text-muted)]">KYC/AML on-chain registry. Tracks investor status, accreditation, jurisdiction, and KYC hashes.</p>
          <Field label="Accreditation Verifier (optional)" value={verifier} onChange={setVerifier}
            placeholder="0x… (leave blank to set later)" mono
            hint="The address authorised to mark investors as accredited. Can be set after deployment." />
          {deployed ? (
            <DeployedAddress label="InvestorRegistry deployed at" address={deployed} color="text-blue-600" />
          ) : (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              onClick={() => {
                reset();
                writeContract({
                  address: INVESTOR_REGISTRY_FACTORY_ADDRESS!,
                  abi: INVESTOR_REGISTRY_FACTORY_ABI,
                  functionName: "create",
                  args: [verifier ? verifier as `0x${string}` : "0x0000000000000000000000000000000000000000"],
                });
              }}>
              Deploy InvestorRegistry
            </Button>
          )}
          {error && <p className="text-xs text-red-600">{error.message.slice(0, 200)}</p>}
        </div>
      )}
    </div>
  );
}

// ── Governance deploy block ───────────────────────────────────────────────────
function DeployGovernance({ walletAddress, securityTokenAddress }: { walletAddress: `0x${string}`; securityTokenAddress: `0x${string}` }) {
  const lsKey = `cre-linked-${securityTokenAddress.toLowerCase()}`;
  const [open, setOpen] = useState(false);
  const [adminMultisig,  setAdminMultisig]  = useState<string>(walletAddress);
  const [emergencyAdmin, setEmergencyAdmin] = useState<string>(walletAddress);
  const [timelockDelay,  setTimelockDelay]  = useState("86400");
  const [deployed, setDeployed] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "{}").governance ?? null; } catch { return null; }
  });
  const publicClient = usePublicClient();

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!confirmed || !txHash || !publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: GOVERNANCE_FACTORY_ABI, eventName: "GovernanceCreated", data: log.data, topics: log.topics });
          const addr = (decoded.args as Record<string, unknown>).contractAddress as string;
          setDeployed(addr);
          try { const s = JSON.parse(localStorage.getItem(lsKey) ?? "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...s, governance: addr })); } catch {}
          break;
        } catch {}
      }
    })();
  }, [confirmed, txHash]);

  if (!GOVERNANCE_FACTORY_ADDRESS) return (
    <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
      NEXT_PUBLIC_GOVERNANCE_FACTORY not set. Run <code>forge script script/DeployOptionalFactories.s.sol</code> first.
    </div>
  );

  return (
    <div className="border border-[var(--color-border)] rounded-xl">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] cursor-pointer hover:bg-[var(--color-surface)]/50 rounded-xl">
        <span>Governance {deployed && <span className="text-xs text-emerald-600 ml-2 font-normal">✓ deployed</span>}</span>
        {open ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs text-[var(--color-text-muted)]">Deploys a Governance contract with an internal TimelockController. Ownership is immediately transferred to the timelock — all future owner calls must go through it.</p>
          <div className="text-xs text-amber-600 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-2">
            After deploying, transfer ownership of SecurityToken and DistributionManager to this Governance contract via Rentline Sandbox.
          </div>
          <Field label="Admin Multisig" value={adminMultisig} onChange={setAdminMultisig} placeholder="0x…" mono
            hint="Timelock proposer and executor — controls all governance actions" />
          <Field label="Emergency Admin" value={emergencyAdmin} onChange={setEmergencyAdmin} placeholder="0x…" mono
            hint="Can call emergencyPause/Unpause without the timelock delay" />
          <Field label="Timelock Delay (seconds)" value={timelockDelay} onChange={setTimelockDelay} placeholder="86400"
            hint="86400 = 1 day · 604800 = 1 week · 0 = no delay (testnet only)" />
          {deployed ? (
            <DeployedAddress label="Governance deployed at" address={deployed} color="text-purple-600" />
          ) : (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              disabled={!adminMultisig || !emergencyAdmin}
              onClick={() => {
                reset();
                writeContract({
                  address: GOVERNANCE_FACTORY_ADDRESS!,
                  abi: GOVERNANCE_FACTORY_ABI,
                  functionName: "create",
                  args: [
                    adminMultisig  as `0x${string}`,
                    emergencyAdmin as `0x${string}`,
                    BigInt(timelockDelay || "86400"),
                  ],
                });
              }}>
              Deploy Governance
            </Button>
          )}
          {error && <p className="text-xs text-red-600">{error.message.slice(0, 200)}</p>}
        </div>
      )}
    </div>
  );
}

// ── DistributionManager deploy block ─────────────────────────────────────────
function DeployDistributionManager({ securityTokenAddress }: { securityTokenAddress: `0x${string}` }) {
  const lsKey = `cre-linked-${securityTokenAddress.toLowerCase()}`;
  const [open, setOpen] = useState(false);
  const [usdcAddr, setUsdcAddr] = useState("");
  const [deployed, setDeployed] = useState<string | null>(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) ?? "{}").distMgr ?? null; } catch { return null; }
  });
  const publicClient = usePublicClient();

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!confirmed || !txHash || !publicClient) return;
    (async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: DISTRIBUTION_MANAGER_FACTORY_ABI, eventName: "DistributionManagerCreated", data: log.data, topics: log.topics });
          const addr = (decoded.args as Record<string, unknown>).contractAddress as string;
          setDeployed(addr);
          try { const s = JSON.parse(localStorage.getItem(lsKey) ?? "{}"); localStorage.setItem(lsKey, JSON.stringify({ ...s, distMgr: addr })); } catch {}
          break;
        } catch {}
      }
    })();
  }, [confirmed, txHash]);

  if (!DISTRIBUTION_MANAGER_FACTORY_ADDRESS) return (
    <div className="text-xs text-amber-500 bg-amber-500/10 border border-amber-700/30 rounded-lg px-3 py-2">
      NEXT_PUBLIC_DISTRIBUTION_MANAGER_FACTORY not set. Run <code>forge script script/DeployOptionalFactories.s.sol</code> first.
    </div>
  );

  return (
    <div className="border border-[var(--color-border)] rounded-xl">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--color-text)] cursor-pointer hover:bg-[var(--color-surface)]/50 rounded-xl">
        <span>DistributionManager {deployed && <span className="text-xs text-emerald-600 ml-2 font-normal">✓ deployed</span>}</span>
        {open ? <ChevronUp size={14} className="text-[var(--color-text-muted)]" /> : <ChevronDown size={14} className="text-[var(--color-text-muted)]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs text-[var(--color-text-muted)]">CRE waterfall engine. Handles preferred return, sponsor promote, and LP payout distributions.</p>
          <Field label="USDC Address *" value={usdcAddr} onChange={setUsdcAddr} placeholder="0x…" mono hint="The USDC token used for all distributions" />
          <div className="text-xs text-[var(--color-text-muted)] font-mono truncate">SecurityToken: <AddressLink address={securityTokenAddress} chars={14} /></div>
          {deployed ? (
            <DeployedAddress label="DistributionManager deployed at" address={deployed} color="text-blue-600" />
          ) : (
            <Button variant="primary" size="sm" loading={isPending || confirming}
              disabled={!usdcAddr}
              onClick={() => {
                reset();
                writeContract({
                  address: DISTRIBUTION_MANAGER_FACTORY_ADDRESS!,
                  abi: DISTRIBUTION_MANAGER_FACTORY_ABI,
                  functionName: "create",
                  args: [securityTokenAddress, usdcAddr as `0x${string}`],
                });
              }}>
              Deploy DistributionManager
            </Button>
          )}
          {error && <p className="text-xs text-red-600">{error.message.slice(0, 200)}</p>}
        </div>
      )}
    </div>
  );
}

// ── Main exported panel ───────────────────────────────────────────────────────
export default function OptionalCREDeployPanel({
  securityTokenAddress,
  walletAddress,
}: {
  securityTokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  return (
    <Card>
      <CardHeader
        title="Deploy Optional CRE Contracts"
        subtitle="PropertyLLC, InvestorRegistry, and Governance — deploy from your wallet, wire via Studio"
      />
      <div className="space-y-2">
        <DeployDistributionManager securityTokenAddress={securityTokenAddress} />
        <DeployPropertyLLC         securityTokenAddress={securityTokenAddress} />
        <DeployInvestorRegistry    securityTokenAddress={securityTokenAddress} />
        <DeployGovernance          walletAddress={walletAddress} securityTokenAddress={securityTokenAddress} />
      </div>
    </Card>
  );
}
