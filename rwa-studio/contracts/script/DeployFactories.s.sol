// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PropertyTokenFactory.sol";
import "../src/SecurityTokenFactory.sol";
import "../src/PropertyNFTFactory.sol";
import "../src/CREFactory.sol";
import "../src/PropertyLLCFactory.sol";
import "../src/InvestorRegistryFactory.sol";
import "../src/GovernanceFactory.sol";
import "../src/DistributionManagerFactory.sol";

/// @notice Deploys ALL factories (core + optional) in one transaction batch.
///
/// Usage:
///   forge script script/DeployFactories.s.sol \
///     --rpc-url $AVALANCHE_RPC_URL \
///     --broadcast \
///     -vvv
///
/// The broadcast output is automatically read by the frontend (scripts/broadcast-env.js)
/// and backend (app/core/broadcast.py) on startup — no manual env var setup needed.
///
/// Optional: register the backend operator wallet for admin deploy paths:
///   cast send $CRE_FACTORY_ADDRESS \
///     "setOperator(address,bool)" $OPERATOR_ADDRESS true \
///     --rpc-url $AVALANCHE_RPC_URL --private-key $AVALANCHE_PRIVATE_KEY
contract DeployFactories is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AVALANCHE_PRIVATE_KEY");
        address usdcToken = vm.envAddress("USDC_TOKEN");

        vm.startBroadcast(deployerKey);

        // ── Core factories ────────────────────────────────────────────────────
        PropertyTokenFactory         propFactory    = new PropertyTokenFactory();
        CREFactory                   creFactory     = new CREFactory();
        PropertyNFTFactory           nftFactory     = new PropertyNFTFactory();
        SecurityTokenFactory         secFactory     = new SecurityTokenFactory(usdcToken);   // legacy

        // ── Optional CRE infrastructure factories ─────────────────────────────
        DistributionManagerFactory   dmFactory      = new DistributionManagerFactory();
        PropertyLLCFactory           llcFactory     = new PropertyLLCFactory();
        InvestorRegistryFactory      registryFactory = new InvestorRegistryFactory();
        GovernanceFactory            govFactory     = new GovernanceFactory();

        vm.stopBroadcast();

        console.log("=== Factory Deployment ===");
        console.log("");
        console.log("-- Core --");
        console.log("PropertyTokenFactory        :", address(propFactory));
        console.log("CREFactory                  :", address(creFactory));
        console.log("PropertyNFTFactory          :", address(nftFactory));
        console.log("SecurityTokenFactory (legacy):", address(secFactory));
        console.log("");
        console.log("-- Optional CRE --");
        console.log("DistributionManagerFactory  :", address(dmFactory));
        console.log("PropertyLLCFactory          :", address(llcFactory));
        console.log("InvestorRegistryFactory     :", address(registryFactory));
        console.log("GovernanceFactory           :", address(govFactory));
        console.log("");
        console.log("These addresses are auto-read from contracts/broadcast/ by the");
        console.log("frontend and backend - just rebuild with docker compose up --build.");
    }
}
