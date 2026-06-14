// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DistributionAutomation.sol";

/// @notice Deploys DistributionAutomation for a given PropertyToken.
///
/// Prerequisites:
///   1. PropertyToken already deployed (set PROPERTY_TOKEN_ADDRESS)
///   2. After deployment, call:
///        propertyToken.setAuthorizedDistributor(automationAddress, true)
///      so the automation contract can call distributeToAllHolders()
///   3. Register the deployed address at automation.chain.link and fund with LINK
///
/// Usage:
///   PROPERTY_TOKEN_ADDRESS=0x... \
///   MIN_DIST_AMOUNT=10000000 \   # 10 USDC (6 decimals)
///   MIN_INTERVAL=2592000 \       # 30 days in seconds
///   forge script script/DeployDistributionAutomation.s.sol \
///     --rpc-url $AVALANCHE_RPC_URL \
///     --broadcast -vvv
contract DeployDistributionAutomation is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AVALANCHE_PRIVATE_KEY");

        address propertyToken  = vm.envAddress("PROPERTY_TOKEN_ADDRESS");
        uint256 minDistAmount  = vm.envOr("MIN_DIST_AMOUNT", uint256(10_000_000)); // 10 USDC default
        uint256 minInterval    = vm.envOr("MIN_INTERVAL",    uint256(2_592_000));  // 30 days default

        vm.startBroadcast(deployerKey);

        DistributionAutomation automation = new DistributionAutomation(
            propertyToken,
            minDistAmount,
            minInterval
        );

        vm.stopBroadcast();

        console.log("=== DistributionAutomation Deployment ===");
        console.log("DistributionAutomation:", address(automation));
        console.log("PropertyToken         :", propertyToken);
        console.log("Min distribution      : %s USDC raw", minDistAmount);
        console.log("Min interval          : %s seconds",  minInterval);
        console.log("");
        console.log("Next steps:");
        console.log("1. Authorize on PropertyToken:");
        console.log("   cast send %s", propertyToken);
        console.log("     \"setAuthorizedDistributor(address,bool)\"");
        console.log("     %s true", address(automation));
        console.log("     --rpc-url $AVALANCHE_RPC_URL --private-key $AVALANCHE_PRIVATE_KEY");
        console.log("");
        console.log("2. Register at https://automation.chain.link");
        console.log("   Contract address: %s", address(automation));
        console.log("   Fund with LINK on Fuji testnet");
    }
}
