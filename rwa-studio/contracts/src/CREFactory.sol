// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./cre/SecurityToken.sol";
import "./cre/DistributionManager.sol";

/// @title CREFactory
/// @notice Deploys the core CRE tokenization pair in a single transaction:
///         SecurityToken + DistributionManager
///
/// PropertyLLC, InvestorRegistry, and Governance are optional infrastructure
/// that can be deployed and wired separately via RWA Studio after launch.
///
/// Two deployment paths:
///   1. User path  — wallet calls create(); msg.sender becomes governance multisig
///                   and compliance manager
///   2. Admin path — backend calls createFor(); roles assigned to specified addresses
///
struct CRESystem {
    address securityToken;
    address distributionManager;
}

contract CREFactory is Ownable, ReentrancyGuard {

    // ── State ──────────────────────────────────────────────────────────────────

    address[] public allTokens;
    mapping(address => CRESystem) public systemByToken;
    mapping(address => address)   public deployedBy;
    mapping(address => bool)      public operators;

    // ── Events ─────────────────────────────────────────────────────────────────

    event CRESystemCreated(
        address indexed securityToken,
        address indexed distributionManager,
        address indexed deployedBy,
        string  name,
        string  symbol,
        string  metadataUri
    );

    event OperatorUpdated(address indexed operator, bool enabled);

    // ── Constructor ────────────────────────────────────────────────────────────

    constructor() Ownable(msg.sender) {}

    // ── Modifiers ──────────────────────────────────────────────────────────────

    modifier onlyOperatorOrOwner() {
        require(
            msg.sender == owner() || operators[msg.sender],
            "CREFactory: not authorized"
        );
        _;
    }

    // ── Admin ──────────────────────────────────────────────────────────────────

    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorUpdated(operator, enabled);
    }

    // ── User path ─────────────────────────────────────────────────────────────

    /// @notice Deploy SecurityToken + DistributionManager.
    ///         msg.sender becomes compliance manager and governance multisig.
    function create(
        string  calldata name,
        string  calldata symbol,
        address          usdcAddress,
        string  calldata metadataUri
    ) external nonReentrant returns (CRESystem memory system) {
        return _deploy(name, symbol, usdcAddress, metadataUri,
                       msg.sender, msg.sender, msg.sender);
    }

    // ── Admin/operator path ───────────────────────────────────────────────────

    /// @notice Deploy on behalf of a governance address.
    function createFor(
        string  calldata name,
        string  calldata symbol,
        address          usdcAddress,
        string  calldata metadataUri,
        address          complianceManager,
        address          governanceMultisig
    ) external nonReentrant onlyOperatorOrOwner returns (CRESystem memory system) {
        return _deploy(name, symbol, usdcAddress, metadataUri,
                       complianceManager, governanceMultisig, msg.sender);
    }

    // ── Internal deploy ────────────────────────────────────────────────────────

    function _deploy(
        string  calldata name,
        string  calldata symbol,
        address          usdcAddress,
        string  calldata metadataUri,
        address          complianceManager,
        address          governanceMultisig,
        address          deployer
    ) internal returns (CRESystem memory system) {
        require(governanceMultisig != address(0), "CREFactory: zero governance");
        require(complianceManager  != address(0), "CREFactory: zero compliance");
        require(usdcAddress        != address(0), "CREFactory: zero usdc");
        require(bytes(metadataUri).length > 0,    "CREFactory: empty uri");

        SecurityToken token = new SecurityToken(
            name, symbol, complianceManager, governanceMultisig, usdcAddress, metadataUri
        );

        DistributionManager dm = new DistributionManager(address(token), usdcAddress);
        dm.transferOwnership(governanceMultisig);

        system.securityToken       = address(token);
        system.distributionManager = address(dm);

        allTokens.push(system.securityToken);
        systemByToken[system.securityToken] = system;
        deployedBy[system.securityToken]    = deployer;

        emit CRESystemCreated(
            system.securityToken,
            system.distributionManager,
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
