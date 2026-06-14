// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./cre/Governance.sol";

contract GovernanceFactory is Ownable {

    address[] public allContracts;
    mapping(address => address) public deployedBy;

    event GovernanceCreated(
        address indexed contractAddress,
        address indexed deployedBy,
        address adminMultisig,
        address emergencyAdmin
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Deploy a Governance contract.
    /// NOTE: Governance's constructor immediately transfers its own ownership
    /// to the internal TimelockController it creates. The deployer retains no
    /// special role — adminMultisig controls the timelock.
    /// @param adminMultisig    Timelock proposer + executor
    /// @param emergencyAdmin   Can call emergencyPause without timelock
    /// @param timelockDelay    Seconds before a queued action executes (e.g. 86400 = 1 day)
    function create(
        address adminMultisig,
        address emergencyAdmin,
        uint256 timelockDelay
    ) external returns (address addr) {
        require(adminMultisig  != address(0), "GovernanceFactory: zero multisig");
        require(emergencyAdmin != address(0), "GovernanceFactory: zero emergency");

        Governance gov = new Governance(adminMultisig, emergencyAdmin, timelockDelay);
        // NOTE: gov.owner() is already the TimelockController after construction
        addr = address(gov);
        allContracts.push(addr);
        deployedBy[addr] = msg.sender;
        emit GovernanceCreated(addr, msg.sender, adminMultisig, emergencyAdmin);
    }

    function totalDeployed() external view returns (uint256) { return allContracts.length; }
}
