// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {DemoToken} from "src/DemoToken.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {VeilTestBase} from "./VeilTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title PayrollTestBase
 * @author Kelechi Kizito Ugwu
 * @notice Shared setup for payroll tests: deploys payroll, allowlists USDC and WETH, creates the org.
 * @dev `_period()` is virtual so each suite runs once with 30 days and once with the 600s demo period.
 *      USDC amounts are in 6 decimals: 3000e6 is 3,000 USDC.
 */
abstract contract PayrollTestBase is VeilTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Contract under test
    VeilPayroll internal payroll;

    /// @notice Approval policy payroll reads
    ApprovalPolicy internal policy;

    /// @notice USDC the employer holds after setup
    uint256 internal constant EMPLOYER_USDC = 10_000e6;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys payroll, allowlists USDC and WETH, creates the employer's org and mints 10,000 USDC
    function setUp() public virtual override {
        super.setUp();
        policy = new ApprovalPolicy();
        payroll = new VeilPayroll(address(policy), _period());
        vm.label(address(policy), "ApprovalPolicy");
        vm.label(address(payroll), "VeilPayroll");

        payroll.addToken(usdc);
        payroll.addToken(weth);

        vm.prank(employer);
        payroll.createOrg("Acme");

        usdc.mint(employer, EMPLOYER_USDC);
        vm.startPrank(employer);
        usdc.approve(address(payroll), type(uint256).max);
        weth.approve(address(payroll), type(uint256).max);
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The pay period payroll is deployed with
    /// @return Period length in seconds
    function _period() internal pure virtual returns (uint64);

    /// @notice Funds the employer's vault for `token` with `amount`
    /// @param token The token to fund
    /// @param amount Amount to pull
    function _fund(IERC20 token, uint256 amount) internal {
        vm.prank(employer);
        payroll.fundVault(token, amount);
    }

    /// @notice Creates a stream from the employer to alice
    /// @param token The token to pay in
    /// @param monthly Monthly salary
    /// @return id The new stream id
    function _createStream(IERC20 token, uint256 monthly) internal returns (uint256 id) {
        vm.prank(employer);
        id = payroll.createStream(alice, token, monthly);
    }

    /// @notice Warps to the start of the next pay period, so a payroll run funds a full period
    function _warpToPeriodStart() internal {
        vm.warp(payroll.periodEnd(uint64(vm.getBlockTimestamp())));
    }

    /// @notice Runs payroll as the employer for one stream
    /// @param token The token to pay in
    /// @param budget Most to set aside
    /// @param id The stream to fund
    function _runPayroll(IERC20 token, uint256 budget, uint256 id) internal {
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _runPayroll(token, budget, ids);
    }

    /// @notice Runs payroll as the employer for several streams, funded in order
    /// @param token The token to pay in
    /// @param budget Most to set aside
    /// @param ids The streams to fund
    function _runPayroll(IERC20 token, uint256 budget, uint256[] memory ids) internal {
        vm.prank(employer);
        payroll.runPayroll(token, budget, ids);
    }

    /// @notice Creates an Active stream at the start of a period, funds the vault and the whole period
    /// @param token The token to pay in
    /// @param monthly Monthly salary, also the vault funding and payroll budget
    /// @return id The new stream id
    function _createFundedStream(IERC20 token, uint256 monthly) internal returns (uint256 id) {
        _warpToPeriodStart();
        _fund(token, monthly);
        id = _createStream(token, monthly);
        _runPayroll(token, monthly, id);
    }

    /// @notice Withdraws `amount` from stream `id` as alice
    /// @param id The stream
    /// @param amount Amount requested
    function _withdraw(uint256 id, uint256 amount) internal {
        vm.prank(alice);
        payroll.withdraw(id, amount);
    }

    /// @notice Mints `amount` of an 18-decimal token to the employer
    /// @param token The token
    /// @param amount The amount
    function _mint(DemoToken token, uint256 amount) internal {
        token.mint(employer, amount);
    }
}
