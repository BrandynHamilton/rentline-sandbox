"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { PROPERTY_NFT_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { explorerAddressUrl, explorerTxUrl, AddressLink, TxLink, truncateAddr } from "@/lib/explorer";
import { RefreshCw, ExternalLink, ImageIcon, Coins } from "lucide-react";

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

export default function PropertyNFTPanel({ tokenAddress, walletAddress }: {
  tokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  const [depositFrom, setDepositFrom] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [feesAmount, setFeesAmount] = useState("");
  const [newName, setNewName] = useState("");
  const [newAddr, setNewAddr] = useState("");
  const [newUri, setNewUri] = useState("");
  const [distributor, setDistributor] = useState("");
  const [distributorAuth, setDistributorAuth] = useState(true);
  const [recoverToken, setRecoverToken] = useState("");
  const [recoverAmount, setRecoverAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const { data, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "name" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "ownerOf", args: [0n] },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "tokenURI", args: [0n] },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getVaultBalance" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getTotalDistributed" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "getAvailableYield" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "propertyName" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "propertyAddress" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "propertyOwner" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "usdc" },
      { address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "metadataUri" },
    ],
  });

  const [name, symbol, nftOwner, tokenUri, vaultBalance, totalDistributed, availableYield,
         propName, propAddr, propertyOwner, usdc, metadataUri] = data?.map(r => r.result) ?? [];

  const isNFTOwner      = (nftOwner as string | undefined)?.toLowerCase()      === walletAddress.toLowerCase();
  const isPropertyOwner = (propertyOwner as string | undefined)?.toLowerCase() === walletAddress.toLowerCase();
  const hasYield        = availableYield && (availableYield as bigint) > 0n;

  const withdrawTx   = useTx();
  const distributeTx = useTx();
  const syncTx       = useTx();
  const syncDistTx   = useTx();
  const depositTx    = useTx();
  const feesTx       = useTx();
  const infoTx       = useTx();
  const uriTx        = useTx();
  const authTx       = useTx();
  const recoverTx    = useTx();
  const transferTx   = useTx();

  return (
    <div className="space-y-5">
      {/* Overview */}
      <Card>
        <CardHeader
          title="PropertyNFT"
          subtitle={`${propName ?? name ?? tokenAddress} · tokenId = 0`}
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>
              <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /></a>
            </div>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Vault Balance"     value={vaultBalance     ? `$${Number(formatUnits(vaultBalance as bigint, 6)).toFixed(4)}` : "—"} sub="USDC" />
          <Stat label="Available Yield"   value={availableYield   ? `$${Number(formatUnits(availableYield as bigint, 6)).toFixed(4)}` : "—"} sub="USDC" />
          <Stat label="Total Distributed" value={totalDistributed ? `$${Number(formatUnits(totalDistributed as bigint, 6)).toFixed(2)}` : "—"} sub="USDC" />
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">NFT Type</p>
            <div className="flex items-center gap-1 text-blue-600">
              <ImageIcon size={12} />
              <span className="text-sm font-semibold">ERC-721 Deed</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs border-t border-[var(--color-border)] pt-3">
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Token</p><p className="text-[var(--color-text)]">{name as string ?? "—"} ({symbol as string ?? "—"})</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">NFT Owner (tokenId=0)</p><p className="font-mono text-[var(--color-text-secondary)]">{nftOwner ? <AddressLink address={nftOwner as string} chars={10} /> : "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Contract Owner</p><p className="font-mono text-[var(--color-text-secondary)]">{propertyOwner ? <AddressLink address={propertyOwner as string} chars={10} /> : "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">USDC</p><p className="font-mono text-[var(--color-text-secondary)]">{usdc ? <AddressLink address={usdc as string} chars={10} /> : "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Physical Address</p><p className="text-[var(--color-text)]">{propAddr as string ?? "—"}</p></div>
          <div><p className="text-[var(--color-text-muted)] mb-0.5">Metadata URI</p><p className="font-mono text-[var(--color-text-secondary)] truncate">{metadataUri as string ?? "—"}</p></div>
        </div>

        {!isNFTOwner && !isPropertyOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet does not own this NFT or contract — write actions will revert.
          </p>
        )}
      </Card>

      {/* Withdraw yield — NFT owner only */}
      {hasYield && (
        <Card className="border-emerald-800">
          <CardHeader title="Pending Yield" subtitle={`$${Number(formatUnits(availableYield as bigint, 6)).toFixed(6)} USDC available to claim`} />
          <Button variant="primary" size="sm" onClick={() => { withdrawTx.reset(); withdrawTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "withdrawYield" }); }}
            loading={withdrawTx.isPending || withdrawTx.confirming}>
            <Coins size={12} /> Withdraw Yield
          </Button>
          <TxStatus hash={withdrawTx.hash} confirming={withdrawTx.confirming} confirmed={withdrawTx.confirmed} error={withdrawTx.error} />
        </Card>
      )}

      {/* Transfer NFT */}
      <Card>
        <CardHeader title="Transfer NFT" subtitle="Transfer the property deed (tokenId=0) to another address" />
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={transferTo} onChange={e => setTransferTo(e.target.value)} placeholder="Recipient address (0x…)"
              className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
            <Button size="sm" variant="secondary" loading={transferTx.isPending || transferTx.confirming} disabled={!transferTo || !isNFTOwner}
              onClick={() => { transferTx.reset(); transferTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "safeTransferFrom", args: [walletAddress, transferTo as `0x${string}`, 0n] }); }}>
              Transfer
            </Button>
          </div>
          {!isNFTOwner && <p className="text-xs text-[var(--color-text-muted)]">Only the current NFT owner can transfer.</p>}
          <TxStatus hash={transferTx.hash} confirming={transferTx.confirming} confirmed={transferTx.confirmed} error={transferTx.error} />
        </div>
      </Card>

      {/* Vault operations */}
      <Card>
        <CardHeader title="Vault Operations" subtitle="Deposit rent, push distribution, withdraw fees" />
        <div className="space-y-5 divide-y divide-zinc-800">
          {/* Deposit rent */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Deposit Rent (USDC)</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={depositFrom} onChange={e => setDepositFrom(e.target.value)} placeholder="From address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
              <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount (USDC)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <Button size="sm" variant="primary" loading={depositTx.isPending || depositTx.confirming} disabled={!depositFrom || !depositAmount}
              onClick={() => { depositTx.reset(); depositTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "depositRent", args: [depositFrom as `0x${string}`, parseUnits(depositAmount || "0", 6)] }); }}>
              Deposit Rent
            </Button>
            <TxStatus hash={depositTx.hash} confirming={depositTx.confirming} confirmed={depositTx.confirmed} error={depositTx.error} />
          </div>

          {/* Push distribute */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Push Distribution</p>
            <p className="text-xs text-[var(--color-text-muted)]">Sends entire vault balance to the current NFT owner. Callable by contract owner or authorized distributor.</p>
            <Button size="sm" variant="secondary" loading={distributeTx.isPending || distributeTx.confirming}
              onClick={() => { distributeTx.reset(); distributeTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "distributeYield" }); }}>
              Distribute Yield
            </Button>
            <TxStatus hash={distributeTx.hash} confirming={distributeTx.confirming} confirmed={distributeTx.confirmed} error={distributeTx.error} />
          </div>

          {/* Sync vault */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Sync Vault</p>
            <p className="text-xs text-[var(--color-text-muted)]">Syncs USDC balance from direct transfers (e.g., from Rentline). Call after USDC arrives.</p>
            <Button size="sm" variant="secondary" loading={syncTx.isPending || syncTx.confirming}
              onClick={() => { syncTx.reset(); syncTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "sync" }); }}>
              <RefreshCw size={11} /> Sync
            </Button>
            <TxStatus hash={syncTx.hash} confirming={syncTx.confirming} confirmed={syncTx.confirmed} error={syncTx.error} />
          </div>

          {/* Sync + Distribute */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Sync + Distribute (Auto)</p>
            <p className="text-xs text-[var(--color-text-muted)]">One-click: syncs vault then pushes to NFT holder. Ideal for cron jobs.</p>
            <Button size="sm" variant="primary" loading={syncDistTx.isPending || syncDistTx.confirming}
              onClick={() => { syncDistTx.reset(); syncDistTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "syncAndDistribute" }); }}>
              <RefreshCw size={11} /> Sync & Distribute
            </Button>
            <TxStatus hash={syncDistTx.hash} confirming={syncDistTx.confirming} confirmed={syncDistTx.confirmed} error={syncDistTx.error} />
          </div>

          {/* Withdraw fees */}
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Withdraw Fees (contract owner only)</p>
            <div className="flex gap-2">
              <input value={feesAmount} onChange={e => setFeesAmount(e.target.value)} placeholder="Amount (USDC)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)] w-40" />
              <Button size="sm" variant="secondary" loading={feesTx.isPending || feesTx.confirming} disabled={!feesAmount}
                onClick={() => { feesTx.reset(); feesTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "withdrawFees", args: [parseUnits(feesAmount || "0", 6)] }); }}>
                Withdraw
              </Button>
            </div>
            <TxStatus hash={feesTx.hash} confirming={feesTx.confirming} confirmed={feesTx.confirmed} error={feesTx.error} />
          </div>
        </div>
      </Card>

      {/* Config */}
      <Card>
        <CardHeader title="Config" subtitle="Update property info, metadata URI, authorized distributors" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Update Property Info</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New name"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
              <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="New physical address"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <Button size="sm" variant="secondary" loading={infoTx.isPending || infoTx.confirming} disabled={!newName && !newAddr}
              onClick={() => { infoTx.reset(); infoTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "updatePropertyInfo", args: [newName, newAddr] }); }}>
              Update
            </Button>
            <TxStatus hash={infoTx.hash} confirming={infoTx.confirming} confirmed={infoTx.confirmed} error={infoTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Set Metadata URI</p>
            <div className="flex gap-2">
              <input value={newUri} onChange={e => setNewUri(e.target.value)} placeholder="https://…"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <Button size="sm" variant="secondary" loading={uriTx.isPending || uriTx.confirming} disabled={!newUri}
                onClick={() => { uriTx.reset(); uriTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "setMetadataUri", args: [newUri] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={uriTx.hash} confirming={uriTx.confirming} confirmed={uriTx.confirmed} error={uriTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Authorized Distributor</p>
            <div className="flex gap-2 items-center">
              <input value={distributor} onChange={e => setDistributor(e.target.value)} placeholder="Distributor address (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
              <select value={distributorAuth ? "1" : "0"} onChange={e => setDistributorAuth(e.target.value === "1")}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]">
                <option value="1">Authorize</option>
                <option value="0">Revoke</option>
              </select>
              <Button size="sm" variant="secondary" loading={authTx.isPending || authTx.confirming} disabled={!distributor}
                onClick={() => { authTx.reset(); authTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "setAuthorizedDistributor", args: [distributor as `0x${string}`, distributorAuth] }); }}>
                Set
              </Button>
            </div>
            <TxStatus hash={authTx.hash} confirming={authTx.confirming} confirmed={authTx.confirmed} error={authTx.error} />
          </div>
          <div className="pt-4 space-y-2">
            <p className="text-xs font-semibold text-[var(--color-text)]">Recover Stuck Tokens</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={recoverToken} onChange={e => setRecoverToken(e.target.value)} placeholder="Token contract (0x…)"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
              <input value={recoverAmount} onChange={e => setRecoverAmount(e.target.value)} placeholder="Amount"
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
            </div>
            <Button size="sm" variant="danger" loading={recoverTx.isPending || recoverTx.confirming} disabled={!recoverToken || !recoverAmount}
              onClick={() => { recoverTx.reset(); recoverTx.writeContract({ address: tokenAddress, abi: PROPERTY_NFT_ABI, functionName: "recoverTokens", args: [recoverToken as `0x${string}`, parseUnits(recoverAmount || "0", 18)] }); }}>
              Recover
            </Button>
            <TxStatus hash={recoverTx.hash} confirming={recoverTx.confirming} confirmed={recoverTx.confirmed} error={recoverTx.error} />
          </div>
        </div>
      </Card>
    </div>
  );
}
