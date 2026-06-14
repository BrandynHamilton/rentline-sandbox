// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/cre/PropertyLLC.sol";
import "../src/cre/SecurityToken.sol";
import "../src/cre/InvestorRegistry.sol";
import "../src/cre/DistributionManager.sol";
import "../src/cre/Governance.sol";

contract DeployCRE is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.rememberKey(deployerPrivateKey);
        address adminMultisig = vm.envAddress("ADMIN_MULTISIG");
        address emergencyAdmin = vm.envAddress("EMERGENCY_ADMIN");
        address complianceManager = vm.envAddress("COMPLIANCE_MANAGER");
        address usdcToken = vm.envAddress("USDC_TOKEN");
        string memory propertyName = vm.envString("COMMERCIAL_NAME");
        string memory propertySymbol = vm.envString("COMMERCIAL_SYMBOL");
        string memory propertyAddress = vm.envString("COMMERCIAL_ADDRESS");
        string memory metadataUri = vm.envString("COMMERCIAL_METADATA_URI");

        vm.startBroadcast(deployerPrivateKey);

        InvestorRegistry investorRegistry = new InvestorRegistry(address(0));
        console.log("InvestorRegistry deployed at:", address(investorRegistry));

        SecurityToken securityToken = new SecurityToken(propertyName, propertySymbol, complianceManager, adminMultisig, usdcToken, metadataUri);
        console.log("SecurityToken deployed at:", address(securityToken));

        DistributionManager distributionManager = new DistributionManager(address(securityToken), usdcToken);
        console.log("DistributionManager deployed at:", address(distributionManager));

        PropertyLLC propertyLLC = new PropertyLLC(propertyName, propertyAddress, propertySymbol, address(securityToken));
        console.log("PropertyLLC deployed at:", address(propertyLLC));

        Governance governance = new Governance(adminMultisig, emergencyAdmin, 86400);
        console.log("Governance deployed at:", address(governance));

        securityToken.transferOwnership(address(governance));
        distributionManager.transferOwnership(address(governance));
        propertyLLC.transferOwnership(address(governance));

        vm.stopBroadcast();

        console.log("=== CRE Tokenization Suite Deployed ===");
        console.log("PropertyLLC:", address(propertyLLC));
        console.log("SecurityToken:", address(securityToken));
        console.log("InvestorRegistry:", address(investorRegistry));
        console.log("DistributionManager:", address(distributionManager));
        console.log("Governance:", address(governance));
    }
}