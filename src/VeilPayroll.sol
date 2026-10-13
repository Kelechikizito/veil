// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IApprovalPolicy} from "src/interfaces/IApprovalPolicy.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilPayroll
 * @author Kelechi Kizito Ugwu
 * @notice Salary streams paid per second from per-payer, per-token vaults.
 * @dev Money flows vault → payroll → stream → payee. Once per period the payer runs payroll with a
 *      budget: each stream gets min(its salary for the rest of the period, budget left), and that amount
 *      leaves the vault. A stream streams only its allocation, linearly to the period's end, so pay never
 *      outruns the money. Finished periods move into `banked`, which stays withdrawable.
 *      Streaming is lazy, computed on each withdraw. Salaries above the payer's threshold start Pending
 *      until enough approvers sign off on the policy.
 *      Stealth streams pay a one-time address and store the ERC-5564 announcement, so the payee can find
 *      them by scanning streams, with no indexer. The payee withdraws by EIP-712 signature through a relayer.
 */
contract VeilPayroll is IVeilPayroll, Ownable, ReentrancyGuard, EIP712, Nonces {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when an address argument is zero
    error VeilPayroll__ZeroAddress();

    /// @notice Thrown when `PERIOD` is 0
    error VeilPayroll__ZeroPeriod();

    /// @notice Thrown when an amount is 0
    error VeilPayroll__ZeroAmount();

    /// @notice Thrown when the token is not on the allowlist
    error VeilPayroll__UnsupportedToken();

    /// @notice Thrown when adding a token that is already on the allowlist
    error VeilPayroll__TokenAlreadySupported();

    /// @notice Thrown when the caller already has an org
    error VeilPayroll__OrgExists();

    /// @notice Thrown when the caller has no org
    error VeilPayroll__NoOrg();

    /// @notice Thrown when the caller is not the stream's payee
    error VeilPayroll__NotPayee();

    /// @notice Thrown when the caller is not the stream's payer
    error VeilPayroll__NotPayer();

    /// @notice Thrown when withdrawing from a stream that is not Active or Cancelled
    error VeilPayroll__NotWithdrawable();

    /// @notice Thrown when withdrawing more than has streamed
    error VeilPayroll__ExceedsAvailable();

    /// @notice Thrown when taking more out of a vault than it holds
    error VeilPayroll__ExceedsVault();

    /// @notice Thrown when cancelling a stream that is already cancelled or doesn't exist
    error VeilPayroll__NotCancellable();

    /// @notice Thrown when activating a stream that is not `Pending`
    error VeilPayroll__NotPending();

    /// @notice Thrown when activating a stream that has fewer approvals than the policy requires
    error VeilPayroll__NotEnoughApprovals();

    /// @notice Thrown when running payroll for a stream that isn't Active
    error VeilPayroll__NotActive();

    /// @notice Thrown when running payroll for a stream paid in another token
    error VeilPayroll__WrongToken();

    /// @notice Thrown when running payroll for a stream already funded this period
    error VeilPayroll__AlreadyFunded();

    /// @notice Thrown when an ephemeral public key isn't 33 bytes
    error VeilPayroll__BadEphemeralKey();

    /// @notice Thrown when a signed withdrawal's deadline has passed
    error VeilPayroll__Expired();

    /// @notice Thrown when a withdrawal signature isn't the payee's
    error VeilPayroll__BadSignature();

    /// @notice Thrown when running payroll for a payer who hasn't allowed the caller
    error VeilPayroll__NotOperator();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-5564 scheme 1: secp256k1 with view tags
    uint256 public constant SCHEME_SECP256K1 = 1;

    /// @notice EIP-712 typehash for a signed withdrawal
    bytes32 private constant WITHDRAW_TYPEHASH =
        keccak256("Withdraw(uint256 id,uint256 amount,address to,uint256 nonce,uint256 deadline)");

    /// @notice Length of a compressed secp256k1 public key
    uint256 private constant COMPRESSED_KEY_LENGTH = 33;

    /// @notice Policy that decides which streams need approval
    IApprovalPolicy public immutable I_APPROVAL_POLICY;

    /// @notice Length of one pay period in seconds: 30 days in prod, e.g. 600 (10 min) for the demo.
    ///         Periods are fixed windows from time 0, the same for every payer.
    uint64 public immutable PERIOD;

    /// @notice Tokens payroll accepts; owner-managed
    mapping(IERC20 token => bool supported) public s_supportedTokens;

    /// @notice Each payer's unallocated balance, per token
    mapping(address payer => mapping(IERC20 token => uint256 balance)) internal s_vaults;

    /// @notice Each payer's org
    mapping(address payer => Org org) internal s_orgs;

    /// @notice Streams by id; ids start at 1
    mapping(uint256 id => Stream stream) internal s_streams;

    /// @notice Number of streams created; also the last id used
    uint256 internal s_streamCount;

    /// @notice Stream ids per payer
    mapping(address payer => uint256[] ids) internal s_payerStreams;

    /// @notice Stream ids per payee
    mapping(address payee => uint256[] ids) internal s_payeeStreams;

    /// @notice Announcements of stealth streams, by stream id
    mapping(uint256 id => StealthAnnouncement announcement) internal s_announcements;

    /// @notice Addresses each payer lets run payroll for them, e.g. a Chainlink CRE workflow's receiver
    mapping(address payer => mapping(address operator => bool allowed)) internal s_payrollOperators;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the policy and the pay period. The deployer becomes owner.
    /// @param approvalPolicy The approval policy
    /// @param period Length of one pay period in seconds
    constructor(address approvalPolicy, uint64 period) Ownable(msg.sender) EIP712("Veil Payroll", "1") {
        if (approvalPolicy == address(0)) revert VeilPayroll__ZeroAddress();
        if (period == 0) revert VeilPayroll__ZeroPeriod();
        I_APPROVAL_POLICY = IApprovalPolicy(approvalPolicy);
        PERIOD = period;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IVeilPayroll
    function createOrg(string calldata name) external {
        if (s_orgs[msg.sender].exists) revert VeilPayroll__OrgExists();
        s_orgs[msg.sender] = Org({name: name, exists: true});
        emit OrgCreated(msg.sender, name);
    }

    /// @inheritdoc IVeilPayroll
    function addToken(IERC20 token) external onlyOwner {
        if (address(token) == address(0)) revert VeilPayroll__ZeroAddress();
        if (s_supportedTokens[token]) revert VeilPayroll__TokenAlreadySupported();
        s_supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    /// @inheritdoc IVeilPayroll
    function removeToken(IERC20 token) external onlyOwner {
        if (!s_supportedTokens[token]) revert VeilPayroll__UnsupportedToken();
        s_supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    /// @inheritdoc IVeilPayroll
    /// @dev Credits what actually arrived, so a fee-on-transfer token can't over-credit the vault
    function fundVault(IERC20 token, uint256 amount) external nonReentrant {
        if (!s_supportedTokens[token]) revert VeilPayroll__UnsupportedToken();
        if (amount == 0) revert VeilPayroll__ZeroAmount();

        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;

        // Credit after the transfer to count what arrived; nonReentrant covers the gap
        // aderyn-fp-next-line(reentrancy-state-change)
        s_vaults[msg.sender][token] += received;
        emit VaultFunded(msg.sender, token, received);
    }

    /// @inheritdoc IVeilPayroll
    function defundVault(IERC20 token, uint256 amount) external nonReentrant {
        if (amount == 0) revert VeilPayroll__ZeroAmount();
        if (amount > s_vaults[msg.sender][token]) revert VeilPayroll__ExceedsVault();
        s_vaults[msg.sender][token] -= amount;
        emit VaultDefunded(msg.sender, token, amount);
        token.safeTransfer(msg.sender, amount);
    }

    /// @inheritdoc IVeilPayroll
    function createStream(address payee, IERC20 token, uint256 monthly) external returns (uint256 id) {
        id = _createStream(payee, token, monthly);
    }

    /// @inheritdoc IVeilPayroll
    function createStealthStream(
        address stealthPayee,
        IERC20 token,
        uint256 monthly,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external returns (uint256 id) {
        if (ephemeralPubKey.length != COMPRESSED_KEY_LENGTH) {
            revert VeilPayroll__BadEphemeralKey();
        }
        id = _createStream(stealthPayee, token, monthly);
        s_announcements[id] = StealthAnnouncement({ephemeralPubKey: ephemeralPubKey, viewTag: viewTag});
        emit Announcement(SCHEME_SECP256K1, stealthPayee, msg.sender, ephemeralPubKey, abi.encodePacked(viewTag, id));
    }

    /// @inheritdoc IVeilPayroll
    function activateApproved(uint256 id) external {
        Stream storage s = s_streams[id];
        if (s.status != Status.Pending) revert VeilPayroll__NotPending();
        if (I_APPROVAL_POLICY.approvalCount(s.payer, id) < I_APPROVAL_POLICY.required(s.payer)) {
            revert VeilPayroll__NotEnoughApprovals();
        }
        _activate(s, id);
    }

    /// @notice Creates a stream from the caller; Active, or Pending if it needs approval
    /// @param payee The payee
    /// @param token An allowlisted token
    /// @param monthly Monthly salary
    /// @return id The new stream's id
    function _createStream(address payee, IERC20 token, uint256 monthly) internal returns (uint256 id) {
        if (payee == address(0)) revert VeilPayroll__ZeroAddress();
        if (monthly == 0) revert VeilPayroll__ZeroAmount();
        if (!s_supportedTokens[token]) revert VeilPayroll__UnsupportedToken();
        if (!s_orgs[msg.sender].exists) revert VeilPayroll__NoOrg();

        id = ++s_streamCount;
        Stream storage s = s_streams[id];
        s.payer = msg.sender;
        s.payee = payee;
        s.token = token;
        s.monthly = monthly;

        s_payerStreams[msg.sender].push(id);
        s_payeeStreams[payee].push(id);
        emit StreamCreated(id, msg.sender, payee, token, monthly);

        // A view call (STATICCALL), so the policy can't reenter
        // aderyn-fp-next-line(reentrancy-state-change)
        if (I_APPROVAL_POLICY.needsApproval(msg.sender, address(token), monthly)) {
            s.status = Status.Pending;
            emit StreamPending(id);
        } else {
            _activate(s, id);
        }
    }

    /// @inheritdoc IVeilPayroll
    function runPayroll(IERC20 token, uint256 budget, uint256[] calldata ids) external {
        _runPayroll(msg.sender, token, budget, ids);
    }

    /// @inheritdoc IVeilPayroll
    function setPayrollOperator(address operator, bool allowed) external {
        if (operator == address(0)) revert VeilPayroll__ZeroAddress();
        s_payrollOperators[msg.sender][operator] = allowed;
        emit PayrollOperatorSet(msg.sender, operator, allowed);
    }

    /// @inheritdoc IVeilPayroll
    function runPayrollFor(address payer, IERC20 token, uint256 budget, uint256[] calldata ids) external {
        if (msg.sender != payer && !s_payrollOperators[payer][msg.sender]) revert VeilPayroll__NotOperator();
        _runPayroll(payer, token, budget, ids);
    }

    /// @inheritdoc IVeilPayroll
    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payee) revert VeilPayroll__NotPayee();
        _withdraw(s, id, amount, msg.sender);
    }

    /// @inheritdoc IVeilPayroll
    /// @dev The nonce is the payee's, so each signature works once
    function withdrawWithSig(uint256 id, uint256 amount, address to, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert VeilPayroll__Expired();
        Stream storage s = s_streams[id];
        bytes32 digest =
            _hashTypedDataV4(keccak256(abi.encode(WITHDRAW_TYPEHASH, id, amount, to, _useNonce(s.payee), deadline)));
        // tryRecover, so a malformed signature reverts with our error, not OZ's
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != s.payee) revert VeilPayroll__BadSignature();
        _withdraw(s, id, amount, to);
    }

    /// @inheritdoc IVeilPayroll
    function cancelStream(uint256 id) external {
        Stream storage s = s_streams[id];
        if (msg.sender != s.payer) revert VeilPayroll__NotPayer();
        if (s.status == Status.Cancelled) revert VeilPayroll__NotCancellable();

        // Bank what the allocation streamed so far; the rest goes back to the vault
        if (s.allocEnd != 0) {
            uint256 earned = _allocationStreamed(s);
            s.banked += earned;
            s_vaults[s.payer][s.token] += s.allocated - earned;
            s.allocated = 0;
            s.allocEnd = 0;
        }

        // A stream that never went Active has startTime 0; end there too
        // forge-lint: disable-next-line(unsafe-typecast)
        s.endTime = s.status == Status.Active ? uint64(block.timestamp) : s.startTime;
        s.status = Status.Cancelled;
        emit StreamCancelled(id);
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Pays `amount` of what streamed to `to`
    /// @dev No vault check: what a stream streams was already set aside out of the vault
    /// @param s The stream
    /// @param id The stream's id
    /// @param amount Amount requested
    /// @param to Where the money goes
    function _withdraw(Stream storage s, uint256 id, uint256 amount, address to) internal {
        if (to == address(0)) revert VeilPayroll__ZeroAddress();
        if (s.status != Status.Active && s.status != Status.Cancelled) revert VeilPayroll__NotWithdrawable();
        if (amount == 0) revert VeilPayroll__ZeroAmount();
        if (amount > _streamed(s) - s.withdrawn) revert VeilPayroll__ExceedsAvailable();

        s.withdrawn += amount;
        emit Withdrawn(id, to, amount);
        s.token.safeTransfer(to, amount);
    }

    /// @notice Sets this period's pay aside from `payer`'s vault; see `runPayroll`
    /// @dev Callers check that msg.sender may act for `payer`
    /// @param payer The payer whose vault and streams are used
    /// @param token The token to pay in
    /// @param budget Most to set aside this period
    /// @param ids Active streams of `payer` in `token`, not yet funded this period
    function _runPayroll(address payer, IERC20 token, uint256 budget, uint256[] calldata ids) internal {
        if (!s_orgs[payer].exists) revert VeilPayroll__NoOrg();

        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        uint64 end = _periodEnd(nowTs);
        uint256 pot = Math.min(budget, s_vaults[payer][token]);
        uint256 spent;

        for (uint256 i; i < ids.length; ++i) {
            Stream storage s = s_streams[ids[i]];
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (s.payer != payer) revert VeilPayroll__NotPayer();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (s.token != token) revert VeilPayroll__WrongToken();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (s.status != Status.Active) revert VeilPayroll__NotActive();
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (s.allocEnd == end) revert VeilPayroll__AlreadyFunded();

            // The last allocation's period is over, so all of it was earned
            if (s.allocEnd != 0) s.banked += s.allocated;

            uint256 give = Math.min(Math.mulDiv(s.monthly, end - nowTs, PERIOD), pot - spent);
            spent += give;

            s.allocated = give;
            s.allocStart = nowTs;
            s.allocEnd = end;
        }

        s_vaults[payer][token] -= spent;
        emit PayrollRun(payer, token, end, ids.length, spent);
    }

    /// @notice Starts a stream's accrual from now
    /// @param s The stream
    /// @param id The stream's id
    function _activate(Stream storage s, uint256 id) internal {
        s.status = Status.Active;
        // forge-lint: disable-next-line(unsafe-typecast)
        s.startTime = uint64(block.timestamp);
        emit StreamActivated(id, s.startTime);
    }

    /*//////////////////////////////////////////////////////////////
                      INTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Total a stream has streamed so far: everything banked plus its live allocation's share
    /// @param s The stream
    /// @return Amount, in the token's units
    function _streamed(Stream storage s) internal view returns (uint256) {
        if (s.allocEnd == 0) return s.banked;
        return s.banked + _allocationStreamed(s);
    }

    /// @notice How much of the current allocation has streamed: linear from `allocStart` to `allocEnd`
    /// @param s The stream; must have an allocation
    /// @return Amount, all of `allocated` once its period is over
    function _allocationStreamed(Stream storage s) internal view returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= s.allocEnd) return s.allocated;
        return Math.mulDiv(s.allocated, nowTs - s.allocStart, s.allocEnd - s.allocStart);
    }

    /// @notice End of the pay period containing `timestamp`
    /// @param timestamp Any time
    /// @return The next multiple of `PERIOD` after `timestamp`
    function _periodEnd(uint64 timestamp) internal view returns (uint64) {
        return (timestamp / PERIOD + 1) * PERIOD;
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IVeilPayroll
    function orgOf(address payer) external view returns (Org memory) {
        return s_orgs[payer];
    }

    /// @inheritdoc IVeilPayroll
    function getStream(uint256 id) external view returns (Stream memory) {
        return s_streams[id];
    }

    /// @inheritdoc IVeilPayroll
    function available(uint256 id) external view returns (uint256) {
        Stream storage s = s_streams[id];
        if (s.status != Status.Active && s.status != Status.Cancelled) return 0;
        return _streamed(s) - s.withdrawn;
    }

    /// @inheritdoc IVeilPayroll
    function isPayrollOperator(address payer, address operator) external view returns (bool) {
        return s_payrollOperators[payer][operator];
    }

    /// @inheritdoc IVeilPayroll
    function announcementOf(uint256 id) external view returns (StealthAnnouncement memory) {
        return s_announcements[id];
    }

    /// @inheritdoc IVeilPayroll
    function streamCount() external view returns (uint256) {
        return s_streamCount;
    }

    /// @notice The EIP-712 domain separator for signed withdrawals
    /// @return The separator
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @inheritdoc IVeilPayroll
    function streamsOfPayer(address payer) external view returns (uint256[] memory) {
        return s_payerStreams[payer];
    }

    /// @inheritdoc IVeilPayroll
    function streamsOfPayee(address payee) external view returns (uint256[] memory) {
        return s_payeeStreams[payee];
    }

    /// @inheritdoc IVeilPayroll
    function vaultOf(address payer, IERC20 token) external view returns (uint256) {
        return s_vaults[payer][token];
    }

    /// @inheritdoc IVeilPayroll
    function periodEnd(uint64 timestamp) external view returns (uint64) {
        return _periodEnd(timestamp);
    }
}
