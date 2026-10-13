// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IReceiver} from "src/interfaces/IReceiver.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilPayrollAutomation
 * @author Kelechi Kizito Ugwu
 * @notice Runs an employer's payroll on a schedule: a Chainlink CRE workflow works out which streams
 *         need funding this period and sends a signed report; this contract runs payroll with it.
 * @dev One per employer and token. The deployer is the payer: they allow this contract with
 *      `VeilPayroll.setPayrollOperator(address(this), true)`. The report only proposes a budget and
 *      stream ids; the owner-set `s_maxBudget` caps the budget, and VeilPayroll itself checks that every
 *      id is the payer's own Active stream in `I_TOKEN`. Only the configured forwarder may deliver,
 *      and, when set, only a workflow owned by `s_expectedAuthor`.
 */
contract VeilPayrollAutomation is IReceiver, Ownable {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a constructor address is zero
    error VeilPayrollAutomation__ZeroAddress();

    /// @notice Thrown when `onReport` isn't called by the forwarder
    /// @param sender The caller
    error VeilPayrollAutomation__InvalidSender(address sender);

    /// @notice Thrown when the report comes from a workflow the owner didn't approve
    /// @param author The workflow owner in the metadata
    error VeilPayrollAutomation__InvalidAuthor(address author);

    /// @notice Thrown when the metadata is too short to hold the workflow owner
    error VeilPayrollAutomation__BadMetadata();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice End of the workflow owner in the metadata: id (32) + name (10) + owner (20)
    uint256 private constant METADATA_OWNER_END = 62;

    /// @notice Start of the workflow owner in the metadata
    uint256 private constant METADATA_OWNER_START = 42;

    /// @notice The payroll contract
    IVeilPayroll public immutable I_PAYROLL;

    /// @notice The token payroll is run in
    IERC20 public immutable I_TOKEN;

    /// @notice The employer whose payroll this runs: the deployer
    address public immutable PAYER;

    /// @notice The CRE forwarder allowed to deliver reports: KeystoneForwarder, or MockKeystoneForwarder in simulation
    address public immutable FORWARDER;

    /// @notice Most a single report may set aside, in the token's units
    uint256 internal s_maxBudget;

    /// @notice The only workflow owner whose reports are accepted; zero accepts any workflow
    address internal s_expectedAuthor;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a report runs payroll
    /// @param budget The budget used, after the cap
    /// @param streams How many streams the report funded
    event ReportProcessed(uint256 budget, uint256 streams);

    /// @notice Emitted when the owner changes the budget cap
    /// @param maxBudget The new cap
    event MaxBudgetSet(uint256 maxBudget);

    /// @notice Emitted when the owner changes which workflow owner is accepted
    /// @param author The workflow owner, or zero for any
    event ExpectedAuthorSet(address author);

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets up automation for the deployer's payroll in one token
    /// @param payroll The VeilPayroll contract
    /// @param token The token to run payroll in
    /// @param forwarder The CRE forwarder for this chain
    /// @param budgetCap Most a single report may set aside
    constructor(address payroll, address token, address forwarder, uint256 budgetCap) Ownable(msg.sender) {
        if (payroll == address(0) || token == address(0) || forwarder == address(0)) {
            revert VeilPayrollAutomation__ZeroAddress();
        }
        I_PAYROLL = IVeilPayroll(payroll);
        I_TOKEN = IERC20(token);
        FORWARDER = forwarder;
        PAYER = msg.sender;
        s_maxBudget = budgetCap;
        emit MaxBudgetSet(budgetCap);
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IReceiver
    /// @dev The report is `abi.encode(uint256 budget, uint256[] ids)`. VeilPayroll reverts on any id that
    ///      isn't the payer's Active stream in `I_TOKEN`, or that was already funded this period.
    function onReport(bytes calldata metadata, bytes calldata report) external {
        if (msg.sender != FORWARDER) revert VeilPayrollAutomation__InvalidSender(msg.sender);

        address expected = s_expectedAuthor;
        if (expected != address(0)) {
            if (metadata.length < METADATA_OWNER_END) revert VeilPayrollAutomation__BadMetadata();
            address author = address(bytes20(metadata[METADATA_OWNER_START:METADATA_OWNER_END]));
            if (author != expected) revert VeilPayrollAutomation__InvalidAuthor(author);
        }

        (uint256 budget, uint256[] memory ids) = abi.decode(report, (uint256, uint256[]));
        budget = Math.min(budget, s_maxBudget);
        // Emitted before the only external call; the linter flags the forwarder check above
        // forge-lint: disable-next-line(reentrancy-events)
        emit ReportProcessed(budget, ids.length);
        I_PAYROLL.runPayrollFor(PAYER, I_TOKEN, budget, ids);
    }

    /// @notice Sets the most a single report may set aside. Owner only.
    /// @param budgetCap The new cap, in the token's units
    function setMaxBudget(uint256 budgetCap) external onlyOwner {
        s_maxBudget = budgetCap;
        emit MaxBudgetSet(budgetCap);
    }

    /// @notice Accepts reports only from workflows owned by `author`; zero, on purpose, accepts any. Owner only.
    /// @param author The CRE workflow owner address
    // forge-lint: disable-next-line(missing-zero-check)
    function setExpectedAuthor(address author) external onlyOwner {
        s_expectedAuthor = author;
        emit ExpectedAuthorSet(author);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    /// @notice Returns the budget cap
    /// @return The most a single report may set aside
    function maxBudget() external view returns (uint256) {
        return s_maxBudget;
    }

    /// @notice Returns the accepted workflow owner
    /// @return The workflow owner, or zero for any
    function expectedAuthor() external view returns (address) {
        return s_expectedAuthor;
    }
}
