"use client";
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import {
  CRE_FACTORY_ABI,                   CRE_FACTORY_ADDRESS,
  DISTRIBUTION_MANAGER_FACTORY_ABI,  DISTRIBUTION_MANAGER_FACTORY_ADDRESS,
  INVESTOR_REGISTRY_FACTORY_ABI,     INVESTOR_REGISTRY_FACTORY_ADDRESS,
} from "@/lib/contracts/abis";
import Button from "@/components/Button";
import { CheckCircle, Loader, Circle, ExternalLink } from "lucide-react";
import { explorerAddressUrl, AddressLink, truncateAddr } from "@/lib/explorer";

// ── Step status indicator ─────────────────────────────────────────────────────

function StepStatus({ status, label, addr }: {
  status: "pending" | "deploying" | "done" | "error";
  label: string;
  addr?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">
        {status === "done"      && <CheckCircle size={16} className="text-emerald-600" />}
        {status === "deploying" && <Loader size={16} className="text-amber-600 animate-spin" />}
        {status === "pending"   && <Circle size={16} className="text-[var(--color-text-muted)]" />}
        {status === "error"     && <Circle size={16} className="text-red-600" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${status === "done" ? "text-[var(--color-text)]" : status === "deploying" ? "text-amber-600" : "text-[var(--color-text-muted)]"}`}>
          {label}
        </p>
        {addr && (
          <div className="flex items-center gap-1 mt-0.5">
            <AddressLink address={addr} chars={12} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── The wizard ────────────────────────────────────────────────────────────────

interface CREWizardProps {
  metadataUri: string;
  tokenName: string;
  tokenSymbol: string;
  usdcAddr: string;
  onComplete: (addrs: { securityToken: string; distributionManager: string; investorRegistry: string }) => void;
  /** If provided, skip SecurityToken + DistributionManager deploy and only deploy InvestorRegistry.
   *  Used from Studio when a SecurityToken already exists but lacks supporting contracts. */
  existingSecurityToken?: `0x${string}`;
}

type DeployStep = "idle" | "cre" | "cre-done" | "dm" | "dm-done" | "registry" | "registry-done" | "complete" | "error";

export default function CREDeployWizard({ metadataUri, tokenName, tokenSymbol, usdcAddr, onComplete, existingSecurityToken }: CREWizardProps) {
  const { address: walletAddress } = useAccount();
  const publicClient = usePublicClient();
  // Always start at idle — the start() function handles the existingSecurityToken skip path
  const [step, setStep] = useState<DeployStep>("idle");
  const [error, setError] = useState("");

  const [securityToken,       setSecurityToken]       = useState(existingSecurityToken ?? "");
  const [distributionManager, setDistributionManager] = useState("");
  const [investorRegistry,    setInvestorRegistry]    = useState("");
  const [manualAddr, setManualAddr] = useState("");
  const [failedStep, setFailedStep] = useState<"cre" | "registry" | "">("");

  // ── Step 1: CRE Factory (SecurityToken + DistributionManager) ────────────
  const cre = useWriteContract();
  const creReceipt = useWaitForTransactionReceipt({ hash: cre.data });

  // ── Step 2: InvestorRegistry Factory ─────────────────────────────────────
  const reg = useWriteContract();
  const regReceipt = useWaitForTransactionReceipt({ hash: reg.data });

  // ── Decode CRE system from receipt ────────────────────────────────────────
  useEffect(() => {
    if (!creReceipt.isSuccess || !cre.data || !publicClient) return;
    (async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: cre.data! });
        let found = false;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: CRE_FACTORY_ABI, eventName: "CRESystemCreated", data: log.data, topics: log.topics });
            const args = decoded.args as Record<string, unknown>;
            const secTok = args.securityToken as string;
            const dm     = args.distributionManager as string;
            if (secTok && secTok !== "0x0000000000000000000000000000000000000000") {
              setSecurityToken(secTok);
              setDistributionManager(dm);
              setStep("dm-done");
              try {
                const lsKey = `cre-linked-${secTok.toLowerCase()}`;
                localStorage.setItem(lsKey, JSON.stringify({ distMgr: dm }));
              } catch {}
              found = true;
              break;
            }
          } catch {}
        }
        if (!found) {
          // Fallback: read totalDeployed/allTokens/systemByToken from factory
          try {
            const total = await publicClient.readContract({
              address: CRE_FACTORY_ADDRESS,
              abi: CRE_FACTORY_ABI,
              functionName: "totalDeployed",
            }) as bigint;
            if (total > 0n) {
              const secTok = await publicClient.readContract({
                address: CRE_FACTORY_ADDRESS,
                abi: CRE_FACTORY_ABI,
                functionName: "allTokens",
                args: [total - 1n],
              }) as string;
              if (secTok && secTok !== "0x0000000000000000000000000000000000000000") {
                const system = await publicClient.readContract({
                  address: CRE_FACTORY_ADDRESS,
                  abi: CRE_FACTORY_ABI,
                  functionName: "systemByToken",
                  args: [secTok as `0x${string}`],
                }) as readonly [string, string];
                setSecurityToken(system[0]);
                setDistributionManager(system[1]);
                setStep("dm-done");
                try {
                  const lsKey = `cre-linked-${secTok.toLowerCase()}`;
                  localStorage.setItem(lsKey, JSON.stringify({ distMgr: system[1] }));
                } catch {}
                found = true;
              }
            }
          } catch {}
        }
        if (!found) {
          setError("CRE system deployed but could not detect addresses from logs or contract state. Check the block explorer.");
          setFailedStep("cre");
          setStep("error");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to decode CRE system");
        setFailedStep("cre");
        setStep("error");
      }
    })();
  }, [creReceipt.isSuccess, cre.data]);

  // ── Auto-advance: after CRE done → deploy InvestorRegistry ───────────────
  useEffect(() => {
    if (step !== "dm-done" || !INVESTOR_REGISTRY_FACTORY_ADDRESS || !walletAddress) return;
    setStep("registry");
    reg.reset();
    reg.writeContract({
      address: INVESTOR_REGISTRY_FACTORY_ADDRESS,
      abi: INVESTOR_REGISTRY_FACTORY_ABI,
      functionName: "create",
      args: ["0x0000000000000000000000000000000000000000"],
    });
  }, [step]);

  // ── Decode InvestorRegistry from receipt ──────────────────────────────────
  useEffect(() => {
    if (!regReceipt.isSuccess || !reg.data || !publicClient || !securityToken) return;
    (async () => {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: reg.data! });
        let found = false;
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: INVESTOR_REGISTRY_FACTORY_ABI, eventName: "InvestorRegistryCreated", data: log.data, topics: log.topics });
            const addr = (decoded.args as Record<string, unknown>).contractAddress as string;
            if (addr && addr !== "0x0000000000000000000000000000000000000000") {
              setInvestorRegistry(addr);
              setStep("complete");
              try {
                const lsKey = `cre-linked-${securityToken.toLowerCase()}`;
                const saved = JSON.parse(localStorage.getItem(lsKey) ?? "{}");
                localStorage.setItem(lsKey, JSON.stringify({ ...saved, investorRegistry: addr }));
              } catch {}
              onComplete({ securityToken, distributionManager, investorRegistry: addr });
              found = true;
              break;
            }
          } catch {}
        }
        if (!found) {
          // Fallback: read totalDeployed/allContracts from factory
          try {
            const total = await publicClient.readContract({
              address: INVESTOR_REGISTRY_FACTORY_ADDRESS,
              abi: INVESTOR_REGISTRY_FACTORY_ABI,
              functionName: "totalDeployed",
            }) as bigint;
            if (total > 0n) {
              const addr = await publicClient.readContract({
                address: INVESTOR_REGISTRY_FACTORY_ADDRESS,
                abi: INVESTOR_REGISTRY_FACTORY_ABI,
                functionName: "allContracts",
                args: [total - 1n],
              }) as string;
              if (addr && addr !== "0x0000000000000000000000000000000000000000") {
                setInvestorRegistry(addr);
                setStep("complete");
                try {
                  const lsKey = `cre-linked-${securityToken.toLowerCase()}`;
                  const saved = JSON.parse(localStorage.getItem(lsKey) ?? "{}");
                  localStorage.setItem(lsKey, JSON.stringify({ ...saved, investorRegistry: addr }));
                } catch {}
                onComplete({ securityToken, distributionManager, investorRegistry: addr });
                found = true;
              }
            }
          } catch {}
          if (!found) {
            setError("InvestorRegistry deployed but could not detect its address from logs or contract state. Check the block explorer and enter the address manually.");
            setFailedStep("registry");
            setStep("error");
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to decode InvestorRegistry");
        setFailedStep("registry");
        setStep("error");
      }
    })();
  }, [regReceipt.isSuccess, reg.data]);

  // ── Kick off Step 1 ───────────────────────────────────────────────────────
  const start = () => {
    setError("");
    setFailedStep("");
    if (existingSecurityToken) {
      // Skip CRE factory — existing token, just deploy InvestorRegistry
      if (!INVESTOR_REGISTRY_FACTORY_ADDRESS) { setError("INVESTOR_REGISTRY_FACTORY_ADDRESS not set"); return; }
      setStep("registry");
      reg.reset();
      reg.writeContract({
        address: INVESTOR_REGISTRY_FACTORY_ADDRESS,
        abi: INVESTOR_REGISTRY_FACTORY_ABI,
        functionName: "create",
        args: ["0x0000000000000000000000000000000000000000"],
      });
    } else {
      if (!CRE_FACTORY_ADDRESS) { setError("CRE_FACTORY_ADDRESS not set — check broadcast files"); return; }
      setStep("cre");
      cre.reset();
      cre.writeContract({
        address: CRE_FACTORY_ADDRESS,
        abi: CRE_FACTORY_ABI,
        functionName: "create",
        args: [tokenName, tokenSymbol, usdcAddr as `0x${string}`, metadataUri],
      });
    }
  };

  // ── Manual address submission (escape hatch if event decode + fallback fail) ──
  const submitManualAddress = () => {
    const a = manualAddr.trim() as `0x${string}`;
    if (!a.startsWith("0x") || a.length !== 42) { setError("Enter a valid 0x-prefixed address"); return; }
    setInvestorRegistry(a);
    setStep("complete");
    try {
      const lsKey = `cre-linked-${(securityToken || existingSecurityToken || "").toLowerCase()}`;
      const saved = JSON.parse(localStorage.getItem(lsKey) ?? "{}");
      localStorage.setItem(lsKey, JSON.stringify({ ...saved, investorRegistry: a }));
    } catch {}
    onComplete({ securityToken, distributionManager, investorRegistry: a });
  };

  // ── Retry just the InvestorRegistry deploy (used from error state) ──────
  const retryRegistryDeploy = () => {
    setError("");
    setFailedStep("");
    if (!INVESTOR_REGISTRY_FACTORY_ADDRESS) { setError("InvestorRegistry factory address not configured"); return; }
    setStep("registry");
    reg.reset();
    reg.writeContract({
      address: INVESTOR_REGISTRY_FACTORY_ADDRESS,
      abi: INVESTOR_REGISTRY_FACTORY_ABI,
      functionName: "create",
      args: ["0x0000000000000000000000000000000000000000"],
    });
  };

  const getStepStatus = (s: DeployStep[]): "pending" | "deploying" | "done" | "error" => {
    if (step === "error") return "error";
    if (s.includes(step)) return "deploying";
    // Check if past this step
    const order: DeployStep[] = ["idle", "cre", "cre-done", "dm", "dm-done", "registry", "registry-done", "complete"];
    const current = order.indexOf(step);
    const last = Math.max(...s.map(s => order.indexOf(s)));
    return current > last ? "done" : "pending";
  };

  if (step === "complete") {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-500/10 border border-emerald-700 rounded-xl px-4 py-4">
          <p className="text-sm text-emerald-600 font-semibold mb-3">CRE System Deployed!</p>
          <div className="space-y-2">
            <StepStatus status="done" label="SecurityToken"       addr={securityToken} />
            <StepStatus status="done" label="DistributionManager" addr={distributionManager} />
            <StepStatus status="done" label="InvestorRegistry"    addr={investorRegistry} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-3">
            All contracts are wired and saved. Open Rentline Sandbox to manage compliance, distributions, and investors.
          </p>
        </div>
      </div>
    );
  }

  if (step === "idle" || step === "dm-done") {
    const isExisting = !!existingSecurityToken;
    return (
      <div className="space-y-3">
        <div className={`border rounded-xl px-4 py-3 text-xs space-y-1 ${isExisting ? "bg-amber-500/10 border-amber-800 text-amber-600" : "bg-purple-500/10 border-purple-800 text-purple-600"}`}>
          <p className={`font-semibold ${isExisting ? "text-amber-200" : "text-purple-200"}`}>
            {isExisting ? "Deploy missing contracts for this SecurityToken:" : "Contracts to be deployed in sequence:"}
          </p>
          <div className="space-y-2 pt-1">
            {!isExisting && <StepStatus status="pending" label="SecurityToken + DistributionManager (1 tx via CREFactory)" />}
            <StepStatus status="pending" label="InvestorRegistry (1 tx via InvestorRegistryFactory)" />
          </div>
          <p className={`pt-1 ${isExisting ? "text-amber-500" : "text-purple-500"}`}>
            {isExisting
              ? "Your wallet will prompt once. DistributionManager can be deployed separately via the Deploy Contracts tab."
              : "Your wallet will prompt twice. PropertyLLC and Governance can be added later via Studio."}
          </p>
        </div>
        {error && <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</p>}
        <Button variant="primary" onClick={start} disabled={!isExisting && (!usdcAddr || !tokenName || !tokenSymbol)}>
          <span className="text-sm">{isExisting ? "Deploy InvestorRegistry" : "Deploy CRE System"}</span>
        </Button>
      </div>
    );
  }

  // Capture step as string to prevent TypeScript narrowing in JSX
  const currentStep: string = step;

  return (
    <div className="space-y-3">
      <div className="bg-[var(--color-surface-page)] border border-[var(--color-border)] rounded-xl px-4 py-4 space-y-3">
        <StepStatus
          status={getStepStatus(["cre"])}
          label="SecurityToken + DistributionManager"
          addr={securityToken && distributionManager ? securityToken : undefined}
        />
        <StepStatus
          status={getStepStatus(["registry"])}
          label="InvestorRegistry"
          addr={investorRegistry || undefined}
        />
      </div>
      {currentStep === "cre"      && <p className="text-xs text-amber-600">Waiting for wallet signature (1 of 2)…</p>}
      {currentStep === "dm-done"  && <p className="text-xs text-amber-600">SecurityToken + DistributionManager deployed. Waiting for wallet signature (2 of 2)…</p>}
      {currentStep === "registry" && <p className="text-xs text-amber-600">Waiting for InvestorRegistry confirmation…</p>}
      {(cre.error || reg.error) && (
        <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          {(cre.error ?? reg.error)?.message.slice(0, 200)}
        </p>
      )}
      {step === "error" && error && !cre.error && !reg.error && (
        <div className="space-y-3">
          <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{error}</p>
          <div className="flex gap-2">
            {failedStep === "cre" ? (
              <Button variant="secondary" onClick={start}>
                <span className="text-sm">Retry CRE Deployment</span>
              </Button>
            ) : (
              <Button variant="secondary" onClick={retryRegistryDeploy}>
                <span className="text-sm">Retry InvestorRegistry Deployment</span>
              </Button>
            )}
          </div>
          {failedStep === "registry" && (
            <details className="text-xs text-[var(--color-text-muted)]">
              <summary className="cursor-pointer hover:text-[var(--color-text)]">Or enter address manually</summary>
              <div className="flex gap-2 mt-2">
                <input
                  className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-2 py-1.5 text-xs font-mono text-[var(--color-text)] placeholder-zinc-600 outline-none focus:border-[var(--color-blue)]"
                  placeholder="0x..."
                  value={manualAddr}
                  onChange={e => setManualAddr(e.target.value)}
                />
                <button
                  onClick={submitManualAddress}
                  className="text-xs bg-[var(--color-surface)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] rounded px-3 py-1.5 text-[var(--color-text)] transition-colors"
                >
                  Set
                </button>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
