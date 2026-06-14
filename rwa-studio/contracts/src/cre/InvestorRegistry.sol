// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract InvestorRegistry is Ownable {
    enum InvestorStatus { Pending, Verified, Accredited, Blocked, Suspended }

    struct InvestorData {
        InvestorStatus status;
        bool isAccredited;
        string jurisdiction;
        string kycHash;
        uint256 verifiedAt;
        uint256 accreditedAt;
    }

    mapping(address => InvestorData) public investors;
    address public accreditationVerifier;

    event InvestorVerified(address indexed investor, string jurisdiction);
    event InvestorAccredited(address indexed investor);
    event InvestorBlocked(address indexed investor, string reason);
    event InvestorStatusUpdated(address indexed investor, InvestorStatus status);
    event AccreditationVerifierUpdated(address indexed newVerifier);

    constructor(address _accreditationVerifier) Ownable(msg.sender) {
        accreditationVerifier = _accreditationVerifier;
    }

    function setAccreditationVerifier(address newVerifier) external onlyOwner {
        require(newVerifier != address(0), "Invalid address");
        accreditationVerifier = newVerifier;
        emit AccreditationVerifierUpdated(newVerifier);
    }

    function verifyInvestor(address investor, string memory jurisdiction, string memory kycHash) external onlyOwner {
        require(investor != address(0), "Invalid address");
        investors[investor] = InvestorData(InvestorStatus.Verified, false, jurisdiction, kycHash, block.timestamp, 0);
        emit InvestorVerified(investor, jurisdiction);
        emit InvestorStatusUpdated(investor, InvestorStatus.Verified);
    }

    function accreditInvestor(address investor) external onlyOwner {
        require(investor != address(0), "Invalid address");
        require(investors[investor].status != InvestorStatus.Pending, "Investor not verified");
        investors[investor].isAccredited = true;
        investors[investor].status = InvestorStatus.Accredited;
        investors[investor].accreditedAt = block.timestamp;
        emit InvestorAccredited(investor);
        emit InvestorStatusUpdated(investor, InvestorStatus.Accredited);
    }

    function blockInvestor(address investor, string memory reason) external onlyOwner {
        require(investor != address(0), "Invalid address");
        investors[investor].status = InvestorStatus.Blocked;
        emit InvestorBlocked(investor, reason);
        emit InvestorStatusUpdated(investor, InvestorStatus.Blocked);
    }

    function suspendInvestor(address investor) external onlyOwner {
        require(investor != address(0), "Invalid address");
        investors[investor].status = InvestorStatus.Suspended;
        emit InvestorStatusUpdated(investor, InvestorStatus.Suspended);
    }

    function getInvestorStatus(address investor) external view returns (InvestorStatus, bool, string memory) {
        InvestorData storage data = investors[investor];
        return (data.status, data.isAccredited, data.jurisdiction);
    }

    function isVerified(address investor) external view returns (bool) {
        return investors[investor].status == InvestorStatus.Verified || investors[investor].status == InvestorStatus.Accredited;
    }

    function isAccredited(address investor) external view returns (bool) { return investors[investor].isAccredited; }
    function isBlocked(address investor) external view returns (bool) { return investors[investor].status == InvestorStatus.Blocked; }
}