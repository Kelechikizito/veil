// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {VeilPayroll} from "src/VeilPayroll.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilPayrollFuzzTest
 * @author Kelechi Kizito Ugwu
 * @notice Fuzzes payroll runs and `withdraw`: a payee is never paid more than streamed, a stream never
 *         streams more than its salary, the budget or the vault, and payroll stays solvent.
 * @dev Abstract: run by `VeilPayrollFuzzTest30Days` and `VeilPayrollFuzzTest600s` below.
 *      The stream is funded at the start of a period, so its allocation is min(salary, budget, vault).
 */
abstract contract VeilPayrollFuzzTest is PayrollTestBase {
    /// @notice What's available matches the allocation streamed so far; more than that can't be withdrawn;
    ///         payroll always holds every vault plus everything owed
    /// @param monthly Monthly salary
    /// @param budget Payroll budget for the period
    /// @param funded Amount in the vault
    /// @param dt Seconds since payroll ran, up to two periods
    /// @param req Amount requested
    function testFuzz_neverOverpays(uint256 monthly, uint256 budget, uint256 funded, uint32 dt, uint256 req) public {
        monthly = bound(monthly, 1, type(uint128).max);
        funded = bound(funded, 1, EMPLOYER_USDC);
        dt = uint32(bound(dt, 0, 2 * uint256(_period())));

        _fund(usdc, funded);
        uint256 id = _createFundedStreamWithBudget(monthly, budget);
        vm.warp(block.timestamp + dt);

        uint256 allocation = _min(_min(monthly, budget), funded);
        uint256 elapsed = dt < _period() ? dt : _period();
        uint256 streamed = allocation * elapsed / _period();
        assertEq(payroll.available(id), streamed);

        req = bound(req, 1, streamed + 1);
        if (req > streamed) {
            vm.prank(alice);
            vm.expectRevert(VeilPayroll.VeilPayroll__ExceedsAvailable.selector);
            payroll.withdraw(id, req);
        } else {
            _withdraw(id, req);
            assertEq(usdc.balanceOf(alice), req);
        }

        IVeilPayroll.Stream memory s = payroll.getStream(id);
        assertEq(s.allocated, allocation);
        assertEq(payroll.vaultOf(employer, usdc), funded - allocation);
        assertLe(usdc.balanceOf(alice), allocation);
        // Solvency: the contract holds the vault plus everything set aside and not yet paid out
        assertEq(
            usdc.balanceOf(address(payroll)), payroll.vaultOf(employer, usdc) + s.allocated + s.banked - s.withdrawn
        );
    }

    /// @notice Creates an Active stream at a period start and runs payroll for it with `budget`
    /// @param monthly Monthly salary
    /// @param budget Payroll budget
    /// @return id The stream id
    function _createFundedStreamWithBudget(uint256 monthly, uint256 budget) internal returns (uint256 id) {
        _warpToPeriodStart();
        id = _createStream(usdc, monthly);
        _runPayroll(usdc, budget, id);
    }

    /// @notice The smaller of two numbers
    /// @param a First number
    /// @param b Second number
    /// @return The minimum
    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

/// @notice Runs `VeilPayrollFuzzTest` with a 30-day period
contract VeilPayrollFuzzTest30Days is VeilPayrollFuzzTest {
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }
}

/// @notice Runs `VeilPayrollFuzzTest` with the 600s demo period
contract VeilPayrollFuzzTest600s is VeilPayrollFuzzTest {
    function _period() internal pure override returns (uint64) {
        return 600;
    }
}
