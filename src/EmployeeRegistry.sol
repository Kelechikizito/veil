// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {IEmployeeRegistry} from "src/interfaces/IEmployeeRegistry.sol";
import {WebAuthn} from "src/libraries/WebAuthn.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title EmployeeRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Marks wallets as verified employees: the employer vouches, the worker confirms with a passkey.
 * @dev Anyone can vouch. A vouch only means something when it comes from the wallet that pays the worker,
 *      which `IncomeCredential` checks. No owner, no attester, no FHE.
 */
contract EmployeeRegistry is IEmployeeRegistry {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when the worker or employer is the zero address
    error EmployeeRegistry__ZeroAddress();

    /// @notice Thrown when a wallet tries to vouch for or confirm itself
    error EmployeeRegistry__Self();

    /// @notice Thrown when revoking a vouch that doesn't exist
    error EmployeeRegistry__NotVouched();

    /// @notice Thrown when the passkey signature doesn't check out
    error EmployeeRegistry__BadPasskeySignature();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Domain tag for confirm challenges
    bytes32 private constant CONFIRM_TAG = keccak256("Veil EmployeeRegistry confirm");

    /// @notice Whether an employer vouches for a worker
    mapping(address worker => mapping(address employer => bool)) private s_vouched;

    /// @notice Whether a worker confirmed an employer with a passkey
    mapping(address worker => mapping(address employer => bool)) private s_confirmed;

    /// @notice Each worker's current passkey
    mapping(address worker => Passkey) private s_passkeys;

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEmployeeRegistry
    function vouch(address worker) external {
        if (worker == address(0)) revert EmployeeRegistry__ZeroAddress();
        if (worker == msg.sender) revert EmployeeRegistry__Self();
        s_vouched[worker][msg.sender] = true;
        emit Vouched(msg.sender, worker);
    }

    /// @inheritdoc IEmployeeRegistry
    function revokeVouch(address worker) external {
        if (!s_vouched[worker][msg.sender]) revert EmployeeRegistry__NotVouched();
        s_vouched[worker][msg.sender] = false;
        emit VouchRevoked(msg.sender, worker);
    }

    /// @inheritdoc IEmployeeRegistry
    function confirm(address employer, Passkey calldata passkey, WebAuthn.Assertion calldata assertion) external {
        if (employer == address(0)) revert EmployeeRegistry__ZeroAddress();
        if (employer == msg.sender) revert EmployeeRegistry__Self();

        bytes memory challenge = abi.encodePacked(_challenge(msg.sender, employer));
        if (!WebAuthn.verify(challenge, assertion, passkey.x, passkey.y)) {
            revert EmployeeRegistry__BadPasskeySignature();
        }

        s_passkeys[msg.sender] = passkey;
        s_confirmed[msg.sender][employer] = true;
        emit PasskeySet(msg.sender, passkey.x, passkey.y);
        emit Confirmed(msg.sender, employer);
    }

    /*//////////////////////////////////////////////////////////////
                      INTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The challenge a worker's passkey signs to confirm an employer
    /// @param worker The worker's wallet
    /// @param employer The employer's wallet
    /// @return The challenge
    function _challenge(address worker, address employer) internal view returns (bytes32) {
        return keccak256(abi.encode(CONFIRM_TAG, block.chainid, address(this), worker, employer));
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IEmployeeRegistry
    function isVerified(address worker, address employer) external view returns (bool) {
        return s_vouched[worker][employer] && s_confirmed[worker][employer];
    }

    /// @inheritdoc IEmployeeRegistry
    function isVouched(address worker, address employer) external view returns (bool) {
        return s_vouched[worker][employer];
    }

    /// @inheritdoc IEmployeeRegistry
    function isConfirmed(address worker, address employer) external view returns (bool) {
        return s_confirmed[worker][employer];
    }

    /// @inheritdoc IEmployeeRegistry
    function passkeyOf(address worker) external view returns (Passkey memory) {
        return s_passkeys[worker];
    }

    /// @inheritdoc IEmployeeRegistry
    function challengeOf(address worker, address employer) external view returns (bytes32) {
        return _challenge(worker, employer);
    }
}
