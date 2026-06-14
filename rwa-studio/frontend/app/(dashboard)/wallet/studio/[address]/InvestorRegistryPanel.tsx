"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { INVESTOR_REGISTRY_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { explorerTxUrl, TxLink } from "@/lib/explorer";

function TxStatus({ hash, confirming, confirmed, error }: { hash?: `0x${string}`; confirming: boolean; confirmed: boolean; error?: Error | null }) {
  if (error) return <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mt-2">{error.message.slice(0, 200)}</p>;
  if (confirmed) return <p className="text-xs text-emerald-600 mt-2">Confirmed. <TxLink hash={hash} label="View" /></p>;
  if (confirming) return <p className="text-xs text-amber-600 mt-2">Confirming…</p>;
  return null;
}

function useTx() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });
  return { writeContract, hash, isPending, confirming, confirmed, error, reset };
}

const STATUS_LABELS = ["Pending", "Verified", "Accredited", "Blocked", "Suspended"];
const STATUS_COLORS = ["text-[var(--color-text-secondary)]", "text-blue-600", "text-emerald-600", "text-red-600", "text-amber-600"];

export default function InvestorRegistryPanel({ registryAddress, isOwner }: {
  registryAddress: `0x${string}`;
  isOwner: boolean;
}) {
  const [lookupAddr, setLookupAddr]     = useState("");
  const [queryAddr, setQueryAddr]       = useState<`0x${string}` | null>(null);
  const [verifyAddr, setVerifyAddr]     = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [kycHash, setKycHash]           = useState("");
  const [accreditAddr, setAccreditAddr] = useState("");
  const [blockAddr, setBlockAddr]       = useState("");
  const [blockReason, setBlockReason]   = useState("");
  const [suspendAddr, setSuspendAddr]   = useState("");
  const [verifierAddr, setVerifierAddr] = useState("");

  const { data: globalData, refetch } = useReadContracts({
    contracts: [{ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "accreditationVerifier" }],
  });
  const accreditationVerifier = globalData?.[0]?.result as string | undefined;

  const { data: investorData } = useReadContracts({
    contracts: queryAddr ? [
      { address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "getInvestorStatus", args: [queryAddr] },
      { address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "isVerified",         args: [queryAddr] },
      { address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "isBlocked",          args: [queryAddr] },
    ] : [],
    query: { enabled: !!queryAddr },
  });

  type InvestorStatus = readonly [number, boolean, string];
  const investorStatus = investorData?.[0]?.result as InvestorStatus | undefined;
  const isVerified     = investorData?.[1]?.result as boolean | undefined;
  const isBlocked      = investorData?.[2]?.result as boolean | undefined;

  const verifyTx   = useTx();
  const accreditTx = useTx();
  const blockTx    = useTx();
  const suspendTx  = useTx();
  const verifierTx = useTx();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Investor Registry"
          subtitle="KYC/AML on-chain status registry for CRE investor onboarding"
          action={<Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>}
        />
        <div>
          <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Accreditation Verifier</p>
          <p className="text-xs font-mono text-[var(--color-text-secondary)]">{accreditationVerifier ?? "—"}</p>
        </div>
        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the registry owner — write actions will revert.
          </p>
        )}
      </Card>

      {/* Investor lookup */}
      <Card>
        <CardHeader title="Investor Status Lookup" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={lookupAddr} onChange={e => setLookupAddr(e.target.value)} placeholder="Investor address (0x…)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
            <Button size="sm" variant="secondary" onClick={() => setQueryAddr(lookupAddr as `0x${string}`)} disabled={!lookupAddr}>
              Look Up
            </Button>
          </div>
          {queryAddr && investorStatus && (
            <div className="bg-[var(--color-surface)] rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${STATUS_COLORS[investorStatus[0]] ?? "text-[var(--color-text-secondary)]"}`}>
                  {STATUS_LABELS[investorStatus[0]] ?? "Unknown"}
                </span>
                <div className="flex items-center gap-1">{investorStatus[1] ? <CheckCircle size={10} className="text-emerald-600" /> : <XCircle size={10} className="text-[var(--color-text-muted)]" />}<span className="text-[var(--color-text-secondary)]">Accredited</span></div>
                <div className="flex items-center gap-1">{isVerified ? <CheckCircle size={10} className="text-blue-600" /> : <XCircle size={10} className="text-[var(--color-text-muted)]" />}<span className="text-[var(--color-text-secondary)]">Verified</span></div>
                <div className="flex items-center gap-1">{isBlocked ? <XCircle size={10} className="text-red-600" /> : <CheckCircle size={10} className="text-[var(--color-text-muted)]" />}<span className="text-[var(--color-text-secondary)]">Blocked</span></div>
              </div>
              <div><p className="text-[var(--color-text-muted)]">Jurisdiction</p><p className="text-[var(--color-text)]">{investorStatus[2] || "—"}</p></div>
            </div>
          )}
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader title="KYC Actions" />
        <div className="space-y-5 divide-y divide-zinc-800">
          {/* Verify */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Verify Investor</p>
            <input value={verifyAddr} onChange={e => setVerifyAddr(e.target.value)} placeholder="Investor address (0x…)"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
            <div className="grid grid-cols-2 gap-2">
              <input value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="Jurisdiction (e.g. US)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
              <input value={kycHash} onChange={e => setKycHash(e.target.value)} placeholder="KYC hash / reference"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <Button size="sm" variant="primary" loading={verifyTx.isPending || verifyTx.confirming} disabled={!verifyAddr}
              onClick={() => { verifyTx.reset(); verifyTx.writeContract({ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "verifyInvestor", args: [verifyAddr as `0x${string}`, jurisdiction, kycHash] }); }}>
              Verify
            </Button>
            <TxStatus hash={verifyTx.hash} confirming={verifyTx.confirming} confirmed={verifyTx.confirmed} error={verifyTx.error} />
          </div>

          {/* Accredit */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Accredit Investor</p>
            <div className="flex gap-2">
              <input value={accreditAddr} onChange={e => setAccreditAddr(e.target.value)} placeholder="Investor address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="primary" loading={accreditTx.isPending || accreditTx.confirming} disabled={!accreditAddr}
                onClick={() => { accreditTx.reset(); accreditTx.writeContract({ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "accreditInvestor", args: [accreditAddr as `0x${string}`] }); }}>
                Accredit
              </Button>
            </div>
            <TxStatus hash={accreditTx.hash} confirming={accreditTx.confirming} confirmed={accreditTx.confirmed} error={accreditTx.error} />
          </div>

          {/* Block */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Block Investor</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={blockAddr} onChange={e => setBlockAddr(e.target.value)} placeholder="Investor address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
              <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <Button size="sm" variant="danger" loading={blockTx.isPending || blockTx.confirming} disabled={!blockAddr}
              onClick={() => { blockTx.reset(); blockTx.writeContract({ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "blockInvestor", args: [blockAddr as `0x${string}`, blockReason] }); }}>
              Block
            </Button>
            <TxStatus hash={blockTx.hash} confirming={blockTx.confirming} confirmed={blockTx.confirmed} error={blockTx.error} />
          </div>

          {/* Suspend */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Suspend Investor</p>
            <div className="flex gap-2">
              <input value={suspendAddr} onChange={e => setSuspendAddr(e.target.value)} placeholder="Investor address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="danger" loading={suspendTx.isPending || suspendTx.confirming} disabled={!suspendAddr}
                onClick={() => { suspendTx.reset(); suspendTx.writeContract({ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "suspendInvestor", args: [suspendAddr as `0x${string}`] }); }}>
                Suspend
              </Button>
            </div>
            <TxStatus hash={suspendTx.hash} confirming={suspendTx.confirming} confirmed={suspendTx.confirmed} error={suspendTx.error} />
          </div>

          {/* Set verifier */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Accreditation Verifier</p>
            <div className="flex gap-2">
              <input value={verifierAddr} onChange={e => setVerifierAddr(e.target.value)} placeholder="New verifier address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={verifierTx.isPending || verifierTx.confirming} disabled={!verifierAddr}
                onClick={() => { verifierTx.reset(); verifierTx.writeContract({ address: registryAddress, abi: INVESTOR_REGISTRY_ABI, functionName: "setAccreditationVerifier", args: [verifierAddr as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={verifierTx.hash} confirming={verifierTx.confirming} confirmed={verifierTx.confirmed} error={verifierTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
