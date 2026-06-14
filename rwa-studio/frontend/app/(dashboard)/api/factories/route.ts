import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONTRACT_TO_KEY: Record<string, string> = {
  PropertyTokenFactory:        "PROPERTY_TOKEN_FACTORY",
  SecurityTokenFactory:        "SECURITY_TOKEN_FACTORY",
  PropertyNFTFactory:          "PROPERTY_NFT_FACTORY",
  CREFactory:                  "CRE_FACTORY",
  PropertyLLCFactory:          "PROPERTY_LLC_FACTORY",
  InvestorRegistryFactory:     "INVESTOR_REGISTRY_FACTORY",
  GovernanceFactory:           "GOVERNANCE_FACTORY",
  DistributionManagerFactory:  "DISTRIBUTION_MANAGER_FACTORY",
};

export async function GET() {
  const broadcastDir = path.resolve(
    process.cwd(), "../contracts/broadcast"
  );

  if (!fs.existsSync(broadcastDir)) {
    return NextResponse.json({ factories: {} });
  }

  const factories: Record<string, string> = {};

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "run-latest.json") {
        try {
          const data = JSON.parse(fs.readFileSync(full, "utf-8"));
          for (const tx of data.transactions ?? []) {
            if (tx.transactionType !== "CREATE") continue;
            const key = CONTRACT_TO_KEY[tx.contractName];
            if (key && tx.contractAddress && !factories[key]) {
              factories[key] = tx.contractAddress;
            }
          }
        } catch {}
      }
    }
  }

  walk(broadcastDir);
  return NextResponse.json({ factories });
}
