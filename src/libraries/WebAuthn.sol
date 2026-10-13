// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title WebAuthn
 * @author Kelechi Kizito Ugwu
 * @notice Checks a passkey assertion (WebAuthn `navigator.credentials.get`) onchain.
 * @dev The signature check uses OpenZeppelin's `P256`, which calls the P256 precompile at `0x100` on Monad.
 *      Checks the challenge, the assertion type, and the user-present and user-verified flags.
 *      It doesn't check the origin or the RP id: the challenge already binds the signature to one wallet,
 *      one action and this chain.
 */
library WebAuthn {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice What the browser returns from `navigator.credentials.get`, split for onchain checks
    struct Assertion {
        bytes authenticatorData; // 32-byte RP id hash, 1 flags byte, 4-byte counter, optional extensions
        string clientDataJSON; // the JSON the browser built, holding the type and the base64url challenge
        uint256 challengeIndex; // where `"challenge":"` starts in clientDataJSON
        uint256 typeIndex; // where `"type":"` starts in clientDataJSON
        bytes32 r; // P256 signature
        bytes32 s; // P256 signature, in the lower half of the curve order
    }

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Flag set when the user was present (touched the device)
    bytes1 private constant FLAG_USER_PRESENT = 0x01;

    /// @notice Flag set when the device verified the user (Face ID, fingerprint or PIN)
    bytes1 private constant FLAG_USER_VERIFIED = 0x04;

    /// @notice Bytes before the flags byte in authenticatorData (the RP id hash)
    uint256 private constant FLAGS_OFFSET = 32;

    /// @notice Shortest valid authenticatorData: RP id hash, flags, counter
    uint256 private constant MIN_AUTH_DATA_LENGTH = 37;

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks that the passkey (qx, qy) signed `challenge` with the user verified
    /// @param challenge The bytes the browser was asked to sign
    /// @param assertion The browser's response
    /// @param qx The passkey's public key, x coordinate
    /// @param qy The passkey's public key, y coordinate
    /// @return True if the assertion is valid
    function verify(bytes memory challenge, Assertion memory assertion, bytes32 qx, bytes32 qy)
        internal
        view
        returns (bool)
    {
        bytes memory authData = assertion.authenticatorData;
        if (authData.length < MIN_AUTH_DATA_LENGTH) return false;
        bytes1 flags = authData[FLAGS_OFFSET];
        if (flags & FLAG_USER_PRESENT == 0 || flags & FLAG_USER_VERIFIED == 0) return false;

        bytes memory json = bytes(assertion.clientDataJSON);
        if (!_matchesAt(json, assertion.typeIndex, bytes('"type":"webauthn.get"'))) return false;
        bytes memory expected = bytes.concat('"challenge":"', bytes(Base64.encodeURL(challenge)), '"');
        if (!_matchesAt(json, assertion.challengeIndex, expected)) return false;

        bytes32 digest = sha256(bytes.concat(authData, sha256(json)));
        return P256.verify(digest, assertion.r, assertion.s, qx, qy);
    }

    /*//////////////////////////////////////////////////////////////
                            PRIVATE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Whether `data` holds `needle` starting at `index`
    /// @param data The bytes to search
    /// @param index Where `needle` should start
    /// @param needle The expected bytes
    /// @return True on an exact match
    function _matchesAt(bytes memory data, uint256 index, bytes memory needle) private pure returns (bool) {
        if (index > data.length || needle.length > data.length - index) return false;
        bytes32 found;
        assembly ("memory-safe") {
            found := keccak256(add(add(data, 0x20), index), mload(needle))
        }
        return found == keccak256(needle);
    }
}
