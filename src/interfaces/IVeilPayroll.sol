// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IVeilPayroll
 * @author Kelechi Kizito Ugwu
 * @notice Salary streams paid per second from per-payer, per-token vaults.
 * @dev Money flows vault → payroll (once per period, `runPayroll`) → each stream's allocation → the payee.
 *      A stream only ever streams what was set aside for it, so pay can't outrun the money.
 *      Amounts are public onchain. Stealth streams pay a one-time address (ERC-5564), so nobody but the
 *      payer and the payee can tell whose salary a stream is. The payee withdraws by signature, through
 *      a relayer, so their stealth address never needs gas.
 */
interface IVeilPayroll {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Lifecycle of a stream
    enum Status {
        None,
        Pending, // waiting for approvals: the salary is above the payer's threshold
        Active,
        Cancelled
    }

    /// @notice A payer's organisation
    struct Org {
        string name; // shown on credentials
        bool exists;
    }

    /// @notice One salary stream from a payer to a payee, paid in one token
    struct Stream {
        address payer;
        address payee;
        IERC20 token; // allowlisted token
        uint256 monthly; // monthly salary, in the token's units
        uint256 withdrawn; // total paid out to the payee
        uint256 allocated; // set aside by the latest `runPayroll`; streams from allocStart to allocEnd
        uint256 banked; // set aside in earlier periods (or before a cancel), fully earned
        uint64 startTime; // set when it becomes Active
        uint64 endTime; // set on cancel
        uint64 allocStart; // when `allocated` starts streaming
        uint64 allocEnd; // end of the period `allocated` is for; 0 if none
        Status status;
    }

    /// @notice What a payee needs to find a stealth stream: the payer's ephemeral key and the view tag
    struct StealthAnnouncement {
        bytes ephemeralPubKey; // 33-byte compressed secp256k1 key
        bytes1 viewTag; // first byte of the shared secret's hash; lets the payee skip most streams cheaply
    }

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a stealth stream is created, in ERC-5564's shape so stealth indexers find it
    /// @param schemeId 1: secp256k1 with view tags
    /// @param stealthAddress The one-time payee address
    /// @param caller The payer
    /// @param ephemeralPubKey The payer's ephemeral public key
    /// @param metadata The view tag, then the stream id as 32 bytes
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    /// @notice Emitted when the owner allowlists a token
    /// @param token The token added
    event TokenAdded(IERC20 indexed token);

    /// @notice Emitted when the owner removes a token from the allowlist
    /// @param token The token removed
    event TokenRemoved(IERC20 indexed token);

    /// @notice Emitted when a payer registers an org
    /// @param payer The payer
    /// @param name The org name
    event OrgCreated(address indexed payer, string name);

    /// @notice Emitted when a payer funds a vault
    /// @param payer The payer
    /// @param token The token funded
    /// @param amount The amount credited
    event VaultFunded(address indexed payer, IERC20 indexed token, uint256 amount);

    /// @notice Emitted when a payer takes unallocated money back out of a vault
    /// @param payer The payer
    /// @param token The token
    /// @param amount The amount taken out
    event VaultDefunded(address indexed payer, IERC20 indexed token, uint256 amount);

    /// @notice Emitted when a stream is created
    /// @param id The stream id
    /// @param payer The payer
    /// @param payee The payee
    /// @param token The token the stream pays in
    /// @param monthly The monthly salary
    event StreamCreated(
        uint256 indexed id, address indexed payer, address indexed payee, IERC20 token, uint256 monthly
    );

    /// @notice Emitted when a stream needs approvals before it can start
    /// @param id The stream id
    event StreamPending(uint256 indexed id);

    /// @notice Emitted when a stream starts accruing
    /// @param id The stream id
    /// @param startTime When accrual starts
    event StreamActivated(uint256 indexed id, uint64 startTime);

    /// @notice Emitted when a payee withdraws
    /// @param id The stream id
    /// @param to Where the money went
    /// @param amount The amount paid
    event Withdrawn(uint256 indexed id, address indexed to, uint256 amount);

    /// @notice Emitted when a payer sets money aside for a period
    /// @param payer The payer
    /// @param token The token paid in
    /// @param periodEnd End of the period the money is for
    /// @param streams How many streams were funded
    /// @param spent Total set aside
    event PayrollRun(address indexed payer, IERC20 indexed token, uint64 periodEnd, uint256 streams, uint256 spent);

    /// @notice Emitted when a payer cancels a stream
    /// @param id The stream id
    event StreamCancelled(uint256 indexed id);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers the caller as a payer with a display name
    /// @param name Org name shown on credentials
    function createOrg(string calldata name) external;

    /// @notice Allowlists a token. Owner only.
    /// @param token The token to accept
    function addToken(IERC20 token) external;

    /// @notice Removes a token from the allowlist; existing streams keep withdrawing. Owner only.
    /// @param token The token to remove
    function removeToken(IERC20 token) external;

    /// @notice Pulls `amount` of `token` from the caller into their vault for that token
    /// @dev Caller must first approve payroll for `amount`
    /// @param token An allowlisted token
    /// @param amount Amount to fund, in the token's units
    function fundVault(IERC20 token, uint256 amount) external;

    /// @notice Sends unallocated money from the caller's vault back to them
    /// @param token The token
    /// @param amount Amount to take out
    function defundVault(IERC20 token, uint256 amount) external;

    /// @notice Starts a salary stream from the caller to `payee`, paid in `token`
    /// @dev Active right away, or Pending if the payer's policy says the salary needs approval
    /// @param payee The worker being paid
    /// @param token An allowlisted token
    /// @param monthly Monthly salary, in the token's units
    /// @return id The new stream's id
    function createStream(address payee, IERC20 token, uint256 monthly) external returns (uint256 id);

    /// @notice Starts a salary stream to a one-time stealth address, and announces it for the payee to find
    /// @param stealthPayee The one-time address derived from the payee's meta-address
    /// @param token An allowlisted token
    /// @param monthly Monthly salary, in the token's units
    /// @param ephemeralPubKey The 33-byte compressed ephemeral key used to derive `stealthPayee`
    /// @param viewTag The first byte of the shared secret's hash
    /// @return id The new stream's id
    function createStealthStream(
        address stealthPayee,
        IERC20 token,
        uint256 monthly,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external returns (uint256 id);

    /// @notice Activates a pending stream once it has enough approvals on the policy
    /// @dev Anyone can call it
    /// @param id The stream to activate
    function activateApproved(uint256 id) external;

    /// @notice Sets this period's pay aside from the caller's vault. Each stream gets
    ///         min(its salary for the rest of the period, what's left of the budget), in `ids` order.
    /// @dev The budget is capped at the vault. Unused budget stays in the vault.
    ///      A stream funded mid-period gets its salary pro rata for the time left.
    ///      Run it again in the same period to fund streams that started after the first run.
    /// @param token The token to pay in
    /// @param budget Most to set aside this period, in the token's units
    /// @param ids Active streams of the caller in `token`, not yet funded this period
    function runPayroll(IERC20 token, uint256 budget, uint256[] calldata ids) external;

    /// @notice Withdraws `amount` of what has streamed and not been withdrawn, to the payee
    /// @param id The stream to withdraw from
    /// @param amount Amount requested; must be <= `available(id)`
    function withdraw(uint256 id, uint256 amount) external;

    /// @notice Withdraws for the payee, who signed it. Anyone can send it, so a stealth payee needs no gas.
    /// @param id The stream to withdraw from
    /// @param amount Amount requested; must be <= `available(id)`
    /// @param to Where the money goes
    /// @param deadline Timestamp after which the signature is no longer accepted
    /// @param signature The payee's EIP-712 signature over `Withdraw(id, amount, to, nonce, deadline)`
    function withdrawWithSig(uint256 id, uint256 amount, address to, uint256 deadline, bytes calldata signature)
        external;

    /// @notice Cancels a stream at any stage. What it streamed stays the payee's; the rest of this
    ///         period's allocation goes back to the vault. Payer only.
    /// @param id The stream to cancel
    function cancelStream(uint256 id) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns a payer's org
    /// @param payer The payer to look up
    /// @return The org; `exists` is false if none
    function orgOf(address payer) external view returns (Org memory);

    /// @notice Returns a stream by id
    /// @param id The stream to look up
    /// @return The stream
    function getStream(uint256 id) external view returns (Stream memory);

    /// @notice Returns what a stream has streamed and not yet paid out
    /// @param id The stream to look up
    /// @return The withdrawable amount
    function available(uint256 id) external view returns (uint256);

    /// @notice Returns a stealth stream's announcement; empty for a plain stream
    /// @param id The stream to look up
    /// @return The announcement
    function announcementOf(uint256 id) external view returns (StealthAnnouncement memory);

    /// @notice Returns how many streams exist; ids run from 1 to this
    /// @return The stream count
    function streamCount() external view returns (uint256);

    /// @notice Returns the ids of all streams a payer created
    /// @param payer The payer to look up
    /// @return The stream ids
    function streamsOfPayer(address payer) external view returns (uint256[] memory);

    /// @notice Returns the ids of all streams paying a payee
    /// @param payee The payee to look up
    /// @return The stream ids
    function streamsOfPayee(address payee) external view returns (uint256[] memory);

    /// @notice Returns a payer's unallocated vault balance for one token
    /// @param payer The payer to look up
    /// @param token The token to look up
    /// @return The balance
    function vaultOf(address payer, IERC20 token) external view returns (uint256);

    /// @notice Returns when the pay period containing `timestamp` ends
    /// @param timestamp Any time
    /// @return The period's end; periods are fixed `PERIOD`-long windows from time 0
    function periodEnd(uint64 timestamp) external view returns (uint64);
}
