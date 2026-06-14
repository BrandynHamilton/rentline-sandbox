# RWA Studio — Contract Deployment Status

**Chain:** Robinhood Chain Testnet (Arbitrum Orbit)
**Chain ID:** 46630
**RPC:** `https://rpc.testnet.chain.robinhood.com/rpc`
**Explorer:** https://explorer.testnet.chain.robinhood.com
**Last deployed:** 2026-06-09

---

## Deployed Contracts

### Mock Tokens

| Contract | Address | Explorer |
|---|---|---|
| TestUSDC | `0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1` | [Link](https://explorer.testnet.chain.robinhood.com/address/0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1) |

### Core Factories (8 contracts)

| Contract | Address | Explorer |
|---|---|---|
| PropertyTokenFactory | `0xa3aafc2709c0062ee1320032c4a34d79f35f4efe` | [Link](https://explorer.testnet.chain.robinhood.com/address/0xa3aafc2709c0062ee1320032c4a34d79f35f4efe) |
| CREFactory | `0x3e68b585ed4e512ca98bbe78d6cc4ca9fa3a3414` | [Link](https://explorer.testnet.chain.robinhood.com/address/0x3e68b585ed4e512ca98bbe78d6cc4ca9fa3a3414) |
| PropertyNFTFactory | `0xa5ae6acf037310c5f2679fc9b8989df643e9f344` | [Link](https://explorer.testnet.chain.robinhood.com/address/0xa5ae6acf037310c5f2679fc9b8989df643e9f344) |
| SecurityTokenFactory | `0xa39fcb96addcdb86d28d05b8dd3a6821d1e42adf` | [Link](https://explorer.testnet.chain.robinhood.com/address/0xa39fcb96addcdb86d28d05b8dd3a6821d1e42adf) |
| DistributionManagerFactory | `0x7422476a1f14324b0933edffb18c4de7dd84a48b` | [Link](https://explorer.testnet.chain.robinhood.com/address/0x7422476a1f14324b0933edffb18c4de7dd84a48b) |
| PropertyLLCFactory | `0xbdf95aef01bffae79176d54c7c970de48046835e` | [Link](https://explorer.testnet.chain.robinhood.com/address/0xbdf95aef01bffae79176d54c7c970de48046835e) |
| InvestorRegistryFactory | `0x0185f0290083fde3d6911588714dc09132257ab5` | [Link](https://explorer.testnet.chain.robinhood.com/address/0x0185f0290083fde3d6911588714dc09132257ab5) |
| GovernanceFactory | `0x3ef4e6ed398100170b9564a44b66c21f18c14ea6` | [Link](https://explorer.testnet.chain.robinhood.com/address/0x3ef4e6ed398100170b9564a44b66c21f18c14ea6) |

---

## Deployer Wallets

| Role | Address |
|---|---|
| Admin / Emergency / Compliance | `0x1051218fbA33A2997Ff3320c6daef3C392A9F39c` |

## Config Changes for Robinhood Chain

- `foundry.toml`: `chain_id = 46630`, `evm_version = "paris"`
- OpenZeppelin downgraded to `v5.1.0` (v5.6.1 uses `mcopy` opcode unsupported on RH chain)
- Build uses `via_ir = true` (required by CREFactory stack depth)
- Deploy uses `--gas-estimate-multiplier 200` (L2 gas estimation variance)

## Deployment Commands

```bash
# Deploy TestUSDC
forge script script/Deploy.s.sol --rpc-url <RPC> --broadcast --verify \
  --gas-estimate-multiplier 200 --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/

# Deploy all 8 factories
forge script script/DeployFactories.s.sol --rpc-url <RPC> --broadcast --verify \
  --gas-estimate-multiplier 200 --verifier blockscout \
  --verifier-url https://explorer.testnet.chain.robinhood.com/api/

# Mint TestUSDC
cast send <TEST_USDC_ADDRESS> "mint(address,uint256)" <TO> <AMOUNT> \
  --rpc-url <RPC> --private-key <KEY>
```
