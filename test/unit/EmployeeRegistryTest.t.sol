// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {EmployeeRegistry} from "src/EmployeeRegistry.sol";
import {IEmployeeRegistry} from "src/interfaces/IEmployeeRegistry.sol";
import {WebAuthn} from "src/libraries/WebAuthn.sol";
import {Passkeys} from "../utils/Passkeys.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title EmployeeRegistryTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `EmployeeRegistry` and the `WebAuthn` checks behind `confirm`. No FHE.
 * @dev Passkey signatures are real P256 signatures from Forge's cheatcodes, verified by the precompile.
 */
contract EmployeeRegistryTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    EmployeeRegistry internal registry;

    /// @notice A worker
    address internal alice = makeAddr("alice");

    /// @notice Another worker
    address internal bob = makeAddr("bob");

    /// @notice Alice's employer
    address internal acme = makeAddr("acme");

    /// @notice Another employer
    address internal globex = makeAddr("globex");

    /// @notice Alice's passkey
    uint256 internal constant ALICE_PASSKEY = 0xA11CE;

    /// @notice Alice's passkey on a new phone
    uint256 internal constant ALICE_NEW_PASSKEY = 0xA11CE2;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the registry
    function setUp() public {
        registry = new EmployeeRegistry();
        vm.label(address(registry), "EmployeeRegistry");
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Alice confirms `employer` with the given passkey
    /// @param pkey The passkey's private key
    /// @param employer The employer
    function _confirm(uint256 pkey, address employer) internal {
        WebAuthn.Assertion memory a = Passkeys.sign(pkey, registry.challengeOf(alice, employer));
        vm.prank(alice);
        registry.confirm(employer, Passkeys.publicKey(pkey), a);
    }

    /// @notice Alice submits `a` with her passkey's public key and expects a bad-signature revert
    /// @param employer The employer
    /// @param a The assertion
    function _expectBadConfirm(address employer, WebAuthn.Assertion memory a) internal {
        IEmployeeRegistry.Passkey memory key = Passkeys.publicKey(ALICE_PASSKEY);
        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__BadPasskeySignature.selector);
        vm.prank(alice);
        registry.confirm(employer, key, a);
    }

    /*//////////////////////////////////////////////////////////////
                              VOUCH & CONFIRM
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. Verified only once both sides agree, in either order
    function test_verifiedNeedsBothSides() public {
        vm.expectEmit(true, true, false, false, address(registry));
        emit IEmployeeRegistry.Vouched(acme, alice);
        vm.prank(acme);
        registry.vouch(alice);
        assertTrue(registry.isVouched(alice, acme));
        assertFalse(registry.isVerified(alice, acme));

        vm.expectEmit(true, true, false, false, address(registry));
        emit IEmployeeRegistry.Confirmed(alice, acme);
        _confirm(ALICE_PASSKEY, acme);
        assertTrue(registry.isConfirmed(alice, acme));
        assertTrue(registry.isVerified(alice, acme));

        // Confirm first, vouch second
        _confirm(ALICE_PASSKEY, globex);
        assertFalse(registry.isVerified(alice, globex));
        vm.prank(globex);
        registry.vouch(alice);
        assertTrue(registry.isVerified(alice, globex));
    }

    /// @notice 2. Confirming stores the passkey; a new device replaces it and keeps old confirmations
    function test_confirm_storesAndReplacesPasskey() public {
        _confirm(ALICE_PASSKEY, acme);
        IEmployeeRegistry.Passkey memory stored = registry.passkeyOf(alice);
        IEmployeeRegistry.Passkey memory expected = Passkeys.publicKey(ALICE_PASSKEY);
        assertEq(stored.x, expected.x);
        assertEq(stored.y, expected.y);

        _confirm(ALICE_NEW_PASSKEY, globex);
        assertEq(registry.passkeyOf(alice).x, Passkeys.publicKey(ALICE_NEW_PASSKEY).x);
        assertTrue(registry.isConfirmed(alice, acme));
        assertEq(registry.passkeyOf(bob).x, bytes32(0));
    }

    /// @notice 3. Revoking a vouch unverifies the worker; revoking a missing vouch reverts
    function test_revokeVouch() public {
        vm.prank(acme);
        registry.vouch(alice);
        _confirm(ALICE_PASSKEY, acme);

        vm.expectEmit(true, true, false, false, address(registry));
        emit IEmployeeRegistry.VouchRevoked(acme, alice);
        vm.prank(acme);
        registry.revokeVouch(alice);
        assertFalse(registry.isVerified(alice, acme));
        assertTrue(registry.isConfirmed(alice, acme));

        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__NotVouched.selector);
        vm.prank(acme);
        registry.revokeVouch(alice);
    }

    /// @notice 4. No vouching for or confirming yourself or the zero address
    function test_rejectsSelfAndZero() public {
        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__ZeroAddress.selector);
        vm.prank(acme);
        registry.vouch(address(0));

        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__Self.selector);
        vm.prank(acme);
        registry.vouch(acme);

        WebAuthn.Assertion memory a = Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(alice, alice));
        IEmployeeRegistry.Passkey memory key = Passkeys.publicKey(ALICE_PASSKEY);
        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__Self.selector);
        vm.prank(alice);
        registry.confirm(alice, key, a);

        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__ZeroAddress.selector);
        vm.prank(alice);
        registry.confirm(address(0), key, a);
    }

    /*//////////////////////////////////////////////////////////////
                           PASSKEY SIGNATURE
    //////////////////////////////////////////////////////////////*/

    /// @notice 5. A signature from another passkey reverts
    function test_confirm_revertsOnWrongKey() public {
        _expectBadConfirm(acme, Passkeys.sign(ALICE_NEW_PASSKEY, registry.challengeOf(alice, acme)));
    }

    /// @notice 6. A signature for another employer, or for another worker, reverts
    function test_confirm_revertsOnWrongChallenge() public {
        _expectBadConfirm(acme, Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(alice, globex)));
        _expectBadConfirm(acme, Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(bob, acme)));
    }

    /// @notice 7. Alice's valid assertion is useless to bob: the challenge names alice
    function test_confirm_revertsWhenReplayedByAnotherWallet() public {
        WebAuthn.Assertion memory a = Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(alice, acme));
        IEmployeeRegistry.Passkey memory key = Passkeys.publicKey(ALICE_PASSKEY);
        vm.expectRevert(EmployeeRegistry.EmployeeRegistry__BadPasskeySignature.selector);
        vm.prank(bob);
        registry.confirm(acme, key, a);
    }

    /// @notice 8. The device must have verified the user (Face ID, fingerprint or PIN)
    function test_confirm_revertsWithoutUserVerification() public {
        bytes32 challenge = registry.challengeOf(alice, acme);
        _expectBadConfirm(acme, Passkeys.sign(ALICE_PASSKEY, challenge, 0x01, "webauthn.get"));
        _expectBadConfirm(acme, Passkeys.sign(ALICE_PASSKEY, challenge, 0x04, "webauthn.get"));
    }

    /// @notice 9. A passkey creation response isn't an assertion
    function test_confirm_revertsOnWrongType() public {
        bytes32 challenge = registry.challengeOf(alice, acme);
        _expectBadConfirm(acme, Passkeys.sign(ALICE_PASSKEY, challenge, Passkeys.FLAGS_UP_UV, "webauthn.create"));
    }

    /// @notice 10. Indexes that don't point at the right fields, or past the end, revert
    function test_confirm_revertsOnBadIndexes() public {
        bytes32 challenge = registry.challengeOf(alice, acme);
        WebAuthn.Assertion memory a = Passkeys.sign(ALICE_PASSKEY, challenge);
        a.challengeIndex += 1;
        _expectBadConfirm(acme, a);

        a = Passkeys.sign(ALICE_PASSKEY, challenge);
        a.typeIndex = type(uint256).max;
        _expectBadConfirm(acme, a);
    }

    /// @notice 11. Truncated authenticatorData reverts
    function test_confirm_revertsOnShortAuthenticatorData() public {
        WebAuthn.Assertion memory a = Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(alice, acme));
        a.authenticatorData = new bytes(36);
        _expectBadConfirm(acme, a);
    }

    /// @notice 12. A high-s signature reverts, so a signature can't be flipped into a second valid one
    function test_confirm_revertsOnHighS() public {
        WebAuthn.Assertion memory a = Passkeys.sign(ALICE_PASSKEY, registry.challengeOf(alice, acme));
        a.s = bytes32(0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551 - uint256(a.s));
        _expectBadConfirm(acme, a);
    }
}
