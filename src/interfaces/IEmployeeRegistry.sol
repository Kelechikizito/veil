// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {WebAuthn} from "src/libraries/WebAuthn.sol";

/**
 * @title IEmployeeRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Records who works for whom. An employer vouches for a worker, and the worker confirms with a passkey.
 * @dev A worker is a verified employee of an employer only when both sides agree.
 *      This proves employment and that a person was present. It doesn't prove the person is unique.
 */
interface IEmployeeRegistry {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A passkey's P256 public key
    struct Passkey {
        bytes32 x;
        bytes32 y;
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when an employer vouches for a worker
    /// @param employer The employer
    /// @param worker The worker
    event Vouched(address indexed employer, address indexed worker);

    /// @notice Emitted when an employer withdraws a vouch, for example when the worker leaves
    /// @param employer The employer
    /// @param worker The worker
    event VouchRevoked(address indexed employer, address indexed worker);

    /// @notice Emitted when a worker confirms an employer with their passkey
    /// @param worker The worker
    /// @param employer The employer
    event Confirmed(address indexed worker, address indexed employer);

    /// @notice Emitted when a worker's passkey is set or replaced
    /// @param worker The worker
    /// @param x The public key's x coordinate
    /// @param y The public key's y coordinate
    event PasskeySet(address indexed worker, bytes32 x, bytes32 y);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Vouches that `worker` works for the caller
    /// @param worker The worker's wallet
    function vouch(address worker) external;

    /// @notice Withdraws the caller's vouch for `worker`
    /// @param worker The worker's wallet
    function revokeVouch(address worker) external;

    /// @notice Confirms, with a passkey, that the caller works for `employer`
    /// @dev The passkey must sign `challengeOf(msg.sender, employer)` with the user verified.
    ///      Stores the passkey, replacing any earlier one, so a new device just confirms again.
    /// @param employer The employer's wallet
    /// @param passkey The passkey's public key
    /// @param assertion The browser's signature over the challenge
    function confirm(address employer, Passkey calldata passkey, WebAuthn.Assertion calldata assertion) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Whether `worker` is a verified employee of `employer`: vouched for and confirmed
    /// @param worker The worker's wallet
    /// @param employer The employer's wallet
    /// @return True if both sides agree
    function isVerified(address worker, address employer) external view returns (bool);

    /// @notice Whether `employer` vouches for `worker`
    /// @param worker The worker's wallet
    /// @param employer The employer's wallet
    /// @return True if vouched
    function isVouched(address worker, address employer) external view returns (bool);

    /// @notice Whether `worker` confirmed `employer` with a passkey
    /// @param worker The worker's wallet
    /// @param employer The employer's wallet
    /// @return True if confirmed
    function isConfirmed(address worker, address employer) external view returns (bool);

    /// @notice Returns a worker's current passkey, or zeros if they have none
    /// @param worker The worker's wallet
    /// @return The public key
    function passkeyOf(address worker) external view returns (Passkey memory);

    /// @notice Returns what the passkey must sign to confirm `employer`
    /// @dev Binds the chain, this registry, the worker and the employer, so a signature can't be reused elsewhere
    /// @param worker The worker's wallet
    /// @param employer The employer's wallet
    /// @return The challenge
    function challengeOf(address worker, address employer) external view returns (bytes32);
}
