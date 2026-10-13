// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";
import {IEmployeeRegistry} from "src/interfaces/IEmployeeRegistry.sol";
import {IIncomeCredential} from "src/interfaces/IIncomeCredential.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title IncomeCredential
 * @author Kelechi Kizito Ugwu
 * @notice A payee proves "I earn >= X of token T per month" to one verifier.
 * @dev Compares the stream's `monthly` against the threshold at issue time, so there's no rounding.
 *      Honest limits:
 *      - The answer, and the salary behind it, are public onchain. A ZK credential will hide both.
 *      - The result is as of issuance. A later salary change doesn't update it. Short expiries keep it honest.
 *      - One credential covers one stream in one token. "Across all streams" would need prices.
 */
contract IncomeCredential is IIncomeCredential, EIP712, Nonces {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a constructor address or the verifier is zero
    error IncomeCredential__ZeroAddress();

    /// @notice Thrown when the caller is not the stream's (or credential's) payee
    error IncomeCredential__NotPayee();

    /// @notice Thrown when issuing on a stream that is not Active
    error IncomeCredential__StreamNotActive();

    /// @notice Thrown when the expiry is not in the future
    error IncomeCredential__BadExpiry();

    /// @notice Thrown when revoking a credential that is already revoked
    error IncomeCredential__AlreadyRevoked();

    /// @notice Thrown when a signature's deadline has passed
    error IncomeCredential__Expired();

    /// @notice Thrown when a signature isn't the payee's
    error IncomeCredential__BadSignature();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice EIP-712 typehash for a signed issue
    bytes32 private constant ISSUE_TYPEHASH = keccak256(
        "Issue(uint256 streamId,address verifier,uint256 threshold,uint64 expiresAt,uint256 nonce,uint256 deadline)"
    );

    /// @notice EIP-712 typehash for a signed revoke
    bytes32 private constant REVOKE_TYPEHASH = keccak256("Revoke(uint256 id,uint256 nonce,uint256 deadline)");

    /// @notice Payroll, which owns the streams
    IVeilPayroll public immutable I_PAYROLL;

    /// @notice Employee registry, read at issue time for the "verified employee" flag
    IEmployeeRegistry public immutable I_EMPLOYEE_REGISTRY;

    /// @notice Credentials by id; ids start at 1
    mapping(uint256 id => Credential credential) private s_credentials;

    /// @notice Number of credentials issued; also the last id used
    uint256 private s_credentialCount;

    /// @notice Credential ids per payee
    mapping(address payee => uint256[] ids) private s_payeeCredentials;

    /// @notice Credential ids per verifier
    mapping(address verifier => uint256[] ids) private s_verifierCredentials;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets payroll and the employee registry
    /// @param payroll The payroll contract
    /// @param employeeRegistry The employee registry
    constructor(address payroll, address employeeRegistry) EIP712("Veil IncomeCredential", "1") {
        if (payroll == address(0)) revert IncomeCredential__ZeroAddress();
        if (employeeRegistry == address(0)) revert IncomeCredential__ZeroAddress();
        I_PAYROLL = IVeilPayroll(payroll);
        I_EMPLOYEE_REGISTRY = IEmployeeRegistry(employeeRegistry);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncomeCredential
    function issue(uint256 streamId, address verifier, uint256 threshold, uint64 expiresAt)
        external
        returns (uint256 id)
    {
        id = _issue(msg.sender, streamId, verifier, threshold, expiresAt);
    }

    /// @inheritdoc IIncomeCredential
    function issueWithSig(
        uint256 streamId,
        address verifier,
        uint256 threshold,
        uint64 expiresAt,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 id) {
        address payee = I_PAYROLL.getStream(streamId).payee;
        bytes32 structHash =
            keccak256(abi.encode(ISSUE_TYPEHASH, streamId, verifier, threshold, expiresAt, _useNonce(payee), deadline));
        _checkSignature(payee, structHash, deadline, signature);
        id = _issue(payee, streamId, verifier, threshold, expiresAt);
    }

    /// @inheritdoc IIncomeCredential
    function revoke(uint256 id) external {
        _revoke(msg.sender, id);
    }

    /// @inheritdoc IIncomeCredential
    function revokeWithSig(uint256 id, uint256 deadline, bytes calldata signature) external {
        address payee = s_credentials[id].payee;
        _checkSignature(
            payee, keccak256(abi.encode(REVOKE_TYPEHASH, id, _useNonce(payee), deadline)), deadline, signature
        );
        _revoke(payee, id);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Issues a credential on `payee`'s stream
    /// @param payee Who is issuing: the caller, or the signer of a relayed issue
    /// @param streamId The payee's active stream
    /// @param verifier Who the credential is for
    /// @param threshold Monthly amount asked about
    /// @param expiresAt When it stops being valid
    /// @return id The new credential's id
    function _issue(address payee, uint256 streamId, address verifier, uint256 threshold, uint64 expiresAt)
        internal
        returns (uint256 id)
    {
        if (verifier == address(0)) revert IncomeCredential__ZeroAddress();
        // forge-lint: disable-next-line(block-timestamp)
        if (expiresAt <= block.timestamp) revert IncomeCredential__BadExpiry();
        IVeilPayroll.Stream memory s = I_PAYROLL.getStream(streamId);
        if (s.payee != payee) revert IncomeCredential__NotPayee();
        if (s.status != IVeilPayroll.Status.Active) revert IncomeCredential__StreamNotActive();

        id = ++s_credentialCount;
        s_credentials[id] = Credential({
            payee: payee,
            payer: s.payer,
            verifier: verifier,
            token: address(s.token),
            streamId: streamId,
            threshold: threshold,
            // forge-lint: disable-next-line(unsafe-typecast)
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            streamActiveSince: s.startTime,
            revoked: false,
            employeeVerified: I_EMPLOYEE_REGISTRY.isVerified(payee, s.payer),
            ok: s.monthly >= threshold
        });
        s_payeeCredentials[payee].push(id);
        s_verifierCredentials[verifier].push(id);

        emit CredentialIssued(id, payee, verifier, address(s.token), threshold, expiresAt);
    }

    /// @notice Revokes `payee`'s credential
    /// @param payee Who is revoking: the caller, or the signer of a relayed revoke
    /// @param id The credential
    function _revoke(address payee, uint256 id) internal {
        Credential storage c = s_credentials[id];
        if (c.payee != payee) revert IncomeCredential__NotPayee();
        if (c.revoked) revert IncomeCredential__AlreadyRevoked();
        c.revoked = true;
        emit CredentialRevoked(id);
    }

    /// @notice Reverts unless `signature` is `signer`'s over the typed struct, before the deadline
    /// @param signer Who must have signed
    /// @param structHash The EIP-712 struct hash
    /// @param deadline When the signature expires
    /// @param signature The signature
    function _checkSignature(address signer, bytes32 structHash, uint256 deadline, bytes calldata signature)
        internal
        view
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert IncomeCredential__Expired();
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(structHash), signature);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert IncomeCredential__BadSignature();
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IIncomeCredential
    /// @dev Also false once the stream is cancelled: the payee no longer earns from it.
    ///      A salary change while Active doesn't affect it (the result is as of issuance).
    function isValid(uint256 id) external view returns (bool) {
        Credential storage c = s_credentials[id];
        if (c.payee == address(0) || c.revoked) return false;
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= c.expiresAt) return false;
        return I_PAYROLL.getStream(c.streamId).status == IVeilPayroll.Status.Active;
    }

    /// @inheritdoc IIncomeCredential
    function get(uint256 id) external view returns (Credential memory) {
        return s_credentials[id];
    }

    /// @inheritdoc IIncomeCredential
    function credentialsOf(address payee) external view returns (uint256[] memory) {
        return s_payeeCredentials[payee];
    }

    /// @inheritdoc IIncomeCredential
    function credentialsFor(address verifier) external view returns (uint256[] memory) {
        return s_verifierCredentials[verifier];
    }
}
