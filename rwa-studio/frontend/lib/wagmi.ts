import { createConfig, http } from "wagmi";
import type { Chain } from "viem";
import { injected } from "wagmi/connectors";

const CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "46630"
);

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://rpc.testnet.chain.robinhood.com";

const robinhoodChain = {
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "RBH", symbol: "RBH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
} as const satisfies Chain;

export const wagmiConfig = createConfig({
  chains: [robinhoodChain],
  connectors: [injected()],
  transports: {
    [CHAIN_ID]: http(RPC_URL),
  },
  ssr: true,
});

export { robinhoodChain as targetChain };
export const TARGET_CHAIN_ID = CHAIN_ID;
export const FAUCET_URL = "https://faucet.testnet.chain.robinhood.com";
