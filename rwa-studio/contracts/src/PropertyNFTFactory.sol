// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PropertyNFT.sol";

/// @title PropertyNFTFactory
/// @notice On-chain registry and factory for PropertyNFT (ERC-721 + yield vault) deployments.
///
/// Mirrors PropertyTokenFactory exactly:
///   1. User path  — wallet calls create(); owner = msg.sender
///   2. Admin path — backend calls createFor(); owner = specified address; gas = operator
///
/// Each deployment mints exactly one NFT (tokenId = 0) to the designated owner.
contract PropertyNFTFactory is Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────────────────────────

    /// All deployed NFT contract addresses in creation order
    address[] public allTokens;

    /// token address → deployer (msg.sender at creation time)
    mapping(address => address) public deployedBy;

    /// token address → designated owner (property owner)
    mapping(address => address) public tokenOwner;

    /// Addresses allowed to call createFor() — admin backend wallets
    mapping(address => bool) public operators;

    // ── Events ─────────────────────────────────────────────────────────────────

    event PropertyNFTCreated(
        address indexed tokenAddress,
        address indexed owner,
        address indexed deployedBy,
        string  propertyName,
        string  metadataUri
    );

    event OperatorUpdated(address indexed operator, bool enabled);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "PropertyNFTFactory: not operator or owner"
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

    /// @notice Deploy a PropertyNFT where msg.sender becomes the owner and
    ///         receives the single minted deed NFT (tokenId = 0).
    /// @param propertyName    Display name of the property
    /// @param physicalAddress Physical street address string
    /// @param usdcAddress     USDC contract on this chain (for yield vault)
    /// @param metadataUri     URI pointing to {geoId}.json (oracle + tokenURI)
    function create(
        string calldata propertyName,
        string calldata physicalAddress,
        address usdcAddress,
        string calldata metadataUri
    ) external nonReentrant returns (address tokenAddress) {
        return _deploy(
            propertyName,
            physicalAddress,
            msg.sender,
            usdcAddress,
            metadataUri,
            msg.sender
        );
    }

    // ── Admin/operator path: deploy on behalf of a user ───────────────────────

    /// @notice Deploy a PropertyNFT on behalf of `tokenOwnerAddr`.
    ///         Only callable by factory owner or a registered operator.
    /// @param propertyName    Display name of the property
    /// @param physicalAddress Physical street address string
    /// @param tokenOwnerAddr  Address that will receive the NFT + ownership
    /// @param usdcAddress     USDC contract on this chain
    /// @param metadataUri     URI pointing to {geoId}.json
    function createFor(
        string calldata propertyName,
        string calldata physicalAddress,
        address tokenOwnerAddr,
        address usdcAddress,
        string calldata metadataUri
    ) external nonReentrant onlyOperatorOrOwner returns (address tokenAddress) {
        return _deploy(
            propertyName,
            physicalAddress,
            tokenOwnerAddr,
            usdcAddress,
            metadataUri,
            msg.sender
        );
    }

    // ── Internal deploy ────────────────────────────────────────────────────────

    function _deploy(
        string calldata propertyName,
        string calldata physicalAddress,
        address owner_,
        address usdcAddress,
        string calldata metadataUri,
        address deployer
    ) internal returns (address tokenAddress) {
        require(owner_       != address(0), "PropertyNFTFactory: zero owner");
        require(usdcAddress  != address(0), "PropertyNFTFactory: zero usdc");
        require(bytes(metadataUri).length > 0, "PropertyNFTFactory: empty uri");

        // Deploy PropertyNFT — factory is initial Ownable owner so it can call mint()
        PropertyNFT nft = new PropertyNFT(
            propertyName,
            physicalAddress,
            owner_,
            usdcAddress,
            metadataUri
        );

        tokenAddress = address(nft);

        // Mint the single deed NFT (tokenId = 0) to the property owner
        nft.mint(owner_);

        // Hand off contract ownership to the property owner
        nft.transferOwnership(owner_);

        // Register in factory
        allTokens.push(tokenAddress);
        deployedBy[tokenAddress] = deployer;
        tokenOwner[tokenAddress] = owner_;

        emit PropertyNFTCreated(
            tokenAddress,
            owner_,
            deployer,
            propertyName,
            metadataUri
        );
    }

    // ── View ───────────────────────────────────────────────────────────────────

    /// @notice Total number of PropertyNFT contracts deployed by this factory
    function totalDeployed() external view returns (uint256) {
        return allTokens.length;
    }

    /// @notice Paginated list of all deployed PropertyNFT addresses
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
