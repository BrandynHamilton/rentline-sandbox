// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CREFactory.sol";

/// @notice Deploys CREFactory only.
///
/// Usage:
///   forge script script/DeployCREFactory.s.sol \
///     --rpc-url $AVALANCHE_RPC_URL \
///     --broadcast \
///     -vvv
///
/// After deployment add to .env:
///   CRE_FACTORY_ADDRESS=<address>
///
/// And to frontend/.env.local:
///   NEXT_PUBLIC_CRE_FACTORY=<address>
contract DeployCREFactory is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AVALANCHE_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        CREFactory creFactory = new CREFactory();
        vm.stopBroadcast();

        console.log("CREFactory:", address(creFactory));
        console.log("");
        console.log("Add to .env:");
        console.log("  CRE_FACTORY_ADDRESS=%s", address(creFactory));
        console.log("");
        console.log("Add to frontend/.env.local:");
        console.log("  NEXT_PUBLIC_CRE_FACTORY=%s", address(creFactory));
    }
}
