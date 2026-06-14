"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { DISTRIBUTION_MANAGER_ABI } from "@/lib/contracts/abis";
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

export default function DistributionManagerPanel({ managerAddress, isOwner }: {
  managerAddress: `0x${string}`;
  isOwner: boolean;
}) {
  // Property address for all state/params queries
  const [propertyAddr, setPropertyAddr] = useState("");
  const [queryProp, setQueryProp] = useState<`0x${string}` | null>(null);

  // setDistributionParams fields — matches DistributionParams struct
  const [prefReturnBps, setPrefReturnBps] = useState("");
  const [sponsorPromoteBps, setSponsorPromoteBps] = useState("");
  const [waterfallThreshold, setWaterfallThreshold] = useState("");

  // processDistribution
  const [processAmount, setProcessAmount] = useState("");

  const { data: globalData, refetch } = useReadContracts({
    contracts: [
      { address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "tokenContract" },
      { address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "usdc" },
    ],
  });
  const [tokenContract, usdcAddr] = globalData?.map(r => r.result) ?? [];

  const { data: stateData } = useReadContracts({
    contracts: queryProp ? [
      { address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "getDistributionState",  args: [queryProp] },
      { address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "getDistributionParams", args: [queryProp] },
    ] : [],
    query: { enabled: !!queryProp },
  });

  type DistState  = { totalDistributed: bigint; preferredReturnPaid: bigint; sponsorPromotePaid: bigint; investorPayout: bigint; lastDistributionTime: bigint };
  type DistParams = { preferredReturnBps: bigint; sponsorPromoteBps: bigint; waterfallThreshold: bigint };

  const distState  = stateData?.[0]?.result as DistState  | undefined;
  const distParams = stateData?.[1]?.result as DistParams | undefined;

  const paramsTx   = useTx();
  const processTx  = useTx();
  const tokenTx    = useTx();
  const usdcTx     = useTx();

  const [newToken, setNewToken] = useState("");
  const [newUsdc,  setNewUsdc]  = useState("");

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Distribution Manager"
          subtitle="CRE waterfall engine — preferred return, sponsor promote, pro-rata payout"
          action={<Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>}
        />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Security Token</p><p className="text-xs font-mono text-[var(--color-text-secondary)]">{tokenContract as string ?? "—"}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">USDC</p><p className="text-xs font-mono text-[var(--color-text-secondary)]">{usdcAddr as string ?? "—"}</p></div>
        </div>
        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the owner — write actions will revert.
          </p>
        )}
      </Card>

      {/* Property state lookup */}
      <Card>
        <CardHeader title="Property Distribution State" />
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={propertyAddr} onChange={e => setPropertyAddr(e.target.value)} placeholder="Property address (0x…)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
            <Button size="sm" variant="secondary" onClick={() => setQueryProp(propertyAddr as `0x${string}`)} disabled={!propertyAddr}>
              Load
            </Button>
          </div>
          {queryProp && distState && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Total Distributed"    value={`$${Number(formatUnits(distState.totalDistributed, 6)).toFixed(2)}`} sub="USDC" />
              <Stat label="Preferred Return Paid" value={`$${Number(formatUnits(distState.preferredReturnPaid, 6)).toFixed(2)}`} sub="USDC" />
              <Stat label="Sponsor Promote Paid" value={`$${Number(formatUnits(distState.sponsorPromotePaid, 6)).toFixed(2)}`} sub="USDC" />
              <Stat label="Investor Payout Paid" value={`$${Number(formatUnits(distState.investorPayout, 6)).toFixed(2)}`} sub="USDC" />
              <Stat label="Last Distribution"    value={distState.lastDistributionTime > 0n ? new Date(Number(distState.lastDistributionTime) * 1000).toLocaleDateString() : "Never"} />
            </div>
          )}
          {queryProp && distParams && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-[var(--color-border)] text-xs">
              <div><p className="text-[var(--color-text-muted)] mb-0.5">Preferred Return</p><p className="text-[var(--color-text)]">{Number(distParams.preferredReturnBps) / 100}%</p></div>
              <div><p className="text-[var(--color-text-muted)] mb-0.5">Sponsor Promote</p><p className="text-[var(--color-text)]">{Number(distParams.sponsorPromoteBps) / 100}%</p></div>
              <div><p className="text-[var(--color-text-muted)] mb-0.5">Waterfall Threshold</p><p className="text-[var(--color-text)]">${Number(formatUnits(distParams.waterfallThreshold, 6)).toFixed(2)}</p></div>
            </div>
          )}
        </div>
      </Card>

      {/* Set distribution params */}
      <Card>
        <CardHeader title="Set Distribution Params" />
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={prefReturnBps} onChange={e => setPrefReturnBps(e.target.value)} placeholder="Preferred return BPS (e.g. 800 = 8%)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            <input value={sponsorPromoteBps} onChange={e => setSponsorPromoteBps(e.target.value)} placeholder="Sponsor promote BPS (e.g. 2000 = 20%)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            <input value={waterfallThreshold} onChange={e => setWaterfallThreshold(e.target.value)} placeholder="Waterfall threshold (USDC, e.g. 100)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] col-span-2" />
          </div>
          <Button size="sm" variant="primary" loading={paramsTx.isPending || paramsTx.confirming}
            disabled={!queryProp || !prefReturnBps || !sponsorPromoteBps}
            onClick={() => {
              paramsTx.reset();
              paramsTx.writeContract({
                address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "setDistributionParams",
                args: [queryProp!, {
                  preferredReturnBps: BigInt(prefReturnBps || "0"),
                  sponsorPromoteBps:  BigInt(sponsorPromoteBps || "0"),
                  waterfallThreshold: parseUnits(waterfallThreshold || "0", 6),
                }],
              });
            }}>
            Set Params for {queryProp ? queryProp.slice(0, 10) + "…" : "property"}
          </Button>
          <TxStatus hash={paramsTx.hash} confirming={paramsTx.confirming} confirmed={paramsTx.confirmed} error={paramsTx.error} />
        </div>
      </Card>

      {/* Process distribution */}
      <Card>
        <CardHeader title="Process Distribution" subtitle="Run the waterfall for a specific property" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={processAmount} onChange={e => setProcessAmount(e.target.value)} placeholder="Total amount (USDC)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
            <Button size="sm" variant="primary" loading={processTx.isPending || processTx.confirming}
              disabled={!queryProp || !processAmount}
              onClick={() => {
                processTx.reset();
                processTx.writeContract({
                  address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "processDistribution",
                  args: [queryProp!, parseUnits(processAmount || "0", 6)],
                });
              }}>
              Process Waterfall
            </Button>
          </div>
          {!queryProp && <p className="text-xs text-[var(--color-text-muted)]">Load a property above first.</p>}
          <TxStatus hash={processTx.hash} confirming={processTx.confirming} confirmed={processTx.confirmed} error={processTx.error} />
        </div>
      </Card>

      {/* Admin config */}
      <Card>
        <CardHeader title="Admin Config" subtitle="Update linked token and USDC contracts" />
        <div className="space-y-4 divide-y divide-zinc-800">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Security Token Contract</p>
            <div className="flex gap-2">
              <input value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="New token address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={tokenTx.isPending || tokenTx.confirming} disabled={!newToken}
                onClick={() => { tokenTx.reset(); tokenTx.writeContract({ address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "setTokenContract", args: [newToken as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={tokenTx.hash} confirming={tokenTx.confirming} confirmed={tokenTx.confirmed} error={tokenTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">USDC Contract</p>
            <div className="flex gap-2">
              <input value={newUsdc} onChange={e => setNewUsdc(e.target.value)} placeholder="New USDC address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={usdcTx.isPending || usdcTx.confirming} disabled={!newUsdc}
                onClick={() => { usdcTx.reset(); usdcTx.writeContract({ address: managerAddress, abi: DISTRIBUTION_MANAGER_ABI, functionName: "setUSDCContract", args: [newUsdc as `0x${string}`] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={usdcTx.hash} confirming={usdcTx.confirming} confirmed={usdcTx.confirmed} error={usdcTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
