// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PropertyToken.sol";

contract DeployPropertyToken is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.rememberKey(deployerPrivateKey);
        string memory propertyName = vm.envString("RESIDENTIAL_NAME");
        string memory propertyAddress = vm.envString("RESIDENTIAL_ADDRESS");
        address propertyOwner = vm.envAddress("RESIDENTIAL_OWNER");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        string memory metadataUri = vm.envString("RESIDENTIAL_METADATA_URI");

        vm.startBroadcast(deployerPrivateKey);
        PropertyToken propertyToken = new PropertyToken(propertyName, propertyAddress, propertyOwner, usdcAddress, metadataUri);
        vm.stopBroadcast();

        console.log("PropertyToken deployed at:", address(propertyToken));
        console.log("Property name:", propertyName);
        console.log("Property owner:", propertyOwner);
        console.log("USDC:", usdcAddress);
    }
}