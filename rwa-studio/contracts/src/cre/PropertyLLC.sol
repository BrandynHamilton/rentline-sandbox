// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract PropertyLLC is ERC20, Ownable, ReentrancyGuard, Pausable {
    string public propertyName;
    string public propertyAddress;
    string public propertyId;
    address public securityToken;
    address public propertyManager;
    address public operatingAccount;
    uint256 public managementFeeBps = 50;

    event RentCollected(address indexed tenant, uint256 amount);
    event ManagementFeeCollected(uint256 amount);
    event PropertyManagerUpdated(address indexed newManager);
    event SecurityTokenUpdated(address indexed newToken);

    constructor(
        string memory _propertyName,
        string memory _propertyAddress,
        string memory _propertyId,
        address _securityToken
    ) ERC20("Property LLC", "LLC") Ownable(msg.sender) {
        propertyName = _propertyName;
        propertyAddress = _propertyAddress;
        propertyId = _propertyId;
        securityToken = _securityToken;
        propertyManager = msg.sender;
        operatingAccount = msg.sender;
    }

    receive() external payable {
        require(msg.value > 0, "No value received");
        emit RentCollected(msg.sender, msg.value);
    }

    function setPropertyManager(address newManager) external onlyOwner {
        require(newManager != address(0), "Invalid address");
        propertyManager = newManager;
        emit PropertyManagerUpdated(newManager);
    }

    function setSecurityToken(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid address");
        securityToken = newToken;
        emit SecurityTokenUpdated(newToken);
    }

    function setManagementFee(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Fee too high");
        managementFeeBps = bps;
    }

    function distributeRent(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        uint256 fee = (amount * managementFeeBps) / 10000;
        uint256 netRent = amount - fee;
        emit ManagementFeeCollected(fee);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function getPropertyDetails() external view returns (string memory, string memory, string memory) {
        return (propertyName, propertyAddress, propertyId);
    }
}