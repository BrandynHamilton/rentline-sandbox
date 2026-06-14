# Deployed Contract Addresses

## Chains

Chain                        | ID    | RPC
Avalanche Fuji               | 43113 | https://api.avax-test.network/ext/bc/C/rpc
Robinhood Chain Testnet      | 46630 | https://rpc.testnet.chain.robinhood.com/rpc

Explorer (Robinhood): https://explorer.testnet.chain.robinhood.com


## Deployer Wallet

Admin / Deployer: 0x1051218fbA33A2997Ff3320c6daef3C392A9F39c


## Token Contracts

### Avalanche Fuji (43113)

TestUSDC: 0xa836F9A497489506e7059b02Ce5795Af43E0662F
TestUSDT: 0x11315D723141dFf7B76B1278016B852DD5DAC632

### Robinhood Chain Testnet (46630)

TestUSDC: 0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1


## Factory Contracts — Robinhood Chain Testnet (46630)

PropertyTokenFactory:          0x096a5f7254c7d8f7105cdc6166d6925ef3b92eb3
CREFactory:                    0x6ed83445df02ce516f0c697e3461a72f256d92e9
PropertyNFTFactory:            0xf4b03f7a47ec5971102c0acd0770b0c504e1333c
SecurityTokenFactory:          0x4d791fd4080dcee60a803046dc79e84891844a5f
DistributionManagerFactory:    0xe047ce391a04d212a1688df0b7681926af80492f
PropertyLLCFactory:            0xecd1d7c1adbff7c21b17fa540cb07b34919c23ae
InvestorRegistryFactory:       0xa35e4b57c12cf60cccd47c316b3444e37035f1cb
GovernanceFactory:             0x2c6e30f6b48bad87559486eb73f10e3abe06f7b5


## Notes

- All factory contracts owned by deployer wallet, support setOperator() for backend automation.
- SecurityTokenFactory constructed with TestUSDC (0xa1dCB49Cf93CA429cb8F0f72581E1C917ed0c9D1) as payment token.
- Robinhood Chain uses evm_version = "paris" (no mcopy opcode) and via_ir = true.
- Restore contract source: forge install OpenZeppelin/openzeppelin-contracts in rwa-studio/contracts/.
