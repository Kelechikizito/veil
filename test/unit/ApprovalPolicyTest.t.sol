// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";
import {VeilTestBase} from "../utils/VeilTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title ApprovalPolicyTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `ApprovalPolicy`.
 * @dev USDC amounts are in 6 decimals: 10_000e6 is 10,000 USDC.
 */
contract ApprovalPolicyTest is VeilTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    ApprovalPolicy internal policy;

    /// @notice A stream id used in approval tests
    uint256 internal constant STREAM_ID = 1;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the shared base and the policy
    function setUp() public override {
        super.setUp();
        policy = new ApprovalPolicy();
        vm.label(address(policy), "ApprovalPolicy");
    }

    /*//////////////////////////////////////////////////////////////
                               THRESHOLDS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. `setThreshold` stores the value per payer and token
    function test_setThreshold() public {
        vm.expectEmit(true, true, false, true, address(policy));
        emit IApprovalPolicy.ThresholdSet(employer, address(usdc), 10_000e6);
        _setThreshold(address(usdc), 10_000e6);

        assertTrue(policy.hasThreshold(employer, address(usdc)));
        assertFalse(policy.hasThreshold(employer, address(eurc)));
        assertEq(policy.thresholdOf(employer, address(usdc)), 10_000e6);
        assertEq(policy.thresholdOf(bob, address(usdc)), 0);
    }

    /// @notice 1b. A threshold for the zero token reverts
    function test_setThreshold_revertsOnZeroToken() public {
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__ZeroAddress.selector);
        policy.setThreshold(address(0), 1);
    }

    /*//////////////////////////////////////////////////////////////
                             NEEDS APPROVAL
    //////////////////////////////////////////////////////////////*/

    /// @notice 2. Above the threshold needs approval; at or below doesn't
    function test_needsApproval_comparesAgainstThreshold() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(usdc), 10_000e6);
        assertTrue(policy.needsApproval(employer, address(usdc), 12_000e6));
        assertFalse(policy.needsApproval(employer, address(usdc), 8_000e6));
        assertFalse(policy.needsApproval(employer, address(usdc), 10_000e6));
    }

    /// @notice 3. With no policy nothing needs approval, even with a threshold
    function test_needsApproval_noPolicyIsFalse() public {
        _setThreshold(address(usdc), 10_000e6);
        assertFalse(policy.needsApproval(employer, address(usdc), 50_000e6));
    }

    /// @notice 4. A policy but no threshold for the token fails closed
    function test_needsApproval_missingThresholdFailsClosed() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(usdc), 10_000e6);
        assertTrue(policy.needsApproval(employer, address(eurc), 1));
    }

    /// @notice 5. Thresholds are per token
    function test_needsApproval_thresholdsArePerToken() public {
        _setTwoOfTwoPolicy();
        _setThreshold(address(usdc), 10_000e6);
        _setThreshold(address(eurc), 2e6);
        assertFalse(policy.needsApproval(employer, address(eurc), 1e6));
        assertTrue(policy.needsApproval(employer, address(eurc), 3e6));
    }

    /*//////////////////////////////////////////////////////////////
                                APPROVALS
    //////////////////////////////////////////////////////////////*/

    /// @notice 7. Approvers approve once each; the count goes up; others can't approve
    function test_approve() public {
        _setTwoOfTwoPolicy();

        vm.prank(bob);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__NotApprover.selector);
        policy.approve(employer, STREAM_ID);

        vm.expectEmit(true, true, true, true, address(policy));
        emit IApprovalPolicy.Approved(employer, STREAM_ID, alice, 1);
        vm.prank(alice);
        policy.approve(employer, STREAM_ID);
        assertEq(policy.approvalCount(employer, STREAM_ID), 1);
        assertTrue(policy.hasApproved(employer, STREAM_ID, alice));

        vm.prank(alice);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__AlreadyApproved.selector);
        policy.approve(employer, STREAM_ID);

        vm.prank(employer);
        policy.approve(employer, STREAM_ID);
        assertEq(policy.approvalCount(employer, STREAM_ID), 2);
        assertEq(policy.approvalCount(employer, STREAM_ID + 1), 0);
    }

    /// @notice 7b. A new policy drops old approvers and their approvals
    function test_newPolicyResetsApprovals() public {
        _setTwoOfTwoPolicy();
        vm.prank(alice);
        policy.approve(employer, STREAM_ID);

        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = bob;
        vm.prank(employer);
        policy.setPolicy(approvers, 2);

        assertEq(policy.approvalCount(employer, STREAM_ID), 0);
        assertFalse(policy.isApprover(employer, alice));
        assertTrue(policy.isApprover(employer, bob));

        vm.prank(alice);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__NotApprover.selector);
        policy.approve(employer, STREAM_ID);
    }

    /*//////////////////////////////////////////////////////////////
                               SET POLICY
    //////////////////////////////////////////////////////////////*/

    /// @notice 8a. A valid policy is stored and readable
    function test_setPolicy() public {
        vm.expectEmit(true, false, false, true, address(policy));
        emit IApprovalPolicy.PolicySet(employer, 2, 2);
        _setTwoOfTwoPolicy();

        assertTrue(policy.hasPolicy(employer));
        assertFalse(policy.hasPolicy(bob));
        assertEq(policy.required(employer), 2);
        address[] memory approvers = policy.approversOf(employer);
        assertEq(approvers.length, 2);
        assertEq(approvers[0], employer);
        assertEq(approvers[1], alice);
    }

    /// @notice 8b. `required` must be at least 1 and at most the number of approvers
    function test_setPolicy_revertsOnBadRequired() public {
        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = alice;

        vm.startPrank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__InvalidRequired.selector);
        policy.setPolicy(approvers, 0);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__InvalidRequired.selector);
        policy.setPolicy(approvers, 3);
        vm.stopPrank();
    }

    /// @notice 8c. Zero and duplicate approvers revert
    function test_setPolicy_revertsOnBadApprovers() public {
        address[] memory approvers = new address[](2);

        approvers[0] = alice;
        approvers[1] = address(0);
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__ZeroAddress.selector);
        policy.setPolicy(approvers, 1);

        approvers[1] = alice;
        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__DuplicateApprover.selector);
        policy.setPolicy(approvers, 1);
    }

    /// @notice 8d. More than `MAX_APPROVERS` reverts
    function test_setPolicy_revertsOnTooManyApprovers() public {
        address[] memory approvers = new address[](policy.MAX_APPROVERS() + 1);
        for (uint256 i; i < approvers.length; ++i) {
            approvers[i] = address(uint160(i + 1));
        }

        vm.prank(employer);
        vm.expectRevert(ApprovalPolicy.ApprovalPolicy__TooManyApprovers.selector);
        policy.setPolicy(approvers, 1);
    }

    /*//////////////////////////////////////////////////////////////
                                 HELPERS
    //////////////////////////////////////////////////////////////*/

    /// @notice Gives the employer a 2-of-2 policy: employer and alice
    function _setTwoOfTwoPolicy() internal {
        address[] memory approvers = new address[](2);
        approvers[0] = employer;
        approvers[1] = alice;
        vm.prank(employer);
        policy.setPolicy(approvers, 2);
    }

    /// @notice Sets the employer's threshold for `token`
    /// @param token The token
    /// @param value Threshold in the token's units
    function _setThreshold(address token, uint256 value) internal {
        vm.prank(employer);
        policy.setThreshold(token, value);
    }
}
