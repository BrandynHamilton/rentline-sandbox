"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { GOVERNANCE_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader } from "@/components/Card";
import Button from "@/components/Button";
import { explorerTxUrl, AddressLink, TxLink, truncateAddr } from "@/lib/explorer";
import { RefreshCw, ShieldAlert } from "lucide-react";

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

export default function GovernancePanel({ govAddress, walletAddress }: {
  govAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  const [newMultisig,     setNewMultisig]     = useState("");
  const [newEmergency,    setNewEmergency]    = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: govAddress, abi: GOVERNANCE_ABI, functionName: "adminMultisig"  },
      { address: govAddress, abi: GOVERNANCE_ABI, functionName: "emergencyAdmin" },
      { address: govAddress, abi: GOVERNANCE_ABI, functionName: "timelock"       },
    ],
  });

  const [adminMultisig, emergencyAdmin, timelock] = data?.map(r => r.result) ?? [];

  const isEmergencyAdmin = emergencyAdmin?.toString().toLowerCase() === walletAddress.toLowerCase();
  const isAdmin          = adminMultisig?.toString().toLowerCase() === walletAddress.toLowerCase();

  const multisigTx  = useTx();
  const emergencyTx = useTx();
  const pauseTx     = useTx();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Governance"
          subtitle="CRE governance configuration — admin multisig, emergency admin, timelock"
          action={<Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>}
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-[var(--color-text-muted)] mb-0.5">Admin Multisig</p>
            <p className="font-mono text-[var(--color-text)]">{adminMultisig ? <AddressLink address={adminMultisig as string} chars={10} /> : "—"}</p>
            {isAdmin && <span className="text-emerald-600 text-[10px]">← you</span>}
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] mb-0.5">Emergency Admin</p>
            <p className="font-mono text-[var(--color-text)]">{emergencyAdmin ? <AddressLink address={emergencyAdmin as string} chars={10} /> : "—"}</p>
            {isEmergencyAdmin && <span className="text-emerald-600 text-[10px]">← you</span>}
          </div>
          <div>
            <p className="text-[var(--color-text-muted)] mb-0.5">Timelock</p>
            <p className="font-mono text-[var(--color-text)]">{timelock ? <AddressLink address={timelock as string} chars={10} /> : "—"}</p>
          </div>
        </div>
        {!isAdmin && !isEmergencyAdmin && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the admin multisig or emergency admin — write actions will revert.
          </p>
        )}
      </Card>

      {/* Emergency controls */}
      <Card className="border-red-900/50">
        <CardHeader
          title="Emergency Controls"
          subtitle="Only callable by the emergency admin"
          action={<ShieldAlert size={14} className="text-red-600" />}
        />
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={pauseTx.isPending || pauseTx.confirming}
              disabled={!isEmergencyAdmin}
              onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: govAddress, abi: GOVERNANCE_ABI, functionName: "emergencyPause" }); }}>
              Emergency Pause
            </Button>
            <Button size="sm" variant="secondary" loading={pauseTx.isPending || pauseTx.confirming}
              disabled={!isEmergencyAdmin}
              onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: govAddress, abi: GOVERNANCE_ABI, functionName: "emergencyUnpause" }); }}>
              Emergency Unpause
            </Button>
          </div>
          {!isEmergencyAdmin && <p className="text-xs text-[var(--color-text-muted)]">Emergency admin: {emergencyAdmin ? <AddressLink address={emergencyAdmin as string} chars={10} /> : "—"}</p>}
          <TxStatus hash={pauseTx.hash} confirming={pauseTx.confirming} confirmed={pauseTx.confirmed} error={pauseTx.error} />
        </div>
      </Card>

      {/* Role management */}
      <Card>
        <CardHeader title="Role Management" subtitle="Timelock-gated in production — owner only" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Admin Multisig</p>
            <div className="flex gap-2">
              <input value={newMultisig} onChange={e => setNewMultisig(e.target.value)} placeholder="New multisig address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={multisigTx.isPending || multisigTx.confirming} disabled={!newMultisig}
                onClick={() => { multisigTx.reset(); multisigTx.writeContract({ address: govAddress, abi: GOVERNANCE_ABI, functionName: "setAdminMultisig", args: [newMultisig as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={multisigTx.hash} confirming={multisigTx.confirming} confirmed={multisigTx.confirmed} error={multisigTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Emergency Admin</p>
            <div className="flex gap-2">
              <input value={newEmergency} onChange={e => setNewEmergency(e.target.value)} placeholder="New emergency admin (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={emergencyTx.isPending || emergencyTx.confirming} disabled={!newEmergency}
                onClick={() => { emergencyTx.reset(); emergencyTx.writeContract({ address: govAddress, abi: GOVERNANCE_ABI, functionName: "setEmergencyAdmin", args: [newEmergency as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={emergencyTx.hash} confirming={emergencyTx.confirming} confirmed={emergencyTx.confirmed} error={emergencyTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
