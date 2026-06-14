// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/governance/TimelockController.sol";

contract Governance is Ownable, ReentrancyGuard {
    TimelockController public timelock;
    address public adminMultisig;
    address public emergencyAdmin;

    event AdminMultisigUpdated(address indexed newMultisig);
    event EmergencyAdminUpdated(address indexed newAdmin);
    event TimelockUpdated(address indexed newTimelock);
    event GovernanceAction(string action, address indexed target, uint256 delay);

    constructor(address _adminMultisig, address _emergencyAdmin, uint256 _timelockDelay) Ownable(msg.sender) {
        adminMultisig = _adminMultisig;
        emergencyAdmin = _emergencyAdmin;

        address[] memory proposers = new address[](1);
        proposers[0] = _adminMultisig;
        address[] memory executors = new address[](1);
        executors[0] = _adminMultisig;
        timelock = new TimelockController(_timelockDelay, proposers, executors, _adminMultisig);

        transferOwnership(address(timelock));
        emit TimelockUpdated(address(timelock));
        emit AdminMultisigUpdated(_adminMultisig);
    }

    function setAdminMultisig(address newMultisig) external onlyOwner {
        require(newMultisig != address(0), "Invalid address");
        adminMultisig = newMultisig;
        emit AdminMultisigUpdated(newMultisig);
    }

    function setEmergencyAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        emergencyAdmin = newAdmin;
        emit EmergencyAdminUpdated(newAdmin);
    }

    function getGovernanceConfig() external view returns (address, address, address) {
        return (adminMultisig, emergencyAdmin, address(timelock));
    }

    function emergencyPause() external { require(msg.sender == emergencyAdmin, "Not emergency admin"); }
    function emergencyUnpause() external { require(msg.sender == emergencyAdmin, "Not emergency admin"); }
}