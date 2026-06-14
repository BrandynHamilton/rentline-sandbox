// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SecurityToken - ERC-20 security token with compliance restrictions
/// @notice Represents ownership in a commercial real estate SPV
/// @dev Implements transfer restrictions, accredited investor checks, lockups
contract SecurityToken is IERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========================================================================
    // State Variables
    // ========================================================================

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    // Metadata URI pointing to property listing details (e.g., MLS JSON)
    string public metadataUri;

    // Investor status
    struct Investor {
        bool kycApproved;
        bool accredited;
        bool institutional;
        uint256 lockupExpiry;
        uint256 balance;
        uint256 joinedAt;
    }

    mapping(address => Investor) public investors;
    mapping(address => uint256) public balances;
    
    // Transfer restrictions
    bool public transferEnabled;
    address public complianceManager;
    address public governanceMultisig;

    //Jurisdiction whitelist (empty = all, non-empty = restricted)
    mapping(address => bool) public jurisdictionWhitelist;
    bool public useJurisdictionWhitelist;

    // ── Holder tracking (for push distributions) ──────────────────────────────
    address[] private _holderList;
    mapping(address => bool) private _isHolder;
    mapping(address => uint256) private _holderIndex;

    // ── Authorized distributors (Chainlink Automation) ────────────────────────
    mapping(address => bool) public authorizedDistributors;

    // ── USDC Vault & Distribution ───────────────────────────────────────────
    IERC20 public usdc;
    uint256 public totalDistributed;
    uint256 public totalRentReceived;

    // ========================================================================
    // Events
    // ========================================================================

    event InvestorApproved(address indexed investor, bool accredited, bool institutional, uint256 lockupExpiry);
    event InvestorRejected(address indexed investor, string reason);
    event TransferRestricted(address indexed from, address indexed to, string reason);
    event LockupExpired(address indexed investor);
    event TransferEnabled(bool enabled);
    event ComplianceManagerUpdated(address indexed newManager);
    event GovernanceMultisigUpdated(address indexed newMultisig);
    event MetadataUriUpdated(string uri);
    event DistributorAuthorized(address indexed distributor, bool authorized);
    event Distribution(address indexed holder, uint256 amount);
    event BatchDistribution(uint256 totalAmount, uint256 holderCount, uint256 timestamp);
    event Deposit(address indexed from, uint256 amount);
    event Sync(uint256 newBalance, uint256 totalReceived);

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor(
        string memory _name,
        string memory _symbol,
        address _complianceManager,
        address _governanceMultisig,
        address _usdcAddress,
        string memory _metadataUri
    ) Ownable(_governanceMultisig) {
        name = _name;
        symbol = _symbol;
        complianceManager = _complianceManager;
        governanceMultisig = _governanceMultisig;
        usdc = IERC20(_usdcAddress);
        metadataUri = _metadataUri;
        transferEnabled = false; // Must be explicitly enabled
    }

    // ========================================================================
    // Investor Management
    // ========================================================================

    /// @notice Approve an investor (only compliance manager)
    /// @param investor Address to approve
    /// @param _accredited Whether the investor is accredited
    /// @param _institutional Whether the investor is institutional
    /// @param _lockupExpiry Unix timestamp when lockup expires (0 = no lockup)
    function approveInvestor(
        address investor,
        bool _accredited,
        bool _institutional,
        uint256 _lockupExpiry
    ) external onlyComplianceManager {
        require(investor != address(0), "Invalid address");
        require(!investors[investor].kycApproved, "Already approved");

        investors[investor] = Investor({
            kycApproved: true,
            accredited: _accredited,
            institutional: _institutional,
            lockupExpiry: _lockupExpiry,
            balance: 0,
            joinedAt: block.timestamp
        });

        emit InvestorApproved(investor, _accredited, _institutional, _lockupExpiry);
    }

    /// @notice Reject an investor (only compliance manager)
    /// @param investor Address to reject
    /// @param reason Reason for rejection
    function rejectInvestor(address investor, string memory reason) external onlyComplianceManager {
        require(investors[investor].kycApproved, "Not approved");
        
        delete investors[investor];
        emit InvestorRejected(investor, reason);
    }

    /// @notice Update lockup expiry for an investor
    /// @param investor Address to update
    /// @param newLockupExpiry New lockup expiry timestamp
    function updateLockup(address investor, uint256 newLockupExpiry) external onlyComplianceManager {
        require(investors[investor].kycApproved, "Investor not approved");
        investors[investor].lockupExpiry = newLockupExpiry;
    }

    // ========================================================================
    // Transfer Functions
    // ========================================================================

    /// @notice Check if a transfer is allowed
    /// @param from Sender address
    /// @param to Recipient address
    /// @return allowed Whether transfer is permitted
    /// @return reason Reason if not allowed (empty if allowed)
    function canTransfer(address from, address to) public view returns (bool allowed, string memory reason) {
        // Check sender
        if (!investors[from].kycApproved) {
            return (false, "Sender not approved");
        }

        // Check lockup
        if (investors[from].lockupExpiry > block.timestamp) {
            return (false, "Sender in lockup period");
        }

        // Check recipient
        if (!investors[to].kycApproved) {
            return (false, "Recipient not approved");
        }

        // Check jurisdiction whitelist
        if (useJurisdictionWhitelist && !jurisdictionWhitelist[to]) {
            return (false, "Recipient jurisdiction not whitelisted");
        }

        return (true, "");
    }

    /// @notice Transfer tokens (with compliance check)
    /// @param to Recipient address
    /// @param amount Amount to transfer
    /// @return success Whether transfer succeeded
    function transfer(address to, uint256 amount) external nonReentrant returns (bool) {
        (bool allowed, string memory reason) = canTransfer(msg.sender, to);
        if (!allowed) {
            emit TransferRestricted(msg.sender, to, reason);
            return false;
        }

        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Transfer tokens with message (ERC-1400 style)
    /// @param to Recipient address
    /// @param amount Amount to transfer
    /// @param data Additional data (e.g., transfer reason)
    function transferWithMessage(address to, uint256 amount, bytes memory data) external nonReentrant returns (bool) {
        (bool allowed, string memory reason) = canTransfer(msg.sender, to);
        if (!allowed) {
            emit TransferRestricted(msg.sender, to, reason);
            return false;
        }

        _transfer(msg.sender, to, amount);
        return true;
    }

    // ========================================================================
    // IERC20 Implementation
    // ========================================================================

    function _transfer(address from, address to, uint256 amount) internal {
        require(balances[from] >= amount, "Insufficient balance");
        require(amount > 0, "Amount must be > 0");

        balances[from] -= amount;
        balances[to] += amount;

        _trackHolder(to);
        _untrackHolder(from);

        emit Transfer(from, to, amount);
    }

    function _trackHolder(address addr) internal {
        if (addr == address(0)) return;
        if (!_isHolder[addr] && balances[addr] > 0) {
            _isHolder[addr]    = true;
            _holderIndex[addr] = _holderList.length;
            _holderList.push(addr);
        }
    }

    function _untrackHolder(address addr) internal {
        if (addr == address(0)) return;
        if (_isHolder[addr] && balances[addr] == 0) {
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

    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner, address spender) public view returns (uint256) {
        return 0; // Not implemented for this demo
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        return false; // Not implemented for this demo
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        return false; // Not implemented for this demo
    }

    // ========================================================================
    // USDC Vault & Distribution — Pull & Push Models
    // ========================================================================

    /// @notice Sync vault balance — call this after USDC arrives (e.g., from Rentline).
    ///         Works with simple USDC transfers. Updates totalRentReceived for accounting.
    function sync() external {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
            emit Sync(currentBalance, totalRentReceived);
        }
    }

    /// @notice Batch sync + distribute — one tx for automated cron distributions.
    ///         Ideal for backend scheduled tasks (no Chainlink needed).
    function syncAndDistribute() external nonReentrant onlyAuthorizedOrOwner {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
        }
        _distribute(currentBalance);
    }

    /// @notice Deposit USDC rent into the vault.
    ///         Alternative to direct transfer — caller must approve first.
    function depositRent(address from, uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(from, address(this), amount);
        totalRentReceived += amount;
        emit Deposit(from, amount);
    }

    /// @notice Pull distribution — holder withdraws their pro-rata share
    function withdrawRewards() external nonReentrant {
        uint256 vaultBalance = usdc.balanceOf(address(this));
        uint256 holderBalance = balances[msg.sender];
        uint256 supply = totalSupply;
        require(supply > 0, "No supply");
        uint256 holderShare = (vaultBalance * holderBalance) / supply;
        require(holderShare > 0, "No rewards available");

        totalDistributed += holderShare;
        usdc.safeTransfer(msg.sender, holderShare);
        emit Distribution(msg.sender, holderShare);
    }

    /// @notice Push pro-rata USDC distribution to all current holders.
    ///         Called by authorized distributor (Chainlink Automation) or owner.
    function distributeToAllHolders() external nonReentrant onlyAuthorizedOrOwner {
        uint256 vaultBalance = usdc.balanceOf(address(this));
        _distribute(vaultBalance);
    }

    function _distribute(uint256 vaultBalance) internal {
        require(vaultBalance > 0, "Vault is empty");
        require(totalSupply > 0, "No supply");
        require(_holderList.length > 0, "No holders");

        uint256 supply = totalSupply;
        uint256 distributed = 0;

        for (uint256 i = 0; i < _holderList.length; ) {
            address holder = _holderList[i];
            uint256 holderBal = balances[holder];
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
        emit BatchDistribution(distributed, _holderList.length, block.timestamp);
    }

    /// @notice Get vault balance (USDC in contract)
    function getVaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Get pending rewards for a holder
    function getAvailableRewards(address holder) external view returns (uint256) {
        if (totalSupply == 0) return 0;
        return (usdc.balanceOf(address(this)) * balances[holder]) / totalSupply;
    }

    // ========================================================================
    // Admin Functions
    // ========================================================================

    /// @notice Enable/disable transfers
    function setTransferEnabled(bool enabled) external onlyOwner {
        transferEnabled = enabled;
        emit TransferEnabled(enabled);
    }

    /// @notice Set compliance manager
    function setComplianceManager(address newManager) external onlyOwner {
        require(newManager != address(0), "Invalid address");
        complianceManager = newManager;
        emit ComplianceManagerUpdated(newManager);
    }

    /// @notice Set governance multisig
    function setGovernanceMultisig(address newMultisig) external onlyOwner {
        require(newMultisig != address(0), "Invalid address");
        governanceMultisig = newMultisig;
        emit GovernanceMultisigUpdated(newMultisig);
    }

    /// @notice Update the metadata URI
    /// @param newUri New URI pointing to property listing metadata (e.g., MLS JSON)
    function setMetadataUri(string memory newUri) external onlyOwner {
        metadataUri = newUri;
        emit MetadataUriUpdated(newUri);
    }

    /// @notice Enable jurisdiction whitelist
    function setUseJurisdictionWhitelist(bool enabled) external onlyOwner {
        useJurisdictionWhitelist = enabled;
    }

    /// @notice Grant or revoke distributor rights (Chainlink Automation)
    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorAuthorized(distributor, authorized);
    }

    /// @notice Add jurisdiction to whitelist
    function addToJurisdictionWhitelist(address jurisdiction) external onlyOwner {
        jurisdictionWhitelist[jurisdiction] = true;
    }

    /// @notice Remove jurisdiction from whitelist
    function removeFromJurisdictionWhitelist(address jurisdiction) external onlyOwner {
        jurisdictionWhitelist[jurisdiction] = false;
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    /// @notice Contract-level metadata URI (OpenSea standard)
    /// @return URI pointing to contract metadata JSON
    function contractURI() external view returns (string memory) {
        return metadataUri;
    }

    function isApproved(address investor) external view returns (bool) {
        return investors[investor].kycApproved;
    }

    function isAccredited(address investor) external view returns (bool) {
        return investors[investor].kycApproved && investors[investor].accredited;
    }

    function isInstitutional(address investor) external view returns (bool) {
        return investors[investor].kycApproved && investors[investor].institutional;
    }

    function getLockupExpiry(address investor) external view returns (uint256) {
        return investors[investor].lockupExpiry;
    }

    function canTransferNow(address from, address to) external view returns (bool) {
        (bool allowed, ) = canTransfer(from, to);
        return allowed;
    }

    function holderCount() external view returns (uint256) {
        return _holderList.length;
    }

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
    // Modifiers
    // ========================================================================

    modifier onlyComplianceManager() {
        require(msg.sender == complianceManager, "Not compliance manager");
        _;
    }

    modifier onlyAuthorizedOrOwner() {
        require(
            msg.sender == owner() || authorizedDistributors[msg.sender],
            "SecurityToken: not authorized distributor"
        );
        _;
    }
}
