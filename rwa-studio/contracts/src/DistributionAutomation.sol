// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PropertyToken.sol";

/// @title DistributionAutomation
/// @notice Chainlink Automation-compatible contract that triggers pro-rata
///         USDC distributions from a PropertyToken vault to all holders.
///
/// Flow:
///   1. Rentline pushes USDC rent into PropertyToken.vault via depositRent()
///   2. Chainlink Keeper polls checkUpkeep() every block (or on schedule)
///   3. When vault balance >= minDistributionAmount, performUpkeep() fires
///   4. performUpkeep() calls PropertyToken.distributeToAllHolders()
///      which iterates the holder list and sends each their pro-rata share
///
/// Registration:
///   1. Deploy this contract with the PropertyToken address
///   2. Register at automation.chain.link with this contract address
///   3. Fund the upkeep with LINK
///   4. Set this contract as an authorized distributor on PropertyToken
///
/// @dev Implements AutomationCompatibleInterface inline.
///      Once `forge install smartcontractkit/chainlink` is run you can replace
///      the inline interface below with:
///      import "chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
///      and inherit from AutomationCompatibleInterface directly.

interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData)
        external returns (bool upkeepNeeded, bytes memory performData);

    function performUpkeep(bytes calldata performData) external;
}

contract DistributionAutomation is AutomationCompatibleInterface, Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────────────────────────

    PropertyToken public immutable propertyToken;

    /// Minimum USDC in vault before automation fires (prevents dust distributions)
    /// Stored in USDC raw units (6 decimals). Default: 10 USDC
    uint256 public minDistributionAmount;

    /// Minimum seconds between distributions (prevents spam)
    uint256 public minInterval;

    /// Timestamp of last distribution
    uint256 public lastDistributionTime;

    /// Whether automation is paused by owner
    bool public paused;

    // ── Events ─────────────────────────────────────────────────────────────────

    event DistributionTriggered(uint256 vaultBalance, uint256 timestamp);
    event MinDistributionAmountUpdated(uint256 newAmount);
    event MinIntervalUpdated(uint256 newInterval);
    event Paused(bool paused);

    // ── Constructor ────────────────────────────────────────────────────────────

    /// @param _propertyToken    Address of the PropertyToken to automate
    /// @param _minDistAmount    Minimum USDC vault balance to trigger (6 decimals)
    /// @param _minInterval      Minimum seconds between distributions
    constructor(
        address _propertyToken,
        uint256 _minDistAmount,
        uint256 _minInterval
    ) Ownable(msg.sender) {
        require(_propertyToken != address(0), "DistributionAutomation: zero address");
        propertyToken = PropertyToken(payable(_propertyToken));
        minDistributionAmount = _minDistAmount;
        minInterval = _minInterval;
    }

    // ── Chainlink Automation interface ────────────────────────────────────────

    /// @notice Called by Chainlink Keepers off-chain to check if work is needed.
    /// @return upkeepNeeded True if performUpkeep should be called
    /// @return performData  ABI-encoded vault balance to pass to performUpkeep
    function checkUpkeep(bytes calldata /* checkData */)
        external view override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        if (paused) return (false, "");

        uint256 vaultBalance = propertyToken.getVaultBalance();
        uint256 holderCount  = propertyToken.holderCount();

        bool balanceSufficient = vaultBalance >= minDistributionAmount;
        bool intervalElapsed   = (block.timestamp - lastDistributionTime) >= minInterval;
        bool hasHolders        = holderCount > 0;

        upkeepNeeded = balanceSufficient && intervalElapsed && hasHolders;
        performData  = abi.encode(vaultBalance);
    }

    /// @notice Called by Chainlink Keepers on-chain when checkUpkeep returns true.
    /// @param performData ABI-encoded vault balance (sanity-checked against current)
    function performUpkeep(bytes calldata performData) external override nonReentrant {
        require(!paused, "DistributionAutomation: paused");

        uint256 expectedBalance = abi.decode(performData, (uint256));
        uint256 currentBalance  = propertyToken.getVaultBalance();

        // Sanity check: vault must still have enough (conditions may have changed)
        require(currentBalance >= minDistributionAmount, "DistributionAutomation: balance below minimum");
        require(
            (block.timestamp - lastDistributionTime) >= minInterval,
            "DistributionAutomation: interval not elapsed"
        );

        lastDistributionTime = block.timestamp;

        // Trigger batch distribution on the token
        propertyToken.distributeToAllHolders();

        emit DistributionTriggered(currentBalance, block.timestamp);
    }

    // ── Owner controls ────────────────────────────────────────────────────────

    function setMinDistributionAmount(uint256 amount) external onlyOwner {
        minDistributionAmount = amount;
        emit MinDistributionAmountUpdated(amount);
    }

    function setMinInterval(uint256 interval) external onlyOwner {
        minInterval = interval;
        emit MinIntervalUpdated(interval);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    // ── View ───────────────────────────────────────────────────────────────────

    /// @notice Human-readable status for monitoring
    function status() external view returns (
        bool _paused,
        uint256 vaultBalance,
        uint256 holderCount,
        uint256 lastDist,
        uint256 nextAllowed,
        bool readyToDistribute
    ) {
        _paused      = paused;
        vaultBalance = propertyToken.getVaultBalance();
        holderCount  = propertyToken.holderCount();
        lastDist     = lastDistributionTime;
        nextAllowed  = lastDistributionTime + minInterval;
        readyToDistribute =
            !paused &&
            vaultBalance >= minDistributionAmount &&
            (block.timestamp - lastDistributionTime) >= minInterval &&
            holderCount > 0;
    }
}
