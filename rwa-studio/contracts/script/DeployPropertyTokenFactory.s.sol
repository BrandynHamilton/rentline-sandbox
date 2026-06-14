// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/PropertyTokenFactory.sol";

contract DeployPropertyTokenFactory is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("AVALANCHE_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PropertyTokenFactory factory = new PropertyTokenFactory();
        vm.stopBroadcast();
        console.log("PropertyTokenFactory:", address(factory));
    }
}
