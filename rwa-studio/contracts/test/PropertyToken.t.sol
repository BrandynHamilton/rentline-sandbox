// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PropertyToken.sol";

contract PropertyTokenTest is Test {
    PropertyToken public propertyToken;
    address public propertyOwner = address(0x2);
    address public usdcAddress = address(0x3);
    address public tokenHolder1 = address(0x4);

    function setUp() public {
        vm.warp(1000000);
        propertyToken = new PropertyToken("Test Property", "123 Main St", propertyOwner, usdcAddress, "https://example.com/property.json");
    }

    function testConstructor() public {
        assertEq(propertyToken.owner(), address(this));
        assertEq(propertyToken.name(), "Test Property");
        assertEq(propertyToken.symbol(), "RE-PROP");
        assertEq(propertyToken.propertyOwner(), propertyOwner);
        assertEq(propertyToken.vaultAddress(), address(propertyToken));
    }

    function testOwnershipPercent() public {
        assertEq(propertyToken.getOwnershipPercent(tokenHolder1), 0);
    }

    function testOnlyOwnerCanUpdatePropertyInfo() public {
        vm.expectRevert("Ownable: caller is not the owner");
        vm.prank(address(0x99));
        propertyToken.updatePropertyInfo("New Name", "New Address");
    }

    function testUpdatePropertyInfo() public {
        propertyToken.updatePropertyInfo("New Name", "New Address");
        assertEq(propertyToken.propertyName(), "New Name");
        assertEq(propertyToken.propertyAddress(), "New Address");
    }

    function testTotalDistributedStartsZero() public {
        assertEq(propertyToken.getTotalDistributed(), 0);
        assertEq(propertyToken.totalDistributed(), 0);
    }

    function testVaultBalanceStartsZero() public {
        assertEq(propertyToken.getVaultBalance(), 0);
    }
}
