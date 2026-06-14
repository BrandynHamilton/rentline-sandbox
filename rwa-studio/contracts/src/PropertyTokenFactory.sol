// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PropertyToken.sol";

/// @title PropertyTokenFactory
/// @notice On-chain registry and factory for residential PropertyToken deployments.
///
/// Two deployment paths share the same factory:
///   1. Admin path  — backend calls `createFor(owner, ...)` on behalf of a user.
///                    Requires msg.sender == factory owner OR is in the operator set.
///   2. User path   — connected wallet calls `create(...)` directly.
///                    Owner of the new token = msg.sender (the wallet).
///
/// Both paths emit `PropertyTokenCreated` — a single queryable on-chain registry
/// of every token this factory has ever deployed.
contract PropertyTokenFactory is Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────────────────────────

    /// All deployed token addresses in creation order
    address[] public allTokens;

    /// token address → deployer (msg.sender at creation time)
    mapping(address => address) public deployedBy;

    /// token address → designated owner (propertyOwner field)
    mapping(address => address) public tokenOwner;

    /// Addresses allowed to call createFor() — admin backend wallets
    mapping(address => bool) public operators;

    // ── Events ─────────────────────────────────────────────────────────────────

    event PropertyTokenCreated(
        address indexed tokenAddress,
        address indexed owner,
        address indexed deployedBy,
        string propertyName,
        string metadataUri,
        uint256 initialSupply
    );

    event OperatorUpdated(address indexed operator, bool enabled);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "PropertyTokenFactory: not operator or owner"
        );
        _;
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    /// @notice Grant or revoke operator rights (backend deployer wallet)
    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorUpdated(operator, enabled);
    }

    // ── User path: wallet deploys for themselves ───────────────────────────────

    /// @notice Deploy a PropertyToken where msg.sender becomes the owner.
    ///         Called directly by a connected wallet.
    /// @param propertyName    Display name of the property
    /// @param physicalAddress Physical street address string
    /// @param usdcAddress     USDC contract on this chain
    /// @param metadataUri     URI pointing to {geoId}.json (oracle + tokenURI)
    /// @param initialSupply   Token supply to mint to msg.sender (18-decimal units)
    function create(
        string calldata propertyName,
        string calldata physicalAddress,
        address usdcAddress,
        string calldata metadataUri,
        uint256 initialSupply
    ) external nonReentrant returns (address tokenAddress) {
        return _deploy(
            propertyName,
            physicalAddress,
            msg.sender,   // owner = caller
            usdcAddress,
            metadataUri,
            initialSupply,
            msg.sender,   // deployer = caller
            address(0)    // no default distributor for user-deployed tokens
        );
    }

    // ── Admin/operator path: deploy on behalf of a user ───────────────────────

    /// @notice Deploy a PropertyToken on behalf of `owner`.
    ///         Only callable by factory owner or a registered operator.
    ///         Backend uses this — gas is paid by the operator key, but
    ///         token ownership + supply go to `owner`.
    /// @param propertyName    Display name of the property
    /// @param physicalAddress Physical street address string
    /// @param tokenOwnerAddr  Address that will receive ownership + initial supply
    /// @param usdcAddress     USDC contract on this chain
    /// @param metadataUri     URI pointing to {geoId}.json (oracle + tokenURI)
    /// @param initialSupply   Token supply to mint to tokenOwnerAddr (18-decimal units)
    /// @param distributor     Address to authorize as distributor before ownership transfer
    ///                        (e.g., Rentline admin wallet). Pass address(0) to skip.
    function createFor(
        string calldata propertyName,
        string calldata physicalAddress,
        address tokenOwnerAddr,
        address usdcAddress,
        string calldata metadataUri,
        uint256 initialSupply,
        address distributor
    ) external nonReentrant onlyOperatorOrOwner returns (address tokenAddress) {
        return _deploy(
            propertyName,
            physicalAddress,
            tokenOwnerAddr,
            usdcAddress,
            metadataUri,
            initialSupply,
            msg.sender,   // deployer = operator/admin
            distributor
        );
    }

    // ── Internal deploy ────────────────────────────────────────────────────────

    function _deploy(
        string calldata propertyName,
        string calldata physicalAddress,
        address owner_,
        address usdcAddress,
        string calldata metadataUri,
        uint256 initialSupply,
        address deployer,
        address distributor
    ) internal returns (address tokenAddress) {
        require(owner_ != address(0),    "PropertyTokenFactory: zero owner");
        require(usdcAddress != address(0), "PropertyTokenFactory: zero usdc");
        require(bytes(metadataUri).length > 0, "PropertyTokenFactory: empty uri");

        PropertyToken token = new PropertyToken(
            propertyName,
            physicalAddress,
            owner_,
            usdcAddress,
            metadataUri
        );

        tokenAddress = address(token);

        // Mint initial supply to owner if requested
        if (initialSupply > 0) {
            token.mint(owner_, initialSupply);
        }

        // Authorize distributor before transferring ownership
        // (factory still owns the token at this point)
        if (distributor != address(0)) {
            token.setAuthorizedDistributor(distributor, true);
        }

        // Transfer contract ownership to the property owner
        // (factory deployed it, so factory is initial Ownable owner)
        token.transferOwnership(owner_);

        // Register
        allTokens.push(tokenAddress);
        deployedBy[tokenAddress] = deployer;
        tokenOwner[tokenAddress] = owner_;

        emit PropertyTokenCreated(
            tokenAddress,
            owner_,
            deployer,
            propertyName,
            metadataUri,
            initialSupply
        );
    }

    // ── View ───────────────────────────────────────────────────────────────────

    /// @notice Total number of tokens deployed by this factory
    function totalDeployed() external view returns (uint256) {
        return allTokens.length;
    }

    /// @notice Paginated list of all deployed token addresses
    function getTokens(uint256 offset, uint256 limit)
        external view returns (address[] memory)
    {
        uint256 end = offset + limit > allTokens.length
            ? allTokens.length : offset + limit;
        address[] memory out = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            out[i - offset] = allTokens[i];
        }
        return out;
    }
}
