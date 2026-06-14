// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PropertyLLCFactory.sol";
import "../src/InvestorRegistryFactory.sol";
import "../src/GovernanceFactory.sol";
import "../src/DistributionManagerFactory.sol";

/// @notice Deploys the optional CRE infrastructure factories.
///
/// Run this once after DeployFactories.s.sol.
/// Users then call create() on each factory from the RWA Studio UI.
///
/// Usage:
///   forge script script/DeployOptionalFactories.s.sol \
///     --rpc-url $AVALANCHE_RPC_URL \
///     --broadcast \
///     -vvv
contract DeployOptionalFactories is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AVALANCHE_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        PropertyLLCFactory          llcFactory      = new PropertyLLCFactory();
        InvestorRegistryFactory     registryFactory = new InvestorRegistryFactory();
        GovernanceFactory           govFactory      = new GovernanceFactory();
        DistributionManagerFactory  dmFactory       = new DistributionManagerFactory();
        vm.stopBroadcast();

        console.log("=== Optional CRE Factory Deployment ===");
        console.log("PropertyLLCFactory         :", address(llcFactory));
        console.log("InvestorRegistryFactory    :", address(registryFactory));
        console.log("GovernanceFactory          :", address(govFactory));
        console.log("DistributionManagerFactory :", address(dmFactory));
        console.log("");
        console.log("Add to .env:");
        console.log("  PROPERTY_LLC_FACTORY_ADDRESS=%s",          address(llcFactory));
        console.log("  INVESTOR_REGISTRY_FACTORY_ADDRESS=%s",     address(registryFactory));
        console.log("  GOVERNANCE_FACTORY_ADDRESS=%s",            address(govFactory));
        console.log("  DISTRIBUTION_MANAGER_FACTORY_ADDRESS=%s",  address(dmFactory));
        console.log("");
        console.log("Add to frontend/.env.local:");
        console.log("  NEXT_PUBLIC_PROPERTY_LLC_FACTORY=%s",          address(llcFactory));
        console.log("  NEXT_PUBLIC_INVESTOR_REGISTRY_FACTORY=%s",     address(registryFactory));
        console.log("  NEXT_PUBLIC_GOVERNANCE_FACTORY=%s",            address(govFactory));
        console.log("  NEXT_PUBLIC_DISTRIBUTION_MANAGER_FACTORY=%s",  address(dmFactory));
    }
}
