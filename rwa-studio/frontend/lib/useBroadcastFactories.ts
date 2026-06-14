"use client";
import { useState, useEffect } from "react";

type FactoryMap = Partial<{
  PROPERTY_TOKEN_FACTORY: `0x${string}`;
  SECURITY_TOKEN_FACTORY: `0x${string}`;
  PROPERTY_NFT_FACTORY: `0x${string}`;
  CRE_FACTORY: `0x${string}`;
  PROPERTY_LLC_FACTORY: `0x${string}`;
  INVESTOR_REGISTRY_FACTORY: `0x${string}`;
  GOVERNANCE_FACTORY: `0x${string}`;
  DISTRIBUTION_MANAGER_FACTORY: `0x${string}`;
}>;

export function useBroadcastFactories() {
  const [factories, setFactories] = useState<FactoryMap>({});

  useEffect(() => {
    fetch("/api/factories")
      .then(r => r.json())
      .then((data: { factories: FactoryMap }) => setFactories(data.factories))
      .catch(() => {});
  }, []);

  return factories;
}
