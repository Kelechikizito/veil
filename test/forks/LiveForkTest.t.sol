// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoToken} from "src/DemoToken.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {JoinRequests} from "src/JoinRequests.sol";
import {DeployScript} from "script/deployment/DeployScript.s.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title LiveForkTest
 * @author Kelechi Kizito Ugwu
 * @notice Runs the deploy script and a full payroll cycle on a Monad testnet fork.
 * @dev Skips itself on any other chain, so plain `forge test` ignores it. Run with:
 *      `forge test --match-path "test/forks/*" --fork-url monad_testnet -vv`
 */
contract LiveForkTest is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Monad testnet
    uint256 internal constant MONAD_TESTNET = 10143;

    /// @notice The deploy script, which owns everything it deploys in this test
    DeployScript internal deployer;

    /// @notice A fresh deployment on the fork
    DeployScript.Deployment internal d;

    /// @notice Pay period for the fresh deployment
    uint64 internal constant PERIOD = 600;

    /// @notice An employer and a worker
    address internal employer = makeAddr("employer");
    address internal alice = makeAddr("alice");

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Skips off-fork; otherwise deploys everything with the real deploy script
    function setUp() public {
        if (block.chainid != MONAD_TESTNET) {
            vm.skip(true);
            return;
        }
        deployer = new DeployScript();
        d = deployer.deploy(PERIOD);
    }

    /*//////////////////////////////////////////////////////////////
                            FRESH DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Everything is wired and owned by the deployer
    function test_fork_wiring() public view {
        VeilPayroll payroll = VeilPayroll(d.payroll);

        assertEq(address(payroll.I_APPROVAL_POLICY()), d.approvalPolicy);
        assertEq(payroll.PERIOD(), PERIOD);
        assertTrue(payroll.s_supportedTokens(IERC20(d.usdc)));
        assertEq(DemoToken(d.usdc).decimals(), 6);

        assertEq(address(IncomeCredential(d.incomeCredential).I_PAYROLL()), d.payroll);
        assertEq(address(IncomeCredential(d.incomeCredential).I_EMPLOYEE_REGISTRY()), d.employeeRegistry);
        assertEq(address(JoinRequests(d.joinRequests).I_PAYROLL()), d.payroll);

        assertEq(Ownable(d.payroll).owner(), address(deployer));
    }

    /// @notice Fund, stream, run payroll, withdraw and issue a credential, on Monad's real execution
    function test_fork_fullCycle() public {
        VeilPayroll payroll = VeilPayroll(d.payroll);
        IERC20 usdc = IERC20(d.usdc);
        DemoToken(d.usdc).mint(employer, 6000e6);

        vm.warp(payroll.periodEnd(uint64(block.timestamp)));
        vm.startPrank(employer);
        payroll.createOrg("Acme");
        usdc.approve(d.payroll, 6000e6);
        payroll.fundVault(usdc, 6000e6);
        uint256 id = payroll.createStream(alice, usdc, 3000e6);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        payroll.runPayroll(usdc, 3000e6, ids);
        vm.stopPrank();

        vm.warp(block.timestamp + PERIOD / 2);
        assertEq(payroll.available(id), 1500e6);
        vm.prank(alice);
        payroll.withdraw(id, 1500e6);
        assertEq(usdc.balanceOf(alice), 1500e6);

        vm.prank(alice);
        uint256 cred = IncomeCredential(d.incomeCredential)
            .issue(id, makeAddr("landlord"), 2500e6, uint64(block.timestamp + 1 hours));
        assertTrue(IncomeCredential(d.incomeCredential).isValid(cred));
        assertTrue(IncomeCredential(d.incomeCredential).get(cred).ok);
    }

    /*//////////////////////////////////////////////////////////////
                            LIVE DEPLOYMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice If this chain has a broadcast deployment, check it is wired the same way
    function test_fork_liveDeploymentIsWired() public {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) {
            vm.skip(true);
            return;
        }
        string memory json = vm.readFile(path);
        address payroll = vm.parseJsonAddress(json, ".payroll");

        assertGt(payroll.code.length, 0);
        assertEq(address(VeilPayroll(payroll).I_APPROVAL_POLICY()), vm.parseJsonAddress(json, ".approvalPolicy"));
        assertTrue(VeilPayroll(payroll).s_supportedTokens(IERC20(vm.parseJsonAddress(json, ".usdc"))));
        assertEq(address(IncomeCredential(vm.parseJsonAddress(json, ".incomeCredential")).I_PAYROLL()), payroll);
    }
}
