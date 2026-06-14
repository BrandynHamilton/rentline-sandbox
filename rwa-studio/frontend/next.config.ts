import type { NextConfig } from "next";

// Factory addresses are injected into .env.local by scripts/broadcast-env.js
// which runs as a prebuild/predev step. No manual env var setup needed.

const nextConfig: NextConfig = {
  output: "standalone",
  webpack(config, { webpack }) {
    // wagmi v3 barrel-exports every connector including optional ones whose
    // peer dependencies are not installed (porto, metaMask SDK, coinbase SDK,
    // safe, walletConnect, base account, tempo). Ignore them all so webpack
    // doesn't fail the build. Only `injected` (which uses window.ethereum
    // directly) is used in this project.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp:
          /^(porto(\/.*)?|@metamask\/connect-evm|@coinbase\/wallet-sdk|@walletconnect\/ethereum-provider|@safe-global\/safe-apps-sdk|@safe-global\/safe-apps-provider|@base-org\/account|accounts)$/,
      })
    );
    return config;
  },
};

export default nextConfig;
