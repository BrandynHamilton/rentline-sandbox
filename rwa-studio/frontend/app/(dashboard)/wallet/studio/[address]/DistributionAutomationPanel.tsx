"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { DISTRIBUTION_AUTOMATION_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { RefreshCw, Zap } from "lucide-react";
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

export default function DistributionAutomationPanel({ automationAddress, isOwner }: {
  automationAddress: `0x${string}`;
  isOwner: boolean;
}) {
  const [minAmount, setMinAmount] = useState("");
  const [minInterval, setMinInterval] = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [{ address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "status" }],
  });

  const statusResult = data?.[0]?.result as readonly [boolean, bigint, bigint, bigint, bigint, boolean] | undefined;
  const [paused, vaultBalance, holderCount, lastDist, nextAllowed, readyToDistribute] = statusResult ?? [];

  const { data: params } = useReadContracts({
    contracts: [
      { address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "minDistributionAmount" },
      { address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "minInterval" },
      { address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "propertyToken" },
    ],
  });
  const [minAmountOnChain, minIntervalOnChain, propertyToken] = params?.map(r => r.result) ?? [];

  const pauseTx = useTx();
  const amountTx = useTx();
  const intervalTx = useTx();

  const now = Math.floor(Date.now() / 1000);
  const nextAllowedTs = nextAllowed ? Number(nextAllowed) : 0;
  const timeUntilNext = nextAllowedTs > now ? nextAllowedTs - now : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Distribution Automation"
          subtitle="Chainlink Automation status and configuration"
          action={<Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>}
        />

        {/* Status grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <Stat label="Status" value={paused ? "Paused" : readyToDistribute ? "Ready" : "Waiting"} />
          <Stat label="Vault Balance" value={vaultBalance ? `$${Number(formatUnits(vaultBalance, 6)).toFixed(4)}` : "—"} sub="USDC" />
          <Stat label="Holder Count"  value={holderCount?.toString() ?? "—"} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border-t border-[var(--color-border)] pt-3">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Min Distribution</p>
            <p className="text-xs text-[var(--color-text)]">{minAmountOnChain ? `$${Number(formatUnits(minAmountOnChain as bigint, 6)).toFixed(2)} USDC` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Min Interval</p>
            <p className="text-xs text-[var(--color-text)]">{minIntervalOnChain ? `${Math.floor(Number(minIntervalOnChain) / 3600)}h` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Next Allowed In</p>
            <p className="text-xs text-[var(--color-text)]">{timeUntilNext > 0 ? `${Math.ceil(timeUntilNext / 60)}m` : "Now"}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Property Token</p>
            <p className="text-xs font-mono text-[var(--color-text-secondary)]">{propertyToken as string ?? "—"}</p>
          </div>
        </div>

        {readyToDistribute && !paused && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 border border-emerald-700/30 rounded px-3 py-2">
            <Zap size={11} /> Chainlink upkeep will trigger on the next block scan.
          </div>
        )}

        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the automation owner — write actions will revert.
          </p>
        )}
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader title="Controls" />
        <div className="space-y-5 divide-y divide-zinc-800">
          {/* Pause / unpause */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Pause / Resume</p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger"
                loading={pauseTx.isPending || pauseTx.confirming}
                onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "setPaused", args: [true] }); }}>
                Pause
              </Button>
              <Button size="sm" variant="secondary"
                loading={pauseTx.isPending || pauseTx.confirming}
                onClick={() => { pauseTx.reset(); pauseTx.writeContract({ address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "setPaused", args: [false] }); }}>
                Resume
              </Button>
            </div>
            <TxStatus hash={pauseTx.hash} confirming={pauseTx.confirming} confirmed={pauseTx.confirmed} error={pauseTx.error} />
          </div>

          {/* Min distribution amount */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Min Distribution Amount (USDC)</p>
            <div className="flex gap-2">
              <input value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder={`Current: ${minAmountOnChain ? Number(formatUnits(minAmountOnChain as bigint, 6)).toFixed(2) : "—"}`}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
              <Button size="sm" variant="secondary" loading={amountTx.isPending || amountTx.confirming} disabled={!minAmount}
                onClick={() => { amountTx.reset(); amountTx.writeContract({ address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "setMinDistributionAmount", args: [parseUnits(minAmount || "0", 6)] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={amountTx.hash} confirming={amountTx.confirming} confirmed={amountTx.confirmed} error={amountTx.error} />
          </div>

          {/* Min interval */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Min Interval (seconds)</p>
            <div className="flex gap-2">
              <input value={minInterval} onChange={e => setMinInterval(e.target.value)} placeholder={`Current: ${minIntervalOnChain?.toString() ?? "—"}s`}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
              <Button size="sm" variant="secondary" loading={intervalTx.isPending || intervalTx.confirming} disabled={!minInterval}
                onClick={() => { intervalTx.reset(); intervalTx.writeContract({ address: automationAddress, abi: DISTRIBUTION_AUTOMATION_ABI, functionName: "setMinInterval", args: [BigInt(minInterval || "0")] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={intervalTx.hash} confirming={intervalTx.confirming} confirmed={intervalTx.confirmed} error={intervalTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
