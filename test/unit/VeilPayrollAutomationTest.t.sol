// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {VeilPayrollAutomation} from "src/VeilPayrollAutomation.sol";
import {IReceiver} from "src/interfaces/IReceiver.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilPayrollAutomationTest
 * @author Kelechi Kizito Ugwu
 * @notice Unit tests for `VeilPayrollAutomation`, the CRE receiver that runs an employer's payroll.
 * @dev `forwarder` stands in for the CRE forwarder. Alice earns 3,000 USDC a month.
 */
contract VeilPayrollAutomationTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Alice's monthly salary
    uint256 internal constant MONTHLY = 3000e6;

    /// @notice The automation's budget cap
    uint256 internal constant MAX_BUDGET = 5000e6;

    /// @notice Stands in for the CRE forwarder
    address internal forwarder = makeAddr("forwarder");

    /// @notice The workflow owner the employer approves
    address internal author = makeAddr("author");

    /// @notice The receiver under test
    VeilPayrollAutomation internal automation;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the employer's automation and allows it as payroll operator
    function setUp() public override {
        super.setUp();
        vm.startPrank(employer);
        automation = new VeilPayrollAutomation(address(payroll), address(usdc), forwarder, MAX_BUDGET);
        payroll.setPayrollOperator(address(automation), true);
        vm.stopPrank();
    }

    /// @notice A 30-day period
    /// @return Seconds
    function _period() internal pure override returns (uint64) {
        return 30 days;
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice A report funding `ids` with `budget`
    /// @param budget The proposed budget
    /// @param ids The streams
    /// @return The ABI-encoded report
    function _report(uint256 budget, uint256[] memory ids) internal pure returns (bytes memory) {
        return abi.encode(budget, ids);
    }

    /// @notice CRE metadata: workflow id, 10-byte name, owner, then a 2-byte report id
    /// @param owner The workflow owner
    /// @return The packed metadata
    function _metadata(address owner) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes10("veilpayrl"), owner, bytes2(0x0001));
    }

    /// @notice One stream id in an array
    /// @param id The stream
    /// @return ids The array
    function _ids(uint256 id) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    /*//////////////////////////////////////////////////////////////
                                 TESTS
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. A forwarder report runs payroll for the employer, from the employer's vault
    function test_onReport_runsPayroll() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createStream(usdc, MONTHLY);

        vm.expectEmit(address(automation));
        emit VeilPayrollAutomation.ReportProcessed(MONTHLY, 1);
        vm.prank(forwarder);
        automation.onReport(_metadata(author), _report(MONTHLY, _ids(id)));

        assertEq(payroll.getStream(id).allocated, MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - MONTHLY);
    }

    /// @notice 2. The owner's cap wins over the report's budget
    function test_onReport_capsBudget() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 first = _createStream(usdc, MONTHLY);
        uint256 second = _createStream(usdc, MONTHLY);
        uint256[] memory ids = new uint256[](2);
        ids[0] = first;
        ids[1] = second;

        vm.prank(forwarder);
        automation.onReport(_metadata(author), _report(type(uint256).max, ids));

        assertEq(payroll.getStream(first).allocated, MONTHLY);
        assertEq(payroll.getStream(second).allocated, MAX_BUDGET - MONTHLY);
        assertEq(payroll.vaultOf(employer, usdc), EMPLOYER_USDC - MAX_BUDGET);
    }

    /// @notice 3. Only the forwarder delivers
    function test_onReport_revertsForOtherSenders() public {
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(VeilPayrollAutomation.VeilPayrollAutomation__InvalidSender.selector, bob)
        );
        automation.onReport(_metadata(author), _report(MONTHLY, _ids(1)));
    }

    /// @notice 4. With an expected author set, only that workflow owner's reports are accepted
    function test_onReport_checksAuthor() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createStream(usdc, MONTHLY);
        vm.prank(employer);
        automation.setExpectedAuthor(author);

        vm.prank(forwarder);
        vm.expectRevert(
            abi.encodeWithSelector(VeilPayrollAutomation.VeilPayrollAutomation__InvalidAuthor.selector, bob)
        );
        automation.onReport(_metadata(bob), _report(MONTHLY, _ids(id)));

        vm.prank(forwarder);
        vm.expectRevert(VeilPayrollAutomation.VeilPayrollAutomation__BadMetadata.selector);
        automation.onReport(hex"01", _report(MONTHLY, _ids(id)));

        vm.prank(forwarder);
        automation.onReport(_metadata(author), _report(MONTHLY, _ids(id)));
        assertEq(payroll.getStream(id).allocated, MONTHLY);
    }

    /// @notice 5. A report can't reach another employer's streams, or run once the operator is revoked
    function test_onReport_staysInsideThePayer() public {
        _fund(usdc, EMPLOYER_USDC);
        _warpToPeriodStart();
        uint256 id = _createStream(usdc, MONTHLY);

        vm.prank(bob);
        payroll.createOrg("Bob Ltd");
        usdc.mint(bob, MONTHLY);
        vm.startPrank(bob);
        usdc.approve(address(payroll), MONTHLY);
        payroll.fundVault(usdc, MONTHLY);
        uint256 bobs = payroll.createStream(alice, usdc, MONTHLY);
        vm.stopPrank();

        vm.prank(forwarder);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotPayer.selector);
        automation.onReport(_metadata(author), _report(MONTHLY, _ids(bobs)));

        vm.prank(employer);
        payroll.setPayrollOperator(address(automation), false);
        vm.prank(forwarder);
        vm.expectRevert(VeilPayroll.VeilPayroll__NotOperator.selector);
        automation.onReport(_metadata(author), _report(MONTHLY, _ids(id)));
    }

    /// @notice 6. Only the owner changes the cap or the author; setup checks and ERC165
    function test_adminAndSetup() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        automation.setMaxBudget(1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        automation.setExpectedAuthor(bob);

        vm.prank(employer);
        automation.setMaxBudget(1);
        assertEq(automation.maxBudget(), 1);
        assertEq(automation.PAYER(), employer);

        assertTrue(automation.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(automation.supportsInterface(type(IERC165).interfaceId));
        assertFalse(automation.supportsInterface(0xffffffff));

        vm.expectRevert(VeilPayrollAutomation.VeilPayrollAutomation__ZeroAddress.selector);
        new VeilPayrollAutomation(address(payroll), address(usdc), address(0), MAX_BUDGET);
    }
}
