// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISecurityToken {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function holderCount() external view returns (uint256);
    function getHolders(uint256 offset, uint256 limit) external view returns (address[] memory);
}

contract DistributionManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct DistributionParams {
        uint256 preferredReturnBps;
        uint256 sponsorPromoteBps;
        uint256 waterfallThreshold;
    }

    struct DistributionState {
        uint256 totalDistributed;
        uint256 preferredReturnPaid;
        uint256 sponsorPromotePaid;
        uint256 investorPayout;
        uint256 lastDistributionTime;
    }

    mapping(address => DistributionParams) public propertyParams;
    mapping(address => DistributionState) public propertyState;
    address public tokenContract;
    IERC20 public usdc;

    mapping(address => bool) public authorizedDistributors;

    event DistributionPaid(address indexed property, uint256 totalAmount);
    event PreferredReturnPaid(address indexed property, uint256 amount);
    event SponsorPromotePaid(address indexed property, uint256 amount);
    event InvestorPayoutPaid(address indexed property, uint256 amount);
    event ParamsUpdated(address indexed property, DistributionParams params);
    event TokenContractUpdated(address indexed newToken);
    event USDCContractUpdated(address indexed newUSDC);
    event Deposit(address indexed from, uint256 amount);
    event DistributorAuthorized(address indexed distributor, bool authorized);
    event Distribution(address indexed holder, uint256 amount);

    constructor(address _tokenContract, address _usdcToken) Ownable(msg.sender) {
        tokenContract = _tokenContract;
        usdc = IERC20(_usdcToken);
    }

    function setTokenContract(address newToken) external onlyOwner {
        require(newToken != address(0), "Invalid address");
        tokenContract = newToken;
        emit TokenContractUpdated(newToken);
    }

    function setUSDCContract(address newUSDC) external onlyOwner {
        require(newUSDC != address(0), "Invalid address");
        usdc = IERC20(newUSDC);
        emit USDCContractUpdated(newUSDC);
    }

    function setDistributionParams(address property, DistributionParams memory params) external onlyOwner {
        propertyParams[property] = params;
        emit ParamsUpdated(property, params);
    }

    function processDistribution(address property, uint256 totalAmount)
        external nonReentrant
        returns (uint256 preferredReturn, uint256 sponsorPromote, uint256 investorPayout)
    {
        require(totalAmount > 0, "Amount must be greater than 0");
        DistributionParams memory params = propertyParams[property];
        require(params.preferredReturnBps > 0, "Preferred return not set");

        preferredReturn = (totalAmount * params.preferredReturnBps) / 10000;
        uint256 remaining = totalAmount - preferredReturn;
        sponsorPromote = (remaining * params.sponsorPromoteBps) / 10000;
        investorPayout = remaining - sponsorPromote;

        DistributionState storage state = propertyState[property];
        state.totalDistributed += totalAmount;
        state.preferredReturnPaid += preferredReturn;
        state.sponsorPromotePaid += sponsorPromote;
        state.investorPayout += investorPayout;
        state.lastDistributionTime = block.timestamp;

        emit DistributionPaid(property, totalAmount);
        emit PreferredReturnPaid(property, preferredReturn);
        emit SponsorPromotePaid(property, sponsorPromote);
        emit InvestorPayoutPaid(property, investorPayout);
    }

    // ========================================================================
    // USDC Vault — depositRent / pull model
    // ========================================================================

    /// @notice Pull USDC from Rentline into the vault for pro-rata distribution
    function depositRent(address from, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(from, address(this), amount);
        emit Deposit(from, amount);
    }

    // ========================================================================
    // Push Distribution — pro-rata to all SecurityToken holders
    // ========================================================================

    /// @notice Distribute vault USDC pro-rata to all SecurityToken holders
    ///         Callable by owner or authorized distributor (e.g. Chainlink Automation).
    /// @dev    Gas: O(n) where n = holder count. Works for <500 holders.
    function distributeProRata() external nonReentrant onlyAuthorizedOrOwner {
        uint256 vaultBalance = usdc.balanceOf(address(this));
        require(vaultBalance > 0, "Vault is empty");

        ISecurityToken token = ISecurityToken(tokenContract);
        uint256 supply = token.totalSupply();
        require(supply > 0, "No token supply");

        uint256 count = token.holderCount();
        require(count > 0, "No holders");

        address[] memory holders = token.getHolders(0, count);
        uint256 distributed = 0;

        for (uint256 i = 0; i < holders.length; ) {
            address holder    = holders[i];
            uint256 holderBal = token.balanceOf(holder);
            if (holderBal > 0) {
                uint256 share = (vaultBalance * holderBal) / supply;
                if (share > 0) {
                    distributed += share;
                    usdc.safeTransfer(holder, share);
                    emit Distribution(holder, share);
                }
            }
            unchecked { ++i; }
        }
    }

    // ========================================================================
    // Vault View
    // ========================================================================

    function getVaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ========================================================================
    // Distribution State Views
    // ========================================================================

    function getDistributionState(address property) external view returns (DistributionState memory) {
        return propertyState[property];
    }

    function getDistributionParams(address property) external view returns (DistributionParams memory) {
        return propertyParams[property];
    }

    // ========================================================================
    // Admin
    // ========================================================================

    /// @notice Grant or revoke distributor rights (Chainlink Automation)
    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorAuthorized(distributor, authorized);
    }

    // ========================================================================
    // Modifiers
    // ========================================================================

    modifier onlyAuthorizedOrOwner() {
        require(
            msg.sender == owner() || authorizedDistributors[msg.sender],
            "DistributionManager: not authorized distributor"
        );
        _;
    }
}