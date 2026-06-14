"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { PROPERTY_LLC_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { RefreshCw } from "lucide-react";
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

export default function PropertyLLCPanel({ llcAddress, isOwner }: {
  llcAddress: `0x${string}`;
  isOwner: boolean;
}) {
  const [rentAmount, setRentAmount] = useState("");
  const [newManager, setNewManager] = useState("");
  const [newToken, setNewToken]     = useState("");
  const [newFeeBps, setNewFeeBps]   = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "propertyName" },
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "propertyAddress" },
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "propertyId" },
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "securityToken" },
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "propertyManager" },
      { address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "managementFeeBps" },
    ],
  });

  const [propName, propAddress, propId, securityToken, propertyManager, managementFeeBps] =
    data?.map(r => r.result) ?? [];

  const rentTx    = useTx();
  const managerTx = useTx();
  const tokenTx   = useTx();
  const feeTx     = useTx();
  const pauseTx   = useTx();

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="PropertyLLC"
          subtitle="On-chain LLC wrapper for CRE property — rent collection and management fee distribution"
          action={<Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <Stat label="Management Fee" value={managementFeeBps ? `${Number(managementFeeBps) / 100}%` : "—"} />
          <div className="col-span-2">
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Property</p>
            <p className="text-sm text-[var(--color-text)]">{propName as string ?? "—"}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{propAddress as string ?? "—"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs border-t border-[var(--color-border)] pt-3">
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Property ID</p><p className="font-mono text-[var(--color-text-secondary)]">{propId as string ?? "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Security Token</p><p className="font-mono text-[var(--color-text-secondary)] truncate">{securityToken as string ?? "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Property Manager</p><p className="font-mono text-[var(--color-text-secondary)] truncate">{propertyManager as string ?? "—"}</p></div>
        </div>
        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the owner — write actions will revert.
          </p>
        )}
      </Card>

      {/* Rent distribution */}
      <Card>
        <CardHeader title="Rent Distribution" subtitle="Collect and distribute rent to LLC unit holders" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={rentAmount} onChange={e => setRentAmount(e.target.value)} placeholder="Amount (USDC)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
            <Button size="sm" variant="primary" loading={rentTx.isPending || rentTx.confirming} disabled={!rentAmount}
              onClick={() => { rentTx.reset(); rentTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "distributeRent", args: [parseUnits(rentAmount || "0", 6)] }); }}>
              Distribute Rent
            </Button>
          </div>
          <TxStatus hash={rentTx.hash} confirming={rentTx.confirming} confirmed={rentTx.confirmed} error={rentTx.error} />
        </div>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader title="Config" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Property Manager</p>
            <div className="flex gap-2">
              <input value={newManager} onChange={e => setNewManager(e.target.value)} placeholder="New manager address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={managerTx.isPending || managerTx.confirming} disabled={!newManager}
                onClick={() => { managerTx.reset(); managerTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "setPropertyManager", args: [newManager as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={managerTx.hash} confirming={managerTx.confirming} confirmed={managerTx.confirmed} error={managerTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Security Token</p>
            <div className="flex gap-2">
              <input value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="Security token address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={tokenTx.isPending || tokenTx.confirming} disabled={!newToken}
                onClick={() => { tokenTx.reset(); tokenTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "setSecurityToken", args: [newToken as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={tokenTx.hash} confirming={tokenTx.confirming} confirmed={tokenTx.confirmed} error={tokenTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Management Fee (BPS)</p>
            <div className="flex gap-2">
              <input value={newFeeBps} onChange={e => setNewFeeBps(e.target.value)} placeholder="BPS (e.g. 200 = 2%)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
              <Button size="sm" variant="secondary" loading={feeTx.isPending || feeTx.confirming} disabled={!newFeeBps}
                onClick={() => { feeTx.reset(); feeTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "setManagementFee", args: [BigInt(newFeeBps || "0")] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={feeTx.hash} confirming={feeTx.confirming} confirmed={feeTx.confirmed} error={feeTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Emergency Pause / Unpause</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={pauseTx.isPending || pauseTx.confirming}
                onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "pause" }); }}>
                Pause
              </Button>
              <Button size="sm" variant="secondary" loading={pauseTx.isPending || pauseTx.confirming}
                onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: llcAddress, abi: PROPERTY_LLC_ABI, functionName: "unpause" }); }}>
                Unpause
              </Button>
            </div>
            <TxStatus hash={pauseTx.hash} confirming={pauseTx.confirming} confirmed={pauseTx.confirmed} error={pauseTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
