// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {EmployeeRegistry} from "src/EmployeeRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";
import {IIncomeCredential} from "src/interfaces/IIncomeCredential.sol";
import {WebAuthn} from "src/libraries/WebAuthn.sol";
import {Passkeys} from "../utils/Passkeys.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title IncomeCredentialTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `IncomeCredential`, with the 600s demo period.
 * @dev Alice is paid 3,000 USDC/month by the employer. `verifier` is a landlord asking about her income.
 */
contract IncomeCredentialTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    IncomeCredential internal credential;

    /// @notice Employee registry the credential reads
    EmployeeRegistry internal employeeRegistry;

    /// @notice Alice's passkey
    uint256 internal constant ALICE_PASSKEY = 0xA11CE;

    /// @notice The address alice issues credentials to
    address internal verifier;

    /// @notice Alice's monthly salary
    uint256 internal constant MONTHLY = 3000e6;

    /// @notice Alice's stream
    uint256 internal streamId;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the employee registry and the credential, wires it into payroll, and starts alice's stream
    function setUp() public override {
        super.setUp();
        verifier = makeAddr("verifier");

        employeeRegistry = new EmployeeRegistry();
        credential = new IncomeCredential(address(payroll), address(employeeRegistry));
        vm.label(address(employeeRegistry), "EmployeeRegistry");
        vm.label(address(credential), "IncomeCredential");

        streamId = _createStream(usdc, MONTHLY);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 600;
    }

    /// @notice Alice issues a credential on `id` to `verifier`, valid for 1 hour
    /// @param id The stream
    /// @param threshold The monthly amount asked about
    /// @return The credential id
    function _issue(uint256 id, uint256 threshold) internal returns (uint256) {
        vm.prank(alice);
        return credential.issue(id, verifier, threshold, uint64(block.timestamp + 1 hours));
    }

    /// @notice Returns a credential's result
    /// @param id The credential
    /// @return The result
    function _ok(uint256 id) internal view returns (bool) {
        return credential.get(id).ok;
    }

    /// @notice Alice confirms `employer` with her passkey
    /// @param employer The employer
    function _confirmAlice(address employer) internal {
        // Build the assertion before the prank: its sha256 calls would use the prank up
        WebAuthn.Assertion memory assertion =
            Passkeys.sign(ALICE_PASSKEY, employeeRegistry.challengeOf(alice, employer));
        vm.prank(alice);
        employeeRegistry.confirm(employer, Passkeys.publicKey(ALICE_PASSKEY), assertion);
    }

    /*//////////////////////////////////////////////////////////////
                                 RESULT
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. 3,000/month passes 2,500 and exactly 3,000, fails 4,000
    function test_issue_comparesMonthly() public {
        assertTrue(_ok(_issue(streamId, 2500e6)));
        assertFalse(_ok(_issue(streamId, 4000e6)));
        assertTrue(_ok(_issue(streamId, MONTHLY))); // no rounding: compares stored monthly
    }

    /// @notice 2. 1 WETH/month passes 0.5 WETH; the credential stores token = WETH
    function test_issue_otherToken() public {
        uint256 ethStream = _createStream(weth, 1 ether);
        uint256 id = _issue(ethStream, 0.5 ether);

        assertTrue(_ok(id));
        assertEq(credential.get(id).token, address(weth));
    }

    /// @notice 2b. `issue` stores the stream's details and emits the event without the result
    function test_issue_storesDetails() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);
        vm.expectEmit(true, true, true, true, address(credential));
        emit IIncomeCredential.CredentialIssued(1, alice, verifier, address(usdc), 2500e6, expiresAt);
        vm.prank(alice);
        uint256 id = credential.issue(streamId, verifier, 2500e6, expiresAt);

        IIncomeCredential.Credential memory c = credential.get(id);
        assertEq(c.payee, alice);
        assertEq(c.payer, employer);
        assertEq(c.verifier, verifier);
        assertEq(c.streamId, streamId);
        assertEq(c.threshold, 2500e6);
        assertEq(c.issuedAt, block.timestamp);
        assertEq(c.expiresAt, expiresAt);
        assertEq(c.streamActiveSince, payroll.getStream(streamId).startTime);
        assertFalse(c.revoked);

        assertEq(credential.credentialsOf(alice)[0], id);
        assertEq(credential.credentialsFor(verifier)[0], id);
    }

    /*//////////////////////////////////////////////////////////////
                              ISSUE CHECKS
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. Non-payee, bad expiry and zero verifier revert
    function test_issue_reverts() public {
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        vm.prank(bob);
        vm.expectRevert(IncomeCredential.IncomeCredential__NotPayee.selector);
        credential.issue(streamId, verifier, 1, expiresAt);

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__BadExpiry.selector);
        credential.issue(streamId, verifier, 1, uint64(block.timestamp));

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__ZeroAddress.selector);
        credential.issue(streamId, address(0), 1, expiresAt);
    }

    /// @notice 4b. Issuing on a Pending or Cancelled stream reverts
    function test_issue_revertsOnInactiveStream() public {
        address[] memory approvers = new address[](1);
        approvers[0] = bob;
        vm.prank(employer);
        policy.setPolicy(approvers, 1);
        vm.prank(employer);
        policy.setThreshold(address(usdc), 1000e6);

        uint256 pending = _createStream(usdc, MONTHLY);
        assertEq(uint8(payroll.getStream(pending).status), uint8(IVeilPayroll.Status.Pending));

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__StreamNotActive.selector);
        credential.issue(pending, verifier, 1, uint64(block.timestamp + 1 hours));

        vm.prank(employer);
        payroll.cancelStream(streamId);
        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__StreamNotActive.selector);
        credential.issue(streamId, verifier, 1, uint64(block.timestamp + 1 hours));
    }

    /*//////////////////////////////////////////////////////////////
                         VALIDITY AND REVOKING
    //////////////////////////////////////////////////////////////*/

    /// @notice 5. Valid before expiry, invalid at expiry
    function test_isValid_expires() public {
        uint256 id = _issue(streamId, 2500e6);
        assertTrue(credential.isValid(id));

        vm.warp(credential.get(id).expiresAt - 1);
        assertTrue(credential.isValid(id));

        vm.warp(credential.get(id).expiresAt);
        assertFalse(credential.isValid(id));
    }

    /// @notice 6. Revoking makes it invalid; only the payee can revoke, once
    function test_revoke() public {
        uint256 id = _issue(streamId, 2500e6);

        vm.prank(bob);
        vm.expectRevert(IncomeCredential.IncomeCredential__NotPayee.selector);
        credential.revoke(id);

        vm.expectEmit(true, false, false, false, address(credential));
        emit IIncomeCredential.CredentialRevoked(id);
        vm.prank(alice);
        credential.revoke(id);
        assertFalse(credential.isValid(id));
        assertTrue(credential.get(id).revoked);

        vm.prank(alice);
        vm.expectRevert(IncomeCredential.IncomeCredential__AlreadyRevoked.selector);
        credential.revoke(id);
    }

    /// @notice 7. Cancelling the stream after issuance makes the credential invalid
    /// @dev Our choice: the claim is "earns >= X", which stops being true once the stream ends
    function test_isValid_falseAfterStreamCancelled() public {
        uint256 id = _issue(streamId, 2500e6);

        vm.prank(employer);
        payroll.cancelStream(streamId);
        assertFalse(credential.isValid(id));
    }

    /// @notice 7b. An id that was never issued is not valid
    function test_isValid_unknownId() public view {
        assertFalse(credential.isValid(99));
    }

    /// @notice 8. Demo timing: a 2-minute credential expires after 2 minutes
    function test_demoTiming() public {
        vm.prank(alice);
        uint256 id = credential.issue(streamId, verifier, 2500e6, uint64(block.timestamp + 2 minutes));
        assertTrue(credential.isValid(id));

        vm.warp(block.timestamp + 2 minutes + 1);
        assertFalse(credential.isValid(id));
    }

    /*//////////////////////////////////////////////////////////////
                           VERIFIED EMPLOYEE
    //////////////////////////////////////////////////////////////*/

    /// @notice 9. `employeeVerified` needs the stream's payer to vouch and alice to confirm, read at issue time
    function test_issue_employeeVerified() public {
        uint256 before = _issue(streamId, 2500e6);
        assertFalse(credential.get(before).employeeVerified);

        // A vouch from someone who doesn't pay alice doesn't count
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        employeeRegistry.vouch(alice);
        _confirmAlice(stranger);
        assertFalse(credential.get(_issue(streamId, 2500e6)).employeeVerified);

        vm.prank(employer);
        employeeRegistry.vouch(alice);
        assertFalse(credential.get(_issue(streamId, 2500e6)).employeeVerified);

        _confirmAlice(employer);
        uint256 verified = _issue(streamId, 2500e6);
        assertTrue(credential.get(verified).employeeVerified);
        assertFalse(credential.get(before).employeeVerified); // stored at issue time
    }
}
