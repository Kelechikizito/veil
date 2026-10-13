// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IIncomeCredential
 * @author Kelechi Kizito Ugwu
 * @notice Income proofs: "this payee earns >= X of token T per month", issued to one verifier.
 * @dev Issued, expiring and revocable by the payee. The answer is public onchain.
 */
interface IIncomeCredential {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A one-bit income proof issued by a payee to a single verifier
    struct Credential {
        address payee;
        address payer;
        address verifier;
        address token; // the stream's token; the threshold is in its units
        uint256 streamId;
        uint256 threshold; // the monthly amount the verifier asked about
        uint64 issuedAt;
        uint64 expiresAt;
        uint64 streamActiveSince;
        bool revoked;
        bool employeeVerified; // EmployeeRegistry.isVerified(payee, payer) at issue time
        bool ok; // `monthly >= threshold` at issue time
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payee issues a credential
    /// @param id The credential id
    /// @param payee The payee who issued it
    /// @param verifier Who the credential is for
    /// @param token The stream's token
    /// @param threshold The monthly amount asked about
    /// @param expiresAt When the credential stops being valid
    event CredentialIssued(
        uint256 indexed id,
        address indexed payee,
        address indexed verifier,
        address token,
        uint256 threshold,
        uint64 expiresAt
    );

    /// @notice Emitted when a payee revokes a credential
    /// @param id The credential id
    event CredentialRevoked(uint256 indexed id);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Issues an "earns >= threshold per month" credential to one verifier
    /// @param streamId The caller's active stream
    /// @param verifier Who the credential is for
    /// @param threshold Monthly amount the verifier asked about, in the stream token's units
    /// @param expiresAt Timestamp after which the credential is no longer valid
    /// @return id The new credential's id
    function issue(uint256 streamId, address verifier, uint256 threshold, uint64 expiresAt)
        external
        returns (uint256 id);

    /// @notice Issues a credential the payee signed. Anyone can send it, so a stealth payee needs no gas.
    /// @param streamId The payee's active stream
    /// @param verifier Who the credential is for
    /// @param threshold Monthly amount the verifier asked about, in the stream token's units
    /// @param expiresAt Timestamp after which the credential is no longer valid
    /// @param deadline Timestamp after which the signature is no longer accepted
    /// @param signature The payee's EIP-712 signature over `Issue(..., nonce, deadline)`
    /// @return id The new credential's id
    function issueWithSig(
        uint256 streamId,
        address verifier,
        uint256 threshold,
        uint64 expiresAt,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 id);

    /// @notice Revokes a credential. Payee only.
    /// @param id The credential to revoke
    function revoke(uint256 id) external;

    /// @notice Revokes a credential the payee signed for. Anyone can send it.
    /// @param id The credential to revoke
    /// @param deadline Timestamp after which the signature is no longer accepted
    /// @param signature The payee's EIP-712 signature over `Revoke(id, nonce, deadline)`
    function revokeWithSig(uint256 id, uint256 deadline, bytes calldata signature) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Checks whether a credential is unrevoked, unexpired, and its stream is still Active
    /// @param id The credential to check
    /// @return True if the credential can still be relied on
    function isValid(uint256 id) external view returns (bool);

    /// @notice Returns a credential by id
    /// @param id The credential to look up
    /// @return The credential
    function get(uint256 id) external view returns (Credential memory);

    /// @notice Returns the ids of credentials a payee issued
    /// @param payee The payee to look up
    /// @return The credential ids
    function credentialsOf(address payee) external view returns (uint256[] memory);

    /// @notice Returns the ids of credentials issued to a verifier
    /// @param verifier The verifier to look up
    /// @return The credential ids
    function credentialsFor(address verifier) external view returns (uint256[] memory);
}
