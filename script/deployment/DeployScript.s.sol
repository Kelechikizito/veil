// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DemoToken} from "src/DemoToken.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {EmployeeRegistry} from "src/EmployeeRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {JoinRequests} from "src/JoinRequests.sol";
import {StealthRegistry} from "src/StealthRegistry.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DeployScript
 * @author Kelechi Kizito Ugwu
 * @notice Deploys and wires every Veil contract, plus a demo USDC anyone can mint.
 * @dev Signer comes from `--account`, never from a private key in env. Writes `deployments/<chainId>.json`.
 *      Env: `DEMO_PERIOD` (optional, seconds; default 30 days).
 *      `deploy` is public so fork tests can run the exact same wiring without broadcasting.
 */
contract DeployScript is Script {
    /*//////////////////////////////////////////////////////////////
                           TYPE DECLARATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Every deployed address
    struct Deployment {
        address usdc;
        address auditRegistry;
        address approvalPolicy;
        address payroll;
        address employeeRegistry;
        address incomeCredential;
        address joinRequests;
        address stealthRegistry;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys, wires, and writes the addresses to `deployments/<chainId>.json`
    /// @dev Writes only on `--broadcast`, so a dry run never leaves fake addresses on disk
    /// @return d The deployed addresses
    function run() external returns (Deployment memory d) {
        uint64 period = uint64(vm.envOr("DEMO_PERIOD", uint256(30 days)));

        vm.startBroadcast();
        d = deploy(period);
        vm.stopBroadcast();

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(d, period);
    }

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys and wires everything. The caller (broadcaster or test) becomes payroll's owner.
    /// @param period Length of one pay period in seconds
    /// @return d The deployed addresses
    function deploy(uint64 period) public returns (Deployment memory d) {
        d.usdc = address(new DemoToken("USD Coin", "USDC", 6));
        d.auditRegistry = address(new AuditRegistry());
        d.approvalPolicy = address(new ApprovalPolicy());
        d.payroll = address(new VeilPayroll(d.approvalPolicy, period));
        d.employeeRegistry = address(new EmployeeRegistry());
        d.incomeCredential = address(new IncomeCredential(d.payroll, d.employeeRegistry));
        d.joinRequests = address(new JoinRequests(d.payroll));
        d.stealthRegistry = address(new StealthRegistry());

        VeilPayroll(d.payroll).addToken(IERC20(d.usdc));
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Writes the addresses to `deployments/<chainId>.json`
    /// @param d The deployed addresses
    /// @param period The pay period used
    function _write(Deployment memory d, uint64 period) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "period", period);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "usdc", d.usdc);
        vm.serializeAddress(k, "auditRegistry", d.auditRegistry);
        vm.serializeAddress(k, "approvalPolicy", d.approvalPolicy);
        vm.serializeAddress(k, "payroll", d.payroll);
        vm.serializeAddress(k, "employeeRegistry", d.employeeRegistry);
        vm.serializeAddress(k, "incomeCredential", d.incomeCredential);
        vm.serializeAddress(k, "joinRequests", d.joinRequests);
        string memory json = vm.serializeAddress(k, "stealthRegistry", d.stealthRegistry);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
