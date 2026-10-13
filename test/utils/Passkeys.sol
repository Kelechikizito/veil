// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Vm} from "forge-std/Vm.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {IEmployeeRegistry} from "src/interfaces/IEmployeeRegistry.sol";
import {WebAuthn} from "src/libraries/WebAuthn.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title Passkeys
 * @author Kelechi Kizito Ugwu
 * @notice Builds passkey public keys and WebAuthn assertions in tests, shaped like a browser's.
 */
library Passkeys {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Forge's cheatcode contract
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice The P256 curve order
    uint256 private constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;

    /// @notice User present and user verified
    bytes1 internal constant FLAGS_UP_UV = 0x05;

    /// @notice Where `"challenge":"` starts in `_clientDataJSON`'s output: after `{"type":"webauthn.get",`
    uint256 private constant CHALLENGE_INDEX = 23;

    /// @notice Where `"type":"` starts in `_clientDataJSON`'s output
    uint256 private constant TYPE_INDEX = 1;

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The public key for a P256 private key
    /// @param pkey The private key
    /// @return The public key
    function publicKey(uint256 pkey) internal pure returns (IEmployeeRegistry.Passkey memory) {
        (uint256 x, uint256 y) = VM.publicKeyP256(pkey);
        return IEmployeeRegistry.Passkey(bytes32(x), bytes32(y));
    }

    /// @notice A valid assertion over `challenge`, with the user verified
    /// @param pkey The passkey's private key
    /// @param challenge What to sign
    /// @return The assertion
    function sign(uint256 pkey, bytes32 challenge) internal pure returns (WebAuthn.Assertion memory) {
        return sign(pkey, challenge, FLAGS_UP_UV, "webauthn.get");
    }

    /// @notice An assertion with chosen flags and type, for negative tests
    /// @param pkey The passkey's private key
    /// @param challenge What to sign
    /// @param flags The authenticatorData flags byte
    /// @param kind The clientDataJSON type, e.g. "webauthn.get"
    /// @return a The assertion
    function sign(uint256 pkey, bytes32 challenge, bytes1 flags, string memory kind)
        internal
        pure
        returns (WebAuthn.Assertion memory a)
    {
        a.authenticatorData = bytes.concat(sha256("localhost"), flags, bytes4(0));
        a.clientDataJSON = string.concat(
            '{"type":"',
            kind,
            '","challenge":"',
            Base64.encodeURL(abi.encodePacked(challenge)),
            '","origin":"http://localhost:3000","crossOrigin":false}'
        );
        a.challengeIndex = CHALLENGE_INDEX + bytes(kind).length - bytes("webauthn.get").length;
        a.typeIndex = TYPE_INDEX;

        bytes32 digest = sha256(bytes.concat(a.authenticatorData, sha256(bytes(a.clientDataJSON))));
        (a.r, a.s) = VM.signP256(pkey, digest);
        // Browsers may return a high s. The frontend flips it, and so does this.
        if (uint256(a.s) > N / 2) a.s = bytes32(N - uint256(a.s));
    }
}
