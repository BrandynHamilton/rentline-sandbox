// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./cre/DistributionManager.sol";

/// @notice Deploys standalone DistributionManager contracts.
/// Used when a SecurityToken was deployed without one, or when a new
/// distribution manager is needed for an existing token.
contract DistributionManagerFactory is Ownable {

    address[] public allContracts;
    mapping(address => address) public deployedBy;

    event DistributionManagerCreated(
        address indexed contractAddress,
        address indexed deployedBy,
        address securityToken,
        address usdcToken
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Deploy a DistributionManager. msg.sender becomes the owner.
    function create(address securityToken, address usdcToken)
        external returns (address addr)
    {
        require(securityToken != address(0), "DMFactory: zero token");
        require(usdcToken     != address(0), "DMFactory: zero usdc");

        DistributionManager dm = new DistributionManager(securityToken, usdcToken);
        dm.transferOwnership(msg.sender);

        addr = address(dm);
        allContracts.push(addr);
        deployedBy[addr] = msg.sender;

        emit DistributionManagerCreated(addr, msg.sender, securityToken, usdcToken);
    }

    function totalDeployed() external view returns (uint256) { return allContracts.length; }
}
