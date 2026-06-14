// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./cre/InvestorRegistry.sol";

contract InvestorRegistryFactory is Ownable {

    address[] public allContracts;
    mapping(address => address) public deployedBy;

    event InvestorRegistryCreated(
        address indexed contractAddress,
        address indexed deployedBy
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Deploy an InvestorRegistry. msg.sender becomes the owner.
    /// @param accreditationVerifier Address of the verifier (use address(0) to set later)
    function create(address accreditationVerifier) external returns (address addr) {
        InvestorRegistry registry = new InvestorRegistry(accreditationVerifier);
        registry.transferOwnership(msg.sender);
        addr = address(registry);
        allContracts.push(addr);
        deployedBy[addr] = msg.sender;
        emit InvestorRegistryCreated(addr, msg.sender);
    }

    function totalDeployed() external view returns (uint256) { return allContracts.length; }
}
