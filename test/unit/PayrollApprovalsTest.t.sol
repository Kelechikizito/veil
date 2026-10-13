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
 * @title PayrollApprovalsTest
 * @author Kelechi Kizito Ugwu
 * @notice Payroll and the approval policy together: salaries above the threshold wait for k approvals.
 * @dev Acme's policy: bob and carol approve, 2 of 2, threshold 10,000 USDC a month.
 */
contract PayrollApprovalsTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Second approver
    address internal carol = makeAddr("carol");

    /// @notice Acme's threshold
    uint256 internal constant THRESHOLD = 10_000e6;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets Acme's 2-of-2 policy and its USDC threshold
    function setUp() public override {
        super.setUp();
        address[] memory approvers = new address[](2);
        approvers[0] = bob;
        approvers[1] = carol;
        vm.startPrank(employer);
        policy.setPolicy(approvers, 2);
        policy.setThreshold(address(usdc), THRESHOLD);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 600;
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. A salary at or under the threshold starts Active
    function test_underThreshold_activates() public {
        uint256 id = _createStream(usdc, THRESHOLD);
        assertEq(uint8(payroll.getStream(id).status), uint8(IVeilPayroll.Status.Active));
    }

    /// @notice 2. A salary above the threshold waits for 2 approvals, then anyone activates it
    function test_overThreshold_needsApprovals() public {
        vm.expectEmit(true, false, false, false, address(payroll));
        emit IVeilPayroll.StreamPending(1);
        uint256 id = _createStream(usdc, THRESHOLD + 1);
        assertEq(uint8(payroll.getStream(id).status), uint8(IVeilPayroll.Status.Pending));

        vm.prank(bob);
        policy.approve(employer, id);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotEnoughApprovals.selector);
        payroll.activateApproved(id);

        vm.prank(carol);
        policy.approve(employer, id);
        payroll.activateApproved(id);
        IVeilPayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IVeilPayroll.Status.Active));
        assertEq(s.startTime, block.timestamp);

        vm.expectRevert(VeilPayroll.VeilPayroll__NotPending.selector);
        payroll.activateApproved(id);
    }

    /// @notice 3. A pending stream can't be funded or withdrawn from
    function test_noAccrualWhilePending() public {
        _fund(usdc, EMPLOYER_USDC);
        uint256 id = _createStream(usdc, THRESHOLD + 1);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;

        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotActive.selector);
        payroll.runPayroll(usdc, EMPLOYER_USDC, ids);

        vm.prank(alice);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotWithdrawable.selector);
        payroll.withdraw(id, 1);
        assertEq(payroll.available(id), 0);
    }

    /// @notice 4. A pending stream can be cancelled, and ends at time 0
    function test_cancelPending() public {
        uint256 id = _createStream(usdc, THRESHOLD + 1);
        vm.prank(employer);
        payroll.cancelStream(id);
        IVeilPayroll.Stream memory s = payroll.getStream(id);
        assertEq(uint8(s.status), uint8(IVeilPayroll.Status.Cancelled));
        assertEq(s.endTime, 0);
    }

    /// @notice 5. A token with no threshold always needs approval (fail closed)
    function test_missingThresholdFailsClosed() public {
        _mint(weth, 1);
        uint256 id;
        vm.prank(employer);
        id = payroll.createStream(alice, weth, 1);
        assertEq(uint8(payroll.getStream(id).status), uint8(IVeilPayroll.Status.Pending));
    }
}
