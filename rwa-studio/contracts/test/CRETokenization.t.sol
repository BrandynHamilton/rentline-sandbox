// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/cre/SecurityToken.sol";
import "../src/cre/InvestorRegistry.sol";

contract CRETokenizationTest is Test {
    SecurityToken public securityToken;
    InvestorRegistry public investorRegistry;
    address public owner = address(0x1);
    address public complianceManager = address(0x2);
    address public investor1 = address(0x3);
    address public investor2 = address(0x4);

    function setUp() public {
        investorRegistry = new InvestorRegistry(address(0));
        securityToken = new SecurityToken("Security Token", "CRE", complianceManager, address(this), address(0x5), "https://example.com/metadata.json");

        vm.startPrank(complianceManager);
        securityToken.approveInvestor(investor1, true, false, 0);
        securityToken.approveInvestor(investor2, false, false, 0);
        vm.stopPrank();
    }

    function testConstructor() public {
        assertEq(securityToken.name(), "Security Token");
        assertEq(securityToken.symbol(), "CRE");
        assertEq(securityToken.owner(), address(this));
    }

    function testInvestorApproval() public {
        assertTrue(securityToken.isApproved(investor1));
        assertTrue(securityToken.isAccredited(investor1));
        assertFalse(securityToken.isApproved(address(0x99)));
    }

    function testTransferBlockedBeforeEnable() public {
        vm.prank(investor1);
        bool success = securityToken.transfer(investor2, 100);
        assertFalse(success);
    }

    function testTransferAfterEnable() public {
        vm.prank(owner);
        securityToken.setTransferEnabled(true);

        vm.prank(complianceManager);
        securityToken.approveInvestor(address(0x5), false, false, 0);

        vm.prank(investor1);
        bool success = securityToken.transfer(address(0x5), 100);
        assertFalse(success, "Should fail due to insufficient balance");
    }

    function testOnlyComplianceManager() public {
        vm.expectRevert("Not compliance manager");
        vm.prank(address(0x99));
        securityToken.approveInvestor(address(0x5), true, false, 0);
    }

    function testOnlyOwnerCanEnableTransfers() public {
        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(address(0x99));
        securityToken.setTransferEnabled(true);
    }
}