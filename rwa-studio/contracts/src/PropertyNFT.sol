// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PropertyNFT — ERC-721 property deed with shared USDC yield vault
/// @notice One NFT represents one property deed. A single USDC vault accumulates
///         rental income which the NFT owner can withdraw (pull model) or which
///         an authorized distributor (e.g. Chainlink Automation) can push.
///         Minting is fixed at deployment time — exactly 1 NFT (tokenId = 0) is
///         minted to the property owner by the factory.
/// @dev    Supply is intentionally capped at 1. For fractional NFT collections
///         (N NFTs per property) use PropertyNFTFactory.create() with a future
///         multi-mint variant — the yield accounting remains per-contract and
///         is therefore identical.
contract PropertyNFT is ERC721, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========================================================================
    // Constants
    // ========================================================================

    uint256 public constant TOKEN_ID = 0;

    // ========================================================================
    // State
    // ========================================================================

    string public propertyAddress;
    string public propertyName;
    address public propertyOwner;

    IERC20  public usdc;
    uint256 public totalDistributed;
    uint256 public totalRentReceived;
    string  public metadataUri;

    /// @dev Snapshot of vault balance at last claim — used to track unclaimed yield
    ///      across ownership transfers. Yield belongs to whoever holds the NFT when
    ///      the vault is non-zero.
    uint256 private _lastClaimedVaultBalance;

    /// Authorized distributors (Chainlink Automation)
    mapping(address => bool) public authorizedDistributors;

    // ========================================================================
    // Events
    // ========================================================================

    event PropertyInitialized(
        string indexed propertyName,
        string indexed propertyAddress,
        address indexed propertyOwner
    );
    event Deposit(address indexed from, uint256 amount);
    event YieldWithdrawn(address indexed holder, uint256 amount);
    event YieldPushed(address indexed holder, uint256 amount, uint256 timestamp);
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
    ) ERC721(_propertyName, "RE-NFT") Ownable(msg.sender) {
        propertyName    = _propertyName;
        propertyAddress = _propertyAddress;
        propertyOwner   = _propertyOwner;
        usdc            = IERC20(_usdcAddress);
        metadataUri     = _metadataUri;

        emit PropertyInitialized(_propertyName, _propertyAddress, _propertyOwner);
    }

    // ========================================================================
    // Mint — called once by factory, then ownership transferred
    // ========================================================================

    /// @notice Mint the single property deed NFT. Only callable by owner (factory).
    function mint(address to) external onlyOwner {
        _safeMint(to, TOKEN_ID);
    }

    // ========================================================================
    // Yield — Pull Model
    // ========================================================================

    /// @notice Sync vault balance — call this after USDC arrives (e.g., from Rentline).
    ///         Anyone can call this. Works with simple USDC transfers.
    function sync() external {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
        }
    }

    /// @notice Batch sync + distribute — one transaction for automated distributions.
    ///         Ideal for cron jobs or backend scheduled tasks (no Chainlink needed).
    function syncAndDistribute() external nonReentrant onlyAuthorizedOrOwner {
        uint256 currentBalance = usdc.balanceOf(address(this));
        if (currentBalance > totalRentReceived) {
            totalRentReceived = currentBalance;
        }
        if (currentBalance > 0) {
            address holder = ownerOf(TOKEN_ID);
            if (holder != address(0)) {
                usdc.safeTransfer(holder, currentBalance);
                totalDistributed += currentBalance;
                emit YieldPushed(holder, currentBalance, block.timestamp);
            }
        }
    }

    /// @notice Deposit USDC rent into the vault. Callable by anyone (Rentline, owner).
    ///         Note: Prefer just sending USDC directly to this contract address.
    function depositRent(address from, uint256 amount) external nonReentrant {
        require(amount > 0, "PropertyNFT: zero amount");
        usdc.safeTransferFrom(from, address(this), amount);
        totalRentReceived += amount;
        emit Deposit(from, amount);
    }

    /// @notice Withdraw all accumulated vault balance to the current NFT owner.
    ///         Because there is exactly 1 token, the holder receives 100% of the vault.
    function withdrawYield() external nonReentrant {
        address holder = ownerOf(TOKEN_ID);
        require(msg.sender == holder, "PropertyNFT: not token owner");
        uint256 vaultBalance = usdc.balanceOf(address(this));
        require(vaultBalance > 0, "PropertyNFT: vault empty");

        totalDistributed         += vaultBalance;
        _lastClaimedVaultBalance  = 0;
        usdc.safeTransfer(holder, vaultBalance);
        emit YieldWithdrawn(holder, vaultBalance);
    }

    // ========================================================================
    // Yield — Push Model (Chainlink Automation / owner)
    // ========================================================================

    /// @notice Push all vault balance to the current NFT holder.
    ///         Called by DistributionAutomation.performUpkeep() or manually by owner.
    function distributeYield() external nonReentrant onlyAuthorizedOrOwner {
        address holder       = ownerOf(TOKEN_ID);
        uint256 vaultBalance = usdc.balanceOf(address(this));
        require(vaultBalance > 0, "PropertyNFT: vault empty");

        totalDistributed += vaultBalance;
        usdc.safeTransfer(holder, vaultBalance);
        emit YieldPushed(holder, vaultBalance, block.timestamp);
    }

    // ========================================================================
    // View
    // ========================================================================

    function getVaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function getTotalDistributed() external view returns (uint256) {
        return totalDistributed;
    }

    /// @notice Available yield for the current NFT owner (= entire vault balance).
    function getAvailableYield() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /// @notice Returns the metadataUri for any tokenId (only TOKEN_ID = 0 exists).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return metadataUri;
    }

    function contractURI() external view returns (string memory) {
        return metadataUri;
    }

    // ========================================================================
    // Admin
    // ========================================================================

    function setAuthorizedDistributor(address distributor, bool authorized) external onlyOwner {
        authorizedDistributors[distributor] = authorized;
        emit DistributorAuthorized(distributor, authorized);
    }

    function withdrawFees(uint256 amount) external nonReentrant onlyOwner {
        require(amount > 0, "PropertyNFT: zero amount");
        require(usdc.balanceOf(address(this)) >= amount, "PropertyNFT: insufficient vault");
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
        require(token != address(usdc), "PropertyNFT: cannot recover USDC vault");
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ========================================================================
    // Modifiers
    // ========================================================================

    modifier onlyAuthorizedOrOwner() {
        require(
            msg.sender == owner() || authorizedDistributors[msg.sender],
            "PropertyNFT: not authorized distributor"
        );
        _;
    }

    // ========================================================================
    // Fallback
    // ========================================================================

    receive() external payable {
        revert("PropertyNFT: does not accept ETH");
    }
}
