// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./cre/PropertyLLC.sol";

contract PropertyLLCFactory is Ownable {

    address[] public allContracts;
    mapping(address => address) public deployedBy;

    event PropertyLLCCreated(
        address indexed contractAddress,
        address indexed deployedBy,
        string  propertyName,
        address securityToken
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Deploy a PropertyLLC. msg.sender becomes the owner.
    function create(
        string  calldata propertyName,
        string  calldata physicalAddress,
        string  calldata propertyId,
        address          securityToken
    ) external returns (address addr) {
        PropertyLLC llc = new PropertyLLC(propertyName, physicalAddress, propertyId, securityToken);
        llc.transferOwnership(msg.sender);
        addr = address(llc);
        allContracts.push(addr);
        deployedBy[addr] = msg.sender;
        emit PropertyLLCCreated(addr, msg.sender, propertyName, securityToken);
    }

    function totalDeployed() external view returns (uint256) { return allContracts.length; }
}
