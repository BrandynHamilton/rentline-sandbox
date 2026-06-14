// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./cre/SecurityToken.sol";

/// @title SecurityTokenFactory
/// @notice On-chain registry and factory for CRE SecurityToken deployments.
///
/// Two deployment paths:
///   1. User path  — wallet calls `create(...)`. Caller becomes governance multisig.
///   2. Admin path — backend calls `createFor(governanceMultisig, ...)` via operator key.
///
/// SecurityToken requires KYC/compliance so the factory does NOT mint supply at
/// deploy time — the compliance manager issues tokens separately after investor approval.
contract SecurityTokenFactory is Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────────────────────────

    address[] public allTokens;

    address public usdcAddress;

    mapping(address => address) public deployedBy;
    mapping(address => address) public tokenGovernance;

    /// Backend wallets allowed to call createFor()
    mapping(address => bool) public operators;

    // ── Events ─────────────────────────────────────────────────────────────────

    event SecurityTokenCreated(
        address indexed tokenAddress,
        address indexed governanceMultisig,
        address indexed deployedBy,
        string name,
        string symbol,
        string metadataUri
    );

    event OperatorUpdated(address indexed operator, bool enabled);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor(address _usdcAddress) Ownable(msg.sender) {
        require(_usdcAddress != address(0), "SecurityTokenFactory: zero usdc");
        usdcAddress = _usdcAddress;
    }

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "SecurityTokenFactory: not operator or owner"
        );
        _;
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorUpdated(operator, enabled);
    }

    // ── User path ─────────────────────────────────────────────────────────────

    /// @notice Deploy a SecurityToken where msg.sender is both compliance manager
    ///         and governance multisig.
    /// @param name           Token name
    /// @param symbol         Token symbol (e.g. "1234MAIN-SEC")
    /// @param metadataUri    URI pointing to {geoId}.json
    function create(
        string calldata name,
        string calldata symbol,
        string calldata metadataUri
    ) external nonReentrant returns (address tokenAddress) {
        return _deploy(name, symbol, msg.sender, msg.sender, metadataUri, msg.sender);
    }

    // ── Admin/operator path ───────────────────────────────────────────────────

    /// @notice Deploy a SecurityToken on behalf of a governance address.
    ///         Only callable by factory owner or registered operator.
    /// @param name                 Token name
    /// @param symbol               Token symbol
    /// @param complianceManager    Address with KYC approval rights
    /// @param governanceMultisig   Address that owns the contract
    /// @param metadataUri          URI pointing to {geoId}.json
    function createFor(
        string calldata name,
        string calldata symbol,
        address complianceManager,
        address governanceMultisig,
        string calldata metadataUri
    ) external nonReentrant onlyOperatorOrOwner returns (address tokenAddress) {
        return _deploy(name, symbol, complianceManager, governanceMultisig, metadataUri, msg.sender);
    }

    // ── Internal deploy ────────────────────────────────────────────────────────

    function _deploy(
        string calldata name,
        string calldata symbol,
        address complianceManager,
        address governanceMultisig,
        string calldata metadataUri,
        address deployer
    ) internal returns (address tokenAddress) {
        require(governanceMultisig != address(0), "SecurityTokenFactory: zero governance");
        require(complianceManager  != address(0), "SecurityTokenFactory: zero compliance");
        require(bytes(metadataUri).length > 0,    "SecurityTokenFactory: empty uri");

        SecurityToken token = new SecurityToken(
            name,
            symbol,
            complianceManager,
            governanceMultisig,
            usdcAddress,
            metadataUri
        );

        tokenAddress = address(token);

        allTokens.push(tokenAddress);
        deployedBy[tokenAddress]      = deployer;
        tokenGovernance[tokenAddress] = governanceMultisig;

        emit SecurityTokenCreated(
            tokenAddress,
            governanceMultisig,
            deployer,
            name,
            symbol,
            metadataUri
        );
    }

    // ── View ───────────────────────────────────────────────────────────────────

    function totalDeployed() external view returns (uint256) {
        return allTokens.length;
    }

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
