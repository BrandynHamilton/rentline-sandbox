// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PropertyToken - ERC-20 token for fractional real estate ownership
/// @notice Residential tokenization contract inspired by RealT
/// @dev Each property has its own token contract. Token holders receive pro-rata
///      rental income distributions either by pulling (withdrawRewards) or via
///      Chainlink Automation pushing (distributeToAllHolders).
contract PropertyToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========================================================================
    // State Variables
    // ========================================================================

    string public propertyAddress;
    string public propertyName;
    address public propertyOwner;
    address public vaultAddress;

    IERC20 public usdc;
    uint256 public totalDistributed;
    uint256 public totalRentReceived; // Total USDC received (synced)
    string public metadataUri;

    // ── Holder tracking (for push distributions) ──────────────────────────────
    // Maintained by _afterTokenTransfer: a holder is in the set iff balance > 0
    address[] private _holderList;
    mapping(address => bool) private _isHolder;
    mapping(address => uint256) private _holderIndex; // address → index in _holderList

    // ── Authorized distributors (Chainlink Automation contract address) ───────
    mapping(address => bool) public authorizedDistributors;

    // ========================================================================
    // Events
    // ========================================================================

    event PropertyInitialized(string indexed propertyName, string indexed propertyAddress, address indexed propertyOwner);
    event Deposit(address indexed from, uint256 amount);
    event Sync(uint256 newBalance, uint256 totalReceived);
    event Distribution(address indexed holder, uint256 amount);
    event BatchDistribution(uint256 totalAmount, uint256 holderCount, uint256 timestamp);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event MetadataUriUpdated(string uri);
    event DistributorAuthorized(address indexed distributor, bool authorized);

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(
        string memory _propertyName,
        string memory _propertyAddress,
        address _propertyOwner,
        address _usdcAddress,
        string memory _metadataUri
    ) ERC20(_propertyName, "RE-PROP") Ownable(msg.sender) {
        propertyName    = _propertyName;
        propertyAddress = _propertyAddress;
        propertyOwner   = _propertyOwner;
        usdc            = IERC20(_usdcAddress);
        vaultAddress    = address(this);
        metadataUri     = _metadataUri;

        emit PropertyInitialized(_propertyName, _propertyAddress, _propertyOwner);
    }

    // ========================================================================
    // Mint (called by factory before ownership transfer)
    // ========================================================================

    /// @notice Mint tokens. Only callable by owner (factory at deploy time).
    function mint(address to, uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        _mint(to, amount);
    }

    // ========================================================================
    // Rent Distribution — accepts direct USDC transfers (pull & push models)
    // ========================================================================

    /// @notice Sync vault balance — call this after USDC arrives (e.g., from Rentline).
    ///         Anyone can call this. Updates totalRentReceived for accounting.
    ///         Works with simple USDC transfers — no need to call depositRent().
    ///         This enables: Rentline → sends USDC → sync() → holders → withdrawRewards()
    function sync() external {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
            emit Sync(currentBalance, totalRentReceived);
        }
    }

    /// @notice Internal distribution logic (no reentrancy guard — caller must provide it)
    function _distribute() internal {
        uint256 vaultBalance = usdc.balanceOf(address(this));
        require(vaultBalance > 0, "Vault is empty");

        uint256 supply = totalSupply();
        require(supply > 0, "No supply");

        uint256 count = _holderList.length;
        require(count > 0, "No holders");

        uint256 distributed = 0;

        for (uint256 i = 0; i < count; ) {
            address holder      = _holderList[i];
            uint256 holderBal   = balanceOf(holder);
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

        totalDistributed += distributed;
        emit BatchDistribution(distributed, count, block.timestamp);
    }

    /// @notice Batch sync + distribute — one transaction for automated distributions.
    ///         Syncs vault, then pushes entire balance to all holders.
    ///         Ideal for cron jobs or backend scheduled tasks (no Chainlink needed).
    function syncAndDistribute() external nonReentrant onlyAuthorizedOrOwner {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
            emit Sync(currentBalance, totalRentReceived);
        }
        _distribute();
    }

    /// @notice Deposit USDC — alternative to direct transfer.
    ///         Caller must approve this contract first (usdc.approve(address(this), amount)).
    ///         Supports both push (Rentline sends USDC directly) and pull (depositRent) models.
    function depositRent(address from, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(from, address(this), amount);
        totalRentReceived += amount;
        emit Deposit(from, amount);
    }

    /// @notice Pull distribution — holder withdraws their pro-rata share
    function withdrawRewards() external nonReentrant {
        uint256 vaultBalance  = usdc.balanceOf(address(this));
        uint256 holderBalance = balanceOf(msg.sender);
        uint256 supply        = totalSupply();
        require(supply > 0, "No supply");
        uint256 holderShare   = (vaultBalance * holderBalance) / supply;
        require(holderShare > 0, "No rewards available");

        totalDistributed += holderShare;
        usdc.safeTransfer(msg.sender, holderShare);
        emit Distribution(msg.sender, holderShare);
    }

    // ========================================================================
    // Push Distribution — called by Chainlink Automation (DistributionAutomation)
    // ========================================================================

    /// @notice Push pro-rata USDC distribution to all current holders.
    ///         Called by DistributionAutomation.performUpkeep() via Chainlink Keeper.
    ///         Also callable by owner for manual batch distribution.
    /// @dev    Gas: O(n) where n = holderCount. Fine for <500 holders on testnet.
    ///         For production with large holder counts, use a Merkle-drop pattern instead.
    function distributeToAllHolders() external nonReentrant onlyAuthorizedOrOwner {
        _distribute();
    }

    // ========================================================================
    // Holder Tracking (internal)
    // ========================================================================

    /// @dev Override ERC20 _update to maintain the holder set.
    ///      Called on every mint, burn, and transfer.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        _trackHolder(to);
        _untrackHolder(from);
    }

    function _trackHolder(address addr) internal {
        if (addr == address(0)) return;
        if (!_isHolder[addr] && balanceOf(addr) > 0) {
            _isHolder[addr]    = true;
            _holderIndex[addr] = _holderList.length;
            _holderList.push(addr);
        }
    }

    function _untrackHolder(address addr) internal {
        if (addr == address(0)) return;
        if (_isHolder[addr] && balanceOf(addr) == 0) {
            // Swap-and-pop to keep list compact
            uint256 idx  = _holderIndex[addr];
            uint256 last = _holderList.length - 1;
            if (idx != last) {
                address lastAddr      = _holderList[last];
                _holderList[idx]      = lastAddr;
                _holderIndex[lastAddr] = idx;
            }
            _holderList.pop();
            delete _isHolder[addr];
            delete _holderIndex[addr];
        }
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    function getVaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getTotalDistributed() external view returns (uint256) {
        return totalDistributed;
    }

    function getAvailableRewards(address holder) external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (usdc.balanceOf(address(this)) * balanceOf(holder)) / supply;
    }

    function getOwnershipPercent(address holder) external view returns (uint256) {
        if (totalSupply() == 0) return 0;
        return (balanceOf(holder) * 10000) / totalSupply();
    }

    function contractURI() external view returns (string memory) {
        return metadataUri;
    }

    /// @notice Number of current token holders
    function holderCount() external view returns (uint256) {
        return _holderList.length;
    }

    /// @notice Paginated holder list
    function getHolders(uint256 offset, uint256 limit)
        external view returns (address[] memory)
    {
        uint256 end = offset + limit > _holderList.length
            ? _holderList.length : offset + limit;
        address[] memory out = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            out[i - offset] = _holderList[i];
        }
        return out;
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// @notice Grant or revoke Chainlink Automation distributor rights
    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorAuthorized(distributor, authorized);
    }

    function withdrawFees(uint256 amount) external nonReentrant onlyOwner {
        require(amount > 0, "Amount must be > 0");
        require(usdc.balanceOf(address(this)) >= amount, "Insufficient vault balance");
        usdc.safeTransfer(propertyOwner, amount);
        emit FeesWithdrawn(propertyOwner, amount);
    }

    function updatePropertyInfo(string memory newName, string memory newAddress) external onlyOwner {
        propertyName    = newName;
        propertyAddress = newAddress;
    }

    function setMetadataUri(string memory newUri) external onlyOwner {
        metadataUri = newUri;
        emit MetadataUriUpdated(newUri);
    }

    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ========================================================================
    // Modifiers
    // ========================================================================

    modifier onlyAuthorizedOrOwner() {
        require(
            msg.sender == owner() || authorizedDistributors[msg.sender],
            "PropertyToken: not authorized distributor"
        );
        _;
    }

    // ========================================================================
    // Fallback
    // ========================================================================

    receive() external payable {
        revert("PropertyToken does not accept ETH");
    }
}
