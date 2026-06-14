"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { PROPERTY_TOKEN_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { explorerAddressUrl, explorerTxUrl, AddressLink, TxLink, truncateAddr } from "@/lib/explorer";
import { Coins, Users, RefreshCw, ExternalLink } from "lucide-react";

// ── small helpers ──────────────────────────────────────────────────────────────

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{label}</p>
      <p className={`text-sm text-[var(--color-text)] ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function TxStatus({ hash, confirming, confirmed, error }: {
  hash?: `0x${string}`;
  confirming: boolean;
  confirmed: boolean;
  error?: Error | null;
}) {
  if (error) return <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mt-2">{error.message.slice(0, 200)}</p>;
  if (confirmed) return <p className="text-xs text-emerald-600 mt-2">Transaction confirmed. <TxLink hash={hash} label="View on explorer" /></p>;
  if (confirming) return <p className="text-xs text-amber-600 mt-2">Confirming…</p>;
  return null;
}

// ── hook: single write with receipt ──────────────────────────────────────────

function useTx() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });
  return { writeContract, hash, isPending, confirming, confirmed, error, reset };
}

// ── panel sections ─────────────────────────────────────────────────────────────

function DepositRentSection({ address, isOwner }: { address: `0x${string}`; isOwner: boolean }) {
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx();

  const submit = () => {
    tx.reset();
    tx.writeContract({
      address, abi: PROPERTY_TOKEN_ABI, functionName: "depositRent",
      args: [from as `0x${string}`, parseUnits(amount || "0", 6)],
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Deposit Rent (USDC)</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={from} onChange={e => setFrom(e.target.value)} placeholder="From address (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (USDC)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="primary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!from || !amount}>
        <Coins size={11} /> Deposit Rent
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function DistributeSection({ address }: { address: `0x${string}` }) {
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "distributeToAllHolders" }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Push Distribution</p>
      <p className="text-xs text-[var(--color-text-muted)]">Distributes entire vault balance proportionally to all current holders.</p>
      <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming}>
        Distribute to All Holders
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function SyncSection({ address }: { address: `0x${string}` }) {
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "sync" }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Sync Vault</p>
      <p className="text-xs text-[var(--color-text-muted)]">Syncs USDC balance from direct transfers (e.g., from Rentline). Call this after USDC arrives but before distributing.</p>
      <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming}>
        <RefreshCw size={11} /> Sync
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function SyncAndDistributeSection({ address }: { address: `0x${string}` }) {
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "syncAndDistribute" }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Sync + Distribute (Auto)</p>
      <p className="text-xs text-[var(--color-text-muted)]">One-click: syncs vault then pushes to all holders. Ideal for cron jobs — no Chainlink needed.</p>
      <Button size="sm" variant="primary" onClick={submit} loading={tx.isPending || tx.confirming}>
        <RefreshCw size={11} /> Sync & Distribute
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function MintSection({ address }: { address: `0x${string}` }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const submit = () => {
    tx.reset();
    tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "mint", args: [to as `0x${string}`, parseUnits(amount || "0", 18)] });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Mint Tokens</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="Recipient (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (tokens)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!to || !amount}>
        Mint
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function BurnSection({ address }: { address: `0x${string}` }) {
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "burn", args: [parseUnits(amount || "0", 18)] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Burn Tokens (from your balance)</p>
      <div className="flex gap-2">
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount to burn"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-48" />
        <Button size="sm" variant="danger" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!amount}>
          Burn
        </Button>
      </div>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function WithdrawFeesSection({ address }: { address: `0x${string}` }) {
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "withdrawFees", args: [parseUnits(amount || "0", 6)] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Withdraw Fees (USDC)</p>
      <div className="flex gap-2">
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (USDC)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-48" />
        <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!amount}>
          Withdraw
        </Button>
      </div>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function UpdateInfoSection({ address }: { address: `0x${string}` }) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "updatePropertyInfo", args: [name, addr] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Update Property Info</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="New name"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={addr} onChange={e => setAddr(e.target.value)} placeholder="New physical address"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!name && !addr}>
        Update Info
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function SetMetadataSection({ address }: { address: `0x${string}` }) {
  const [uri, setUri] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "setMetadataUri", args: [uri] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Set Metadata URI</p>
      <div className="flex gap-2">
        <input value={uri} onChange={e => setUri(e.target.value)} placeholder="https://…/metadata/geo-id.json"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
        <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!uri}>
          Set URI
        </Button>
      </div>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function AuthDistributorSection({ address }: { address: `0x${string}` }) {
  const [distributor, setDistributor] = useState("");
  const [authorized, setAuthorized] = useState(true);
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "setAuthorizedDistributor", args: [distributor as `0x${string}`, authorized] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Authorized Distributor</p>
      <div className="flex gap-2 items-center">
        <input value={distributor} onChange={e => setDistributor(e.target.value)} placeholder="Distributor address (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
        <select value={authorized ? "1" : "0"} onChange={e => setAuthorized(e.target.value === "1")}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]">
          <option value="1">Authorize</option>
          <option value="0">Revoke</option>
        </select>
        <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!distributor}>
          Set
        </Button>
      </div>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function RecoverSection({ address }: { address: `0x${string}` }) {
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: PROPERTY_TOKEN_ABI, functionName: "recoverTokens", args: [token as `0x${string}`, parseUnits(amount || "0", 18)] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Recover Stuck Tokens</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="Token contract (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="danger" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!token || !amount}>
        Recover
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function HoldersSection({ address }: { address: `0x${string}` }) {
  const [page, setPage] = useState(0);
  const PAGE = 20n;
  const { data: countData } = useReadContracts({ contracts: [{ address, abi: PROPERTY_TOKEN_ABI, functionName: "holderCount" }] });
  const holderCount = (countData?.[0]?.result ?? 0n) as bigint;
  const { data: holdersData } = useReadContracts({
    contracts: [{ address, abi: PROPERTY_TOKEN_ABI, functionName: "getHolders", args: [BigInt(page) * PAGE, PAGE] }],
    query: { enabled: holderCount > 0n },
  });
  const holders = (holdersData?.[0]?.result ?? []) as `0x${string}`[];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1"><Users size={11} /> Holders ({holderCount.toString()})</p>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</Button>
          <span className="text-xs text-[var(--color-text-muted)] px-1 py-1">pg {page + 1}</span>
          <Button size="sm" variant="ghost" onClick={() => setPage(p => p + 1)} disabled={holders.length < Number(PAGE)}>›</Button>
        </div>
      </div>
      {holders.length === 0
        ? <p className="text-xs text-[var(--color-text-muted)]">No holders yet.</p>
        : <div className="space-y-1">{holders.map(h => (
            <div key={h} className="flex items-center gap-2 text-xs font-mono text-[var(--color-text-secondary)]">
              <a href={explorerAddressUrl(h)} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-text)] flex items-center gap-1">
                {h} <ExternalLink size={9} />
              </a>
            </div>
          ))}</div>
      }
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function PropertyTokenPanel({ tokenAddress, walletAddress }: {
  tokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "name" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "totalSupply" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "balanceOf", args: [walletAddress] },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "getVaultBalance" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "totalDistributed" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "getAvailableRewards", args: [walletAddress] },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "holderCount" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "propertyOwner" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "propertyName" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "propertyAddress" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "usdc" },
      { address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "metadataUri" },
    ],
  });

  const [name, symbol, totalSupply, balance, vaultBalance, totalDist, pendingRewards, holderCount, propertyOwner, propName, propAddr, usdc, metaUri] =
    data?.map(r => r.result) ?? [];

  const isOwner = propertyOwner?.toString().toLowerCase() === walletAddress.toLowerCase();

  const withdrawTx = useTx();
  const handleWithdraw = () => {
    withdrawTx.reset();
    withdrawTx.writeContract({ address: tokenAddress, abi: PROPERTY_TOKEN_ABI, functionName: "withdrawRewards" });
  };

  const hasRewards = pendingRewards && (pendingRewards as bigint) > 0n;

  return (
    <div className="space-y-5">
      {/* Overview */}
      <Card>
        <CardHeader
          title="PropertyToken"
          subtitle={`${propName ?? name ?? tokenAddress}`}
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>
              <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /></a>
            </div>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Total Supply"    value={totalSupply  ? Number(formatUnits(totalSupply  as bigint, 18)).toLocaleString() : "—"} sub="tokens" />
          <Stat label="Vault Balance"   value={vaultBalance ? `$${Number(formatUnits(vaultBalance as bigint, 6)).toFixed(4)}` : "—"} sub="USDC" />
          <Stat label="Total Distributed" value={totalDist  ? `$${Number(formatUnits(totalDist as bigint, 6)).toFixed(2)}` : "—"} sub="USDC" />
          <Stat label="Holders"         value={holderCount ? holderCount.toString() : "—"} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm border-t border-[var(--color-border)] pt-3">
          <Field label="Token"            value={`${name ?? "—"} (${symbol ?? "—"})`} />
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Owner</p>
            <p className="text-sm font-mono text-[var(--color-text)]">{propertyOwner ? <AddressLink address={propertyOwner as string} chars={8} /> : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">USDC</p>
            <p className="text-sm font-mono text-[var(--color-text)]">{usdc ? <AddressLink address={usdc as string} chars={8} /> : "—"}</p>
          </div>
          <Field label="Physical Address" value={propAddr as string ?? "—"} />
          <Field label="Metadata URI"     value={metaUri as string ?? "—"} mono />
        </div>
        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not the property owner — write actions will revert.
          </p>
        )}
      </Card>

      {/* Withdraw rewards (any holder) */}
      {hasRewards && (
        <Card className="border-emerald-800">
          <CardHeader title="Pending Rewards" subtitle={`$${Number(formatUnits(pendingRewards as bigint, 6)).toFixed(6)} USDC available`} />
          <Button variant="primary" size="sm" onClick={handleWithdraw} loading={withdrawTx.isPending || withdrawTx.confirming}>
            <Coins size={12} /> Withdraw Rewards
          </Button>
          <TxStatus hash={withdrawTx.hash} confirming={withdrawTx.confirming} confirmed={withdrawTx.confirmed} error={withdrawTx.error} />
        </Card>
      )}

      {/* Vault operations */}
      <Card>
        <CardHeader title="Vault Operations" subtitle="Deposit rent, push distributions, withdraw fees" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <DepositRentSection address={tokenAddress} isOwner={isOwner} />
          <div className="pt-4"><DistributeSection address={tokenAddress} /></div>
          <div className="pt-4"><SyncSection address={tokenAddress} /></div>
          <div className="pt-4"><SyncAndDistributeSection address={tokenAddress} /></div>
          <div className="pt-4"><WithdrawFeesSection address={tokenAddress} /></div>
        </div>
      </Card>

      {/* Supply management */}
      <Card>
        <CardHeader title="Supply Management" subtitle="Mint additional tokens or burn from your balance" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <MintSection address={tokenAddress} />
          <div className="pt-4"><BurnSection address={tokenAddress} /></div>
        </div>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader title="Config" subtitle="Update on-chain metadata and distributor authorization" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <UpdateInfoSection address={tokenAddress} />
          <div className="pt-4"><SetMetadataSection address={tokenAddress} /></div>
          <div className="pt-4"><AuthDistributorSection address={tokenAddress} /></div>
          <div className="pt-4"><RecoverSection address={tokenAddress} /></div>
        </div>
      </Card>

      {/* Holders */}
      <Card>
        <HoldersSection address={tokenAddress} />
      </Card>
    </div>
  );
}
