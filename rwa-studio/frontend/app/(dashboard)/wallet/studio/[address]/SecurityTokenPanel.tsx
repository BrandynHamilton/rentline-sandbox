"use client";
import { useState } from "react";
import { useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { SECURITY_TOKEN_ABI } from "@/lib/contracts/abis";
import Card, { CardHeader, Stat } from "@/components/Card";
import Button from "@/components/Button";
import { explorerAddressUrl, explorerTxUrl, AddressLink, TxLink, truncateAddr } from "@/lib/explorer";
import { RefreshCw, ExternalLink, CheckCircle, XCircle } from "lucide-react";

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

function InvestorLookup({ address }: { address: `0x${string}` }) {
  const [lookup, setLookup] = useState("");
  const [query, setQuery] = useState<`0x${string}` | null>(null);

  const { data } = useReadContracts({
    contracts: query ? [
      { address, abi: SECURITY_TOKEN_ABI, functionName: "isApproved",      args: [query] },
      { address, abi: SECURITY_TOKEN_ABI, functionName: "isAccredited",    args: [query] },
      { address, abi: SECURITY_TOKEN_ABI, functionName: "isInstitutional", args: [query] },
      { address, abi: SECURITY_TOKEN_ABI, functionName: "getLockupExpiry", args: [query] },
      { address, abi: SECURITY_TOKEN_ABI, functionName: "balanceOf",       args: [query] },
    ] : [],
    query: { enabled: !!query },
  });

  const [isApproved, isAccredited, isInstitutional, lockupExpiry, balance] = data?.map(r => r.result) ?? [];
  const lockupDate = lockupExpiry && (lockupExpiry as bigint) > 0n
    ? new Date(Number(lockupExpiry as bigint) * 1000).toLocaleDateString()
    : "None";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Investor Lookup</p>
      <div className="flex gap-2">
        <input value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Investor address (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
        <Button size="sm" variant="secondary" onClick={() => setQuery(lookup as `0x${string}`)} disabled={!lookup}>
          Look Up
        </Button>
      </div>
      {query && data && (
        <div className="bg-[var(--color-surface)] rounded-lg p-3 space-y-2 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-1">{isApproved ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-red-600" />}<span className="text-[var(--color-text)]">Approved</span></div>
            <div className="flex items-center gap-1">{isAccredited ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-[var(--color-text-muted)]" />}<span className="text-[var(--color-text)]">Accredited</span></div>
            <div className="flex items-center gap-1">{isInstitutional ? <CheckCircle size={11} className="text-emerald-600" /> : <XCircle size={11} className="text-[var(--color-text-muted)]" />}<span className="text-[var(--color-text)]">Institutional</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--color-border)]">
            <div><p className="text-[var(--color-text-muted)]">Balance</p><p className="text-[var(--color-text)]">{balance ? formatUnits(balance as bigint, 18) : "0"}</p></div>
            <div><p className="text-[var(--color-text-muted)]">Lockup Expires</p><p className="text-[var(--color-text)]">{lockupDate}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

function CanTransferCheck({ address }: { address: `0x${string}` }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState<[`0x${string}`, `0x${string}`] | null>(null);

  const { data } = useReadContracts({
    contracts: query ? [{ address, abi: SECURITY_TOKEN_ABI, functionName: "canTransfer", args: query }] : [],
    query: { enabled: !!query },
  });

  const result = data?.[0]?.result as [boolean, string] | undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Transfer Eligibility Check</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={from} onChange={e => setFrom(e.target.value)} placeholder="From (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="To (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="secondary" onClick={() => setQuery([from as `0x${string}`, to as `0x${string}`])} disabled={!from || !to}>
        Check
      </Button>
      {result && (
        <div className={`flex items-center gap-2 text-xs rounded px-3 py-2 ${result[0] ? "bg-emerald-500/10 border border-emerald-700/30 text-emerald-600" : "bg-red-500/10 border border-red-500/20 text-red-600"}`}>
          {result[0] ? <CheckCircle size={11} /> : <XCircle size={11} />}
          {result[0] ? "Transfer allowed" : result[1] || "Transfer blocked"}
        </div>
      )}
    </div>
  );
}

function ApproveInvestorSection({ address }: { address: `0x${string}` }) {
  const [investor, setInvestor] = useState("");
  const [accredited, setAccredited] = useState(false);
  const [institutional, setInstitutional] = useState(false);
  const [lockup, setLockup] = useState("");
  const tx = useTx();

  const submit = () => {
    tx.reset();
    const lockupTs = lockup ? BigInt(Math.floor(new Date(lockup).getTime() / 1000)) : 0n;
    tx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "approveInvestor",
      args: [investor as `0x${string}`, accredited, institutional, lockupTs] });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Approve Investor</p>
      <input value={investor} onChange={e => setInvestor(e.target.value)} placeholder="Investor address (0x…)"
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
          <input type="checkbox" checked={accredited} onChange={e => setAccredited(e.target.checked)} className="accent-emerald-500" />
          Accredited
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--color-text)]">
          <input type="checkbox" checked={institutional} onChange={e => setInstitutional(e.target.checked)} className="accent-emerald-500" />
          Institutional
        </label>
        <div>
          <span className="text-[var(--color-text-muted)] mr-1">Lockup until:</span>
          <input type="date" value={lockup} onChange={e => setLockup(e.target.value)}
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-0.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]" />
        </div>
      </div>
      <Button size="sm" variant="primary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!investor}>
        Approve Investor
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function RejectInvestorSection({ address }: { address: `0x${string}` }) {
  const [investor, setInvestor] = useState("");
  const [reason, setReason] = useState("");
  const tx = useTx();
  const submit = () => { tx.reset(); tx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "rejectInvestor", args: [investor as `0x${string}`, reason] }); };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Reject Investor</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={investor} onChange={e => setInvestor(e.target.value)} placeholder="Investor address (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
      </div>
      <Button size="sm" variant="danger" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!investor}>
        Reject
      </Button>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function UpdateLockupSection({ address }: { address: `0x${string}` }) {
  const [investor, setInvestor] = useState("");
  const [lockup, setLockup] = useState("");
  const tx = useTx();
  const submit = () => {
    tx.reset();
    const lockupTs = lockup ? BigInt(Math.floor(new Date(lockup).getTime() / 1000)) : 0n;
    tx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "updateLockup", args: [investor as `0x${string}`, lockupTs] });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-[var(--color-text)]">Update Lockup</p>
      <div className="flex gap-2 items-center">
        <input value={investor} onChange={e => setInvestor(e.target.value)} placeholder="Investor (0x…)"
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
        <input type="date" value={lockup} onChange={e => setLockup(e.target.value)}
          className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-blue)]" />
        <Button size="sm" variant="secondary" onClick={submit} loading={tx.isPending || tx.confirming} disabled={!investor}>
          Update
        </Button>
      </div>
      <TxStatus hash={tx.hash} confirming={tx.confirming} confirmed={tx.confirmed} error={tx.error} />
    </div>
  );
}

function VaultSection({ address }: { address: `0x${string}` }) {
  const [depositFrom, setDepositFrom] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [syncTx] = useState(() => useTx());
  const [syncDistTx] = useState(() => useTx());
  const [distributeTx] = useState(() => useTx());
  const [depositTx] = useState(() => useTx());
  const [withdrawTx] = useState(() => useTx());
  const [authDistributor, setAuthDistributor] = useState("");
  const [authEnabled, setAuthEnabled] = useState(true);
  const [authTx] = useState(() => useTx());

  return (
    <div className="space-y-5 divide-y divide-zinc-800">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Deposit Rent (USDC)</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={depositFrom} onChange={e => setDepositFrom(e.target.value)} placeholder="From address (0x…)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)]" />
          <input value={depositAmount} onChange={e => setDepositAmount(e.target.value)} placeholder="Amount (USDC)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 focus:outline-none focus:border-[var(--color-blue)]" />
        </div>
        <Button size="sm" variant="primary" loading={depositTx.isPending || depositTx.confirming} disabled={!depositFrom || !depositAmount}
          onClick={() => { depositTx.reset(); depositTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "depositRent", args: [depositFrom as `0x${string}`, BigInt(depositAmount || "0")] }); }}>
          Deposit Rent
        </Button>
        <TxStatus hash={depositTx.hash} confirming={depositTx.confirming} confirmed={depositTx.confirmed} error={depositTx.error} />
      </div>

      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Sync Vault</p>
        <p className="text-xs text-[var(--color-text-muted)]">Syncs USDC balance from direct transfers (e.g., from Rentline).</p>
        <Button size="sm" variant="secondary" loading={syncTx.isPending || syncTx.confirming}
          onClick={() => { syncTx.reset(); syncTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "sync" }); }}>
          <RefreshCw size={11} /> Sync
        </Button>
        <TxStatus hash={syncTx.hash} confirming={syncTx.confirming} confirmed={syncTx.confirmed} error={syncTx.error} />
      </div>

      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Sync + Distribute (Auto)</p>
        <p className="text-xs text-[var(--color-text-muted)]">One-click: syncs vault then pushes to all holders. Ideal for cron.</p>
        <Button size="sm" variant="primary" loading={syncDistTx.isPending || syncDistTx.confirming}
          onClick={() => { syncDistTx.reset(); syncDistTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "syncAndDistribute" }); }}>
          <RefreshCw size={11} /> Sync & Distribute
        </Button>
        <TxStatus hash={syncDistTx.hash} confirming={syncDistTx.confirming} confirmed={syncDistTx.confirmed} error={syncDistTx.error} />
      </div>

      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Push Distribution</p>
        <Button size="sm" variant="secondary" loading={distributeTx.isPending || distributeTx.confirming}
          onClick={() => { distributeTx.reset(); distributeTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "distributeToAllHolders" }); }}>
          Distribute to All Holders
        </Button>
        <TxStatus hash={distributeTx.hash} confirming={distributeTx.confirming} confirmed={distributeTx.confirmed} error={distributeTx.error} />
      </div>

      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Authorized Distributor</p>
        <div className="flex gap-2 items-center">
          <input value={authDistributor} onChange={e => setAuthDistributor(e.target.value)} placeholder="Distributor (0x…)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
          <Button size="sm" variant="secondary" loading={authTx.isPending || authTx.confirming} disabled={!authDistributor}
            onClick={() => { authTx.reset(); authTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setAuthorizedDistributor", args: [authDistributor as `0x${string}`, authEnabled] }); }}>
            Set
          </Button>
        </div>
        <TxStatus hash={authTx.hash} confirming={authTx.confirming} confirmed={authTx.confirmed} error={authTx.error} />
      </div>
    </div>
  );
}

function ConfigSection({ address }: { address: `0x${string}` }) {
  const [complianceMgr, setComplianceMgr] = useState("");
  const [govMultisig, setGovMultisig] = useState("");
  const [metaUri, setMetaUri] = useState("");
  const [jurisdictionAddr, setJurisdictionAddr] = useState("");
  const [transferEnabled, setTransferEnabled] = useState(true);

  const compTx = useTx();
  const govTx = useTx();
  const metaTx = useTx();
  const transferTx = useTx();
  const jurisdictionTx = useTx();

  return (
    <div className="space-y-5 divide-y divide-zinc-800">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Transfer Enable / Disable</p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" loading={transferTx.isPending || transferTx.confirming}
            onClick={() => { transferTx.reset(); transferTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setTransferEnabled", args: [true] }); }}>
            Enable Transfers
          </Button>
          <Button size="sm" variant="danger" loading={transferTx.isPending || transferTx.confirming}
            onClick={() => { transferTx.reset(); transferTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setTransferEnabled", args: [false] }); }}>
            Disable Transfers
          </Button>
        </div>
        <TxStatus hash={transferTx.hash} confirming={transferTx.confirming} confirmed={transferTx.confirmed} error={transferTx.error} />
      </div>
      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Set Compliance Manager</p>
        <div className="flex gap-2">
          <input value={complianceMgr} onChange={e => setComplianceMgr(e.target.value)} placeholder="New compliance manager (0x…)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
          <Button size="sm" variant="secondary" loading={compTx.isPending || compTx.confirming} disabled={!complianceMgr}
            onClick={() => { compTx.reset(); compTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setComplianceManager", args: [complianceMgr as `0x${string}`] }); }}>
            Set
          </Button>
        </div>
        <TxStatus hash={compTx.hash} confirming={compTx.confirming} confirmed={compTx.confirmed} error={compTx.error} />
      </div>
      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Set Governance Multisig</p>
        <div className="flex gap-2">
          <input value={govMultisig} onChange={e => setGovMultisig(e.target.value)} placeholder="New governance multisig (0x…)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
          <Button size="sm" variant="secondary" loading={govTx.isPending || govTx.confirming} disabled={!govMultisig}
            onClick={() => { govTx.reset(); govTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setGovernanceMultisig", args: [govMultisig as `0x${string}`] }); }}>
            Set
          </Button>
        </div>
        <TxStatus hash={govTx.hash} confirming={govTx.confirming} confirmed={govTx.confirmed} error={govTx.error} />
      </div>
      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Set Metadata URI</p>
        <div className="flex gap-2">
          <input value={metaUri} onChange={e => setMetaUri(e.target.value)} placeholder="https://…"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
          <Button size="sm" variant="secondary" loading={metaTx.isPending || metaTx.confirming} disabled={!metaUri}
            onClick={() => { metaTx.reset(); metaTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "setMetadataUri", args: [metaUri] }); }}>
            Set
          </Button>
        </div>
        <TxStatus hash={metaTx.hash} confirming={metaTx.confirming} confirmed={metaTx.confirmed} error={metaTx.error} />
      </div>
      <div className="pt-4 space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text)]">Jurisdiction Whitelist</p>
        <div className="flex gap-2 items-center">
          <input value={jurisdictionAddr} onChange={e => setJurisdictionAddr(e.target.value)} placeholder="Jurisdiction address (0x…)"
            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-zinc-600 font-mono focus:outline-none focus:border-[var(--color-blue)] flex-1" />
          <Button size="sm" variant="primary" loading={jurisdictionTx.isPending || jurisdictionTx.confirming} disabled={!jurisdictionAddr}
            onClick={() => { jurisdictionTx.reset(); jurisdictionTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "addToJurisdictionWhitelist", args: [jurisdictionAddr as `0x${string}`] }); }}>
            Add
          </Button>
          <Button size="sm" variant="danger" loading={jurisdictionTx.isPending || jurisdictionTx.confirming} disabled={!jurisdictionAddr}
            onClick={() => { jurisdictionTx.reset(); jurisdictionTx.writeContract({ address, abi: SECURITY_TOKEN_ABI, functionName: "removeFromJurisdictionWhitelist", args: [jurisdictionAddr as `0x${string}`] }); }}>
            Remove
          </Button>
        </div>
        <TxStatus hash={jurisdictionTx.hash} confirming={jurisdictionTx.confirming} confirmed={jurisdictionTx.confirmed} error={jurisdictionTx.error} />
      </div>
    </div>
  );
}

export default function SecurityTokenPanel({ tokenAddress, walletAddress }: {
  tokenAddress: `0x${string}`;
  walletAddress: `0x${string}`;
}) {
  const { data, refetch } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "name" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "symbol" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "totalSupply" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "balanceOf", args: [walletAddress] },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "transferEnabled" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "complianceManager" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "governanceMultisig" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "metadataUri" },
      { address: tokenAddress, abi: SECURITY_TOKEN_ABI, functionName: "useJurisdictionWhitelist" },
    ],
  });

  const [name, symbol, totalSupply, balance, transferEnabled, complianceManager, governanceMultisig, metadataUri, useJurisdiction] =
    data?.map(r => r.result) ?? [];

  const isComplianceMgr = complianceManager?.toString().toLowerCase() === walletAddress.toLowerCase();
  const isGovMultisig   = governanceMultisig?.toString().toLowerCase() === walletAddress.toLowerCase();
  const isOwner         = isComplianceMgr || isGovMultisig;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="SecurityToken"
          subtitle={`${name ?? tokenAddress}`}
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={11} /></Button>
              <a href={explorerAddressUrl(tokenAddress)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"><ExternalLink size={13} /></a>
            </div>
          }
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Total Supply"  value={totalSupply ? Number(formatUnits(totalSupply as bigint, 18)).toLocaleString() : "—"} />
          <Stat label="Your Balance"  value={balance ? formatUnits(balance as bigint, 18) : "0"} />
          <Stat label="Transfers"     value={transferEnabled ? "Enabled" : "Disabled"} />
          <Stat label="Jurisdiction"  value={useJurisdiction ? "Whitelist On" : "Open"} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm border-t border-[var(--color-border)] pt-3">
          <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Compliance Manager</p><p className="text-xs font-mono text-[var(--color-text-secondary)]">{complianceManager ? <AddressLink address={complianceManager as string} chars={10} /> : "—"}</p></div>
          <div><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Governance Multisig</p><p className="text-xs font-mono text-[var(--color-text-secondary)]">{governanceMultisig ? <AddressLink address={governanceMultisig as string} chars={10} /> : "—"}</p></div>
          <div className="col-span-2"><p className="text-xs text-[var(--color-text-muted)] mb-0.5">Metadata URI</p><p className="text-xs font-mono text-[var(--color-text-secondary)]">{metadataUri as string ?? "—"}</p></div>
        </div>
        {!isOwner && (
          <p className="text-xs text-amber-500 mt-3 bg-amber-500/10 border border-amber-700/30 rounded px-3 py-1.5">
            Connected wallet is not compliance manager or governance multisig — write actions will revert.
          </p>
        )}
      </Card>

      {/* Read panel */}
      <Card>
        <CardHeader title="Investor Due Diligence" subtitle="Look up investor status and check transfer eligibility" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <InvestorLookup address={tokenAddress} />
          <div className="pt-4"><CanTransferCheck address={tokenAddress} /></div>
        </div>
      </Card>

      {/* Compliance actions */}
      <Card>
        <CardHeader title="Compliance Actions" subtitle="Approve, reject, or update lockups (compliance manager only)" />
        <div className="space-y-5 divide-y divide-zinc-800">
          <ApproveInvestorSection address={tokenAddress} />
          <div className="pt-4"><RejectInvestorSection address={tokenAddress} /></div>
          <div className="pt-4"><UpdateLockupSection address={tokenAddress} /></div>
        </div>
      </Card>

      {/* Vault Operations */}
      <Card>
        <CardHeader title="Vault Operations" subtitle="Deposit rent, sync, push distributions, authorized distributors" />
        <VaultSection address={tokenAddress} />
      </Card>

      {/* Config */}
      <Card>
        <CardHeader title="Config" subtitle="Transfer controls, roles, metadata, jurisdiction whitelist (owner only)" />
        <ConfigSection address={tokenAddress} />
      </Card>
    </div>
  );
}
