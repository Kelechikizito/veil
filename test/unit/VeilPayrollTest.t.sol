// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilPayrollTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `VeilPayroll`, run with a 30-day and a 600s period.
 * @dev Alice earns 3,000 USDC a month, 100 a "day" (a thirtieth of the period).
 */
abstract contract VeilPayrollTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Alice's monthly salary
    uint256 internal constant MONTHLY = 3000e6;

    /// @notice A thirtieth of her salary
    uint256 internal constant DAILY = MONTHLY / 30;

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A thirtieth of the period
    /// @return Seconds
    function _day() internal pure returns (uint64) {
        return _period() / 30;
    }

    /*//////////////////////////////////////////////////////////////
                             ORGS & TOKENS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. An org is created once
    function test_createOrg() public {
        IVeilPayroll.Org memory org = payroll.orgOf(employer);
        assertTrue(org.exists);
        assertEq(org.name, "Acme");

        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__OrgExists.selector);
        payroll.createOrg("Acme again");
    }

    /// @notice 2. Only an org can create streams
    function test_createStream_revertsWithoutOrg() public {
        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NoOrg.selector);
        payroll.createStream(alice, usdc, MONTHLY);
    }

    /// @notice 3. Only the owner manages the allowlist
    function test_tokenAllowlist_ownerOnly() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        payroll.addToken(eurc);

        vm.expectRevert(VeilPayroll.VeilPayroll__TokenAlreadySupported.selector);
        payroll.addToken(usdc);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAddress.selector);
        payroll.addToken(IERC20(address(0)));
        vm.expectRevert(VeilPayroll.VeilPayroll__UnsupportedToken.selector);
        payroll.removeToken(eurc);
    }

    /// @notice 4. Unsupported tokens can't be funded or streamed
    function test_unsupportedToken_reverts() public {
        vm.startPrank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__UnsupportedToken.selector);
        payroll.fundVault(eurc, 1e6);
        vm.expectRevert(VeilPayroll.VeilPayroll__UnsupportedToken.selector);
        payroll.createStream(alice, eurc, MONTHLY);
        vm.stopPrank();
    }

    /// @notice 5. Removing a token stops new streams but existing ones keep withdrawing
    function test_removeToken_existingStreamsStillWithdraw() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);
        payroll.removeToken(usdc);

        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__UnsupportedToken.selector);
        payroll.createStream(alice, usdc, MONTHLY);

        vm.warp(block.timestamp + 10 * _day());
        _withdraw(id, 10 * DAILY);
        assertEq(usdc.balanceOf(alice), 10 * DAILY);
    }

    /*//////////////////////////////////////////////////////////////
                                 VAULTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 6. Funding pulls tokens into the payer's vault; defunding sends unallocated money back
    function test_fundAndDefundVault() public {
        vm.expectEmit(true, true, false, true, address(payroll));
        emit IVeilPayroll.VaultFunded(employer, usdc, 4000e6);
        _fund(usdc, 4000e6);
        assertEq(payroll.vaultOf(employer, usdc), 4000e6);
        assertEq(usdc.balanceOf(address(payroll)), 4000e6);

        vm.prank(employer);
        payroll.defundVault(usdc, 1000e6);
        assertEq(payroll.vaultOf(employer, usdc), 3000e6);
        assertEq(usdc.balanceOf(employer), EMPLOYER_USDC - 3000e6);

        vm.startPrank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__ExceedsVault.selector);
        payroll.defundVault(usdc, 3000e6 + 1);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAmount.selector);
        payroll.fundVault(usdc, 0);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAmount.selector);
        payroll.defundVault(usdc, 0);
        vm.stopPrank();
    }

    /// @notice 7. Allocated money can't be defunded
    function test_defund_cantTakeAllocatedMoney() public {
        _createFundedStream(usdc, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), 0);
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__ExceedsVault.selector);
        payroll.defundVault(usdc, 1);
    }

    /*//////////////////////////////////////////////////////////////
                                STREAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice 8. With no policy a stream starts Active right away
    function test_createStream() public {
        vm.expectEmit(true, true, true, true, address(payroll));
        emit IVeilPayroll.StreamCreated(1, employer, alice, usdc, MONTHLY);
        uint256 id = _createStream(usdc, MONTHLY);

        IVeilPayroll.Stream memory s = payroll.getStream(id);
        assertEq(s.payer, employer);
        assertEq(s.payee, alice);
        assertEq(address(s.token), address(usdc));
        assertEq(s.monthly, MONTHLY);
        assertEq(uint8(s.status), uint8(IVeilPayroll.Status.Active));
        assertEq(s.startTime, block.timestamp);
        assertEq(payroll.streamsOfPayer(employer)[0], id);
        assertEq(payroll.streamsOfPayee(alice)[0], id);
    }

    /// @notice 9. A zero payee or zero salary reverts
    function test_createStream_revertsOnZero() public {
        vm.startPrank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAddress.selector);
        payroll.createStream(address(0), usdc, MONTHLY);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAmount.selector);
        payroll.createStream(alice, usdc, 0);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                                WITHDRAW
    //////////////////////////////////////////////////////////////*/

    /// @notice 10. Pay streams linearly through the period
    function test_withdraw_streamed() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);

        vm.warp(block.timestamp + 10 * _day());
        assertEq(payroll.available(id), 10 * DAILY);
        vm.expectEmit(true, true, false, true, address(payroll));
        emit IVeilPayroll.Withdrawn(id, alice, 4 * DAILY);
        _withdraw(id, 4 * DAILY);
        assertEq(usdc.balanceOf(alice), 4 * DAILY);
        assertEq(payroll.available(id), 6 * DAILY);
        assertEq(payroll.getStream(id).withdrawn, 4 * DAILY);
    }

    /// @notice 11. An 18-decimal token streams to the wei with no truncation surprises
    function test_withdraw_eighteenDecimals() public {
        uint256 monthly = 1.5 ether;
        _mint(weth, monthly);
        uint256 id = _createFundedStream(weth, monthly);

        vm.warp(block.timestamp + _period() / 3);
        uint256 avail = payroll.available(id);
        assertEq(avail, monthly * (_period() / 3) / _period());
        _withdraw(id, avail);
        assertEq(weth.balanceOf(alice), avail);
    }

    /// @notice 12. Withdrawing more than has streamed reverts
    function test_withdraw_revertsOverAvailable() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);
        vm.warp(block.timestamp + 10 * _day());

        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__ExceedsAvailable.selector);
        payroll.withdraw(id, 10 * DAILY + 1);

        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAmount.selector);
        payroll.withdraw(id, 0);
    }

    /// @notice 13. Only the payee withdraws, and only from a real stream
    function test_withdraw_revertsForNonPayeeOrUnknownStream() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);
        vm.warp(block.timestamp + 10 * _day());

        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayee.selector);
        payroll.withdraw(id, 1);

        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayee.selector);
        payroll.withdraw(999, 1);
        assertEq(payroll.available(999), 0);
    }

    /// @notice 14. Streaming stops at the allocation: an underfunded period pays only what was set aside
    function test_streaming_stopsAtAllocation() public {
        _warpToPeriodStart();
        _fund(usdc, 1000e6);
        uint256 id = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, MONTHLY, id); // budget capped at the 1,000 in the vault

        assertEq(payroll.getStream(id).allocated, 1000e6);
        vm.warp(block.timestamp + 2 * _period());
        assertEq(payroll.available(id), 1000e6);
    }

    /*//////////////////////////////////////////////////////////////
                              RUN PAYROLL
    //////////////////////////////////////////////////////////////*/

    /// @notice 15. The budget is shared in order: 4,000 across two 3,000 streams gives 3,000 and 1,000
    function test_runPayroll_sharesBudgetInOrder() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 first = _createStream(usdc, MONTHLY);
        uint256 second = _createStream(usdc, MONTHLY);
        uint256[] memory ids = new uint256[](2);
        ids[0] = first;
        ids[1] = second;

        vm.expectEmit(true, true, false, true, address(payroll));
        emit IVeilPayroll.PayrollRun(employer, usdc, uint64(block.timestamp + _period()), 2, 4000e6);
        _runPayroll(usdc, 4000e6, ids);

        assertEq(payroll.getStream(first).allocated, MONTHLY);
        assertEq(payroll.getStream(second).allocated, 1000e6);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - 4000e6);
    }

    /// @notice 16. The budget is capped at the vault
    function test_runPayroll_budgetCappedAtVault() public {
        _warpToPeriodStart();
        _fund(usdc, 2000e6);
        uint256 id = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, type(uint256).max, id);
        assertEq(payroll.getStream(id).allocated, 2000e6);
        assertEq(payroll.vaultOf(employer, usdc), 0);
    }

    /// @notice 17. Vaults are per token
    function test_runPayroll_vaultsArePerToken() public {
        _warpToPeriodStart();
        _fund(usdc, MONTHLY);
        _mint(weth, 1 ether);
        _fund(weth, 1 ether);
        uint256 id = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, MONTHLY, id);
        assertEq(payroll.vaultOf(employer, usdc), 0);
        assertEq(payroll.vaultOf(employer, weth), 1 ether);
    }

    /// @notice 18. Next period: the last allocation is banked and stays withdrawable alongside the new one
    function test_runPayroll_nextPeriodBanksUnclaimed() public {
        _fund(usdc, EMPLOYER_USDC - MONTHLY);
        uint256 id = _createFundedStream(usdc, MONTHLY);

        vm.warp(block.timestamp + _period()); // next period starts
        _runPayroll(usdc, MONTHLY, id);
        assertEq(payroll.getStream(id).banked, MONTHLY);
        assertEq(payroll.getStream(id).allocated, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - 2 * MONTHLY);

        vm.warp(block.timestamp + 15 * _day());
        _withdraw(id, MONTHLY + 15 * DAILY);
        assertEq(usdc.balanceOf(alice), MONTHLY + 15 * DAILY);
    }

    /// @notice 19. Funded mid-period: the salary is pro rata for the time left, streamed by the period's end
    function test_runPayroll_midPeriodIsProRata() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        vm.warp(block.timestamp + 15 * _day());
        uint256 id = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, MONTHLY, id);

        assertEq(payroll.getStream(id).allocated, 15 * DAILY);

        vm.warp(block.timestamp + 5 * _day());
        _withdraw(id, 5 * DAILY);
        assertEq(usdc.balanceOf(alice), 5 * DAILY);
    }

    /// @notice 20. Unused budget stays in the vault
    function test_runPayroll_unusedBudgetStaysInVault() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, 5000e6, id);

        assertEq(payroll.getStream(id).allocated, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - MONTHLY);
    }

    /// @notice 21. Funding a stream twice in one period reverts; a stream started later can still be funded
    function test_runPayroll_revertsWhenAlreadyFunded() public {
        _fund(usdc, EMPLOYER_USDC - MONTHLY);
        uint256 first = _createFundedStream(usdc, MONTHLY);

        uint256[] memory ids = new uint256[](1);
        ids[0] = first;
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__AlreadyFunded.selector);
        payroll.runPayroll(usdc, MONTHLY, ids);

        uint256 second = _createStream(usdc, MONTHLY);
        _runPayroll(usdc, MONTHLY, second);
        assertEq(payroll.getStream(second).allocated, MONTHLY);
    }

    /// @notice 22. Only the payer's own Active streams in the given token can be funded
    function test_runPayroll_reverts() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 active = _createStream(usdc, MONTHLY);
        uint256 cancelled = _createStream(usdc, MONTHLY);
        vm.prank(employer);
        payroll.cancelStream(cancelled);
        uint256[] memory ids = new uint256[](1);

        ids[0] = cancelled;
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotActive.selector);
        payroll.runPayroll(usdc, MONTHLY, ids);

        ids[0] = active;
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__WrongToken.selector);
        payroll.runPayroll(weth, MONTHLY, ids);

        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NoOrg.selector);
        payroll.runPayroll(usdc, MONTHLY, ids);

        vm.prank(bob);
        payroll.createOrg("Bob Ltd");
        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayer.selector);
        payroll.runPayroll(usdc, MONTHLY, ids);
    }

    /*//////////////////////////////////////////////////////////////
                                 CANCEL
    //////////////////////////////////////////////////////////////*/

    /// @notice 23. Cancelling banks what streamed and returns the rest of the allocation to the vault
    function test_cancel_refundsUnstreamed() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);
        vm.warp(block.timestamp + 10 * _day());

        vm.prank(employer);
        payroll.cancelStream(id);

        IVeilPayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IVeilPayroll.Status.Cancelled));
        assertEq(s.banked, 10 * DAILY);
        assertEq(s.allocated, 0);
        assertEq(s.endTime, block.timestamp);
        assertEq(payroll.vaultOf(employer, usdc), 20 * DAILY);

        // What streamed stays withdrawable, and nothing more accrues
        vm.warp(block.timestamp + _period());
        assertEq(payroll.available(id), 10 * DAILY);
        _withdraw(id, 10 * DAILY);
        assertEq(usdc.balanceOf(alice), 10 * DAILY);
    }

    /// @notice 24. Cancelling after the period ended banks the whole allocation
    function test_cancel_afterPeriodBanksAll() public {
        uint256 id = _createFundedStream(usdc, MONTHLY);
        vm.warp(block.timestamp + _period() + 1);
        vm.prank(employer);
        payroll.cancelStream(id);
        assertEq(payroll.getStream(id).banked, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), 0);
    }

    /// @notice 25. Only the payer cancels, once
    function test_cancel_reverts() public {
        uint256 id = _createStream(usdc, MONTHLY);
        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayer.selector);
        payroll.cancelStream(id);

        vm.prank(employer);
        payroll.cancelStream(id);
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotCancellable.selector);
        payroll.cancelStream(id);
    }

    /*//////////////////////////////////////////////////////////////
                                PERIODS
    //////////////////////////////////////////////////////////////*/

    /// @notice 26. Periods are fixed windows from time 0
    function test_periodEnd() public view {
        uint64 p = _period();
        assertEq(payroll.periodEnd(0), p);
        assertEq(payroll.periodEnd(p - 1), p);
        assertEq(payroll.periodEnd(p), 2 * p);
    }

    /// @notice 27. Constructor checks
    function test_constructor_reverts() public {
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAddress.selector);
        new VeilPayroll(address(0), _period());
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroPeriod.selector);
        new VeilPayroll(address(policy), 0);
    }

    /*//////////////////////////////////////////////////////////////
                               OPERATORS
    //////////////////////////////////////////////////////////////*/

    /// @notice 28. An allowed operator runs payroll for the payer, from the payer's vault
    function test_runPayrollFor_byOperator() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createStream(usdc, MONTHLY);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        vm.expectEmit(true, true, false, true, address(payroll));
        emit IVeilPayroll.PayrollOperatorSet(employer, bob, true);
        vm.prank(employer);
        payroll.setPayrollOperator(bob, true);
        assertTrue(payroll.isPayrollOperator(employer, bob));

        vm.expectEmit(true, true, false, true, address(payroll));
        emit IVeilPayroll.PayrollRun(employer, usdc, uint64(block.timestamp + _period()), 1, MONTHLY);
        vm.prank(bob);
        payroll.runPayrollFor(employer, usdc, MONTHLY, ids);

        assertEq(payroll.getStream(id).allocated, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - MONTHLY);
    }

    /// @notice 29. The payer can call it too; anyone else, or a revoked operator, can't
    function test_runPayrollFor_reverts() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256[] memory ids = new uint256[](1);
        ids[0] = _createStream(usdc, MONTHLY);

        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotOperator.selector);
        payroll.runPayrollFor(employer, usdc, MONTHLY, ids);

        vm.prank(employer);
        payroll.setPayrollOperator(bob, true);
        vm.prank(employer);
        payroll.setPayrollOperator(bob, false);
        assertFalse(payroll.isPayrollOperator(employer, bob));
        vm.prank(bob);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotOperator.selector);
        payroll.runPayrollFor(employer, usdc, MONTHLY, ids);

        vm.prank(employer);
        payroll.runPayrollFor(employer, usdc, MONTHLY, ids);
        assertEq(payroll.getStream(ids[0]).allocated, MONTHLY);
    }

    /// @notice 30. An operator only reaches the payer that allowed it, and can't be the zero address
    function test_setPayrollOperator_scope() public {
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAddress.selector);
        payroll.setPayrollOperator(address(0), true);

        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256[] memory ids = new uint256[](1);
        ids[0] = _createStream(usdc, MONTHLY);

        // Bob lets Alice run his payroll; that gives her nothing over the employer's
        vm.prank(bob);
        payroll.setPayrollOperator(alice, true);
        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotOperator.selector);
        payroll.runPayrollFor(employer, usdc, MONTHLY, ids);

        // Even through Bob, his operator can only fund Bob's own streams
        vm.prank(bob);
        payroll.createOrg("Bob Ltd");
        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayer.selector);
        payroll.runPayrollFor(bob, usdc, MONTHLY, ids);
    }
}

/// @notice The suite with a real 30-day month
contract VeilPayrollTest30Days is VeilPayrollTest {
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }
}

/// @notice The suite with the 10-minute demo month
contract VeilPayrollTest600s is VeilPayrollTest {
    function _period() internal pure override returns (uint64) {
        return 600;
    }
}
