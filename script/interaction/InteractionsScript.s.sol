// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ApprovalPolicy} from "src/ApprovalPolicy.sol";
import {AuditRegistry} from "src/AuditRegistry.sol";
import {DemoToken} from "src/DemoToken.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {VeilPayrollAutomation} from "src/VeilPayrollAutomation.sol";
import {EmployeeRegistry} from "src/EmployeeRegistry.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title InteractionsScript
 * @author Kelechi Kizito Ugwu
 * @notice Every call into a live Veil deployment, one function each, run with `--sig`.
 * @dev Reads addresses from `deployments/<chainId>.json`. The signer comes from `--account`.
 *      Amounts are raw integers in USDC's 6 decimals. See the Makefile for the `make` target per function.
 */
contract InteractionsScript is Script {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when this chain has no deployments/<chainId>.json
    error InteractionsScript__NotDeployed(uint256 chainId);

    /*//////////////////////////////////////////////////////////////
                               DEMO MONEY
    //////////////////////////////////////////////////////////////*/

    /// @notice Mints demo USDC to the signer. Anyone can mint it.
    /// @param amount Amount in USDC's 6 decimals, e.g. 10000e6
    function mintDemo(uint256 amount) external {
        vm.startBroadcast();
        DemoToken(_addr("usdc")).mint(msg.sender, amount);
        vm.stopBroadcast();
        console.log("Minted USDC (6 dp):", amount);
    }

    /*//////////////////////////////////////////////////////////////
                             EMPLOYER SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Registers the signer as an employer
    /// @param name Org name shown on credentials
    function createOrg(string calldata name) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).createOrg(name);
        vm.stopBroadcast();
        console.log("Created org:", name);
    }

    /// @notice Approves payroll and moves the signer's USDC into their vault
    /// @param amount Amount in USDC's 6 decimals
    function fundVault(uint256 amount) external {
        VeilPayroll payroll = VeilPayroll(_addr("payroll"));
        IERC20 usdc = IERC20(_addr("usdc"));
        vm.startBroadcast();
        usdc.approve(address(payroll), amount);
        payroll.fundVault(usdc, amount);
        vm.stopBroadcast();
        console.log("Funded vault (6 dp):", amount);
    }

    /// @notice Adds an auditor to the signer's books
    /// @param auditor The auditor's address
    function addAuditor(address auditor) external {
        vm.startBroadcast();
        AuditRegistry(_addr("auditRegistry")).addAuditor(auditor);
        vm.stopBroadcast();
        console.log("Added auditor:", auditor);
    }

    /// @notice Removes an auditor
    /// @param auditor The auditor's address
    function removeAuditor(address auditor) external {
        vm.startBroadcast();
        AuditRegistry(_addr("auditRegistry")).removeAuditor(auditor);
        vm.stopBroadcast();
        console.log("Removed auditor:", auditor);
    }

    /// @notice Sets the signer's k-of-n approvers
    /// @param approvers Approver addresses, e.g. "[0xabc...,0xdef...]"
    /// @param required How many approvals a stream above the threshold needs
    function setPolicy(address[] calldata approvers, uint8 required) external {
        vm.startBroadcast();
        ApprovalPolicy(_addr("approvalPolicy")).setPolicy(approvers, required);
        vm.stopBroadcast();
        console.log("Policy set. Approvers:", approvers.length);
        console.log("Required:", required);
    }

    /// @notice Sets the monthly USDC salary above which a stream needs approvals
    /// @param threshold Amount in USDC's 6 decimals
    function setThreshold(uint256 threshold) external {
        vm.startBroadcast();
        ApprovalPolicy(_addr("approvalPolicy")).setThreshold(_addr("usdc"), threshold);
        vm.stopBroadcast();
        console.log("Threshold set (6 dp):", threshold);
    }

    /*//////////////////////////////////////////////////////////////
                                STREAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Starts a USDC salary stream from the signer to `payee`
    /// @param payee The worker
    /// @param monthly Monthly salary in USDC's 6 decimals
    function createStream(address payee, uint256 monthly) external {
        vm.startBroadcast();
        uint256 id = VeilPayroll(_addr("payroll")).createStream(payee, IERC20(_addr("usdc")), monthly);
        vm.stopBroadcast();
        console.log("Created stream:", id);
    }

    /// @notice Funds this period for every Active USDC stream of the signer not yet funded
    /// @param budget Most to set aside, in USDC's 6 decimals
    function runPayroll(uint256 budget) external {
        VeilPayroll payroll = VeilPayroll(_addr("payroll"));
        IERC20 usdc = IERC20(_addr("usdc"));
        uint256[] memory ids = _fundable(payroll, usdc, msg.sender);
        vm.startBroadcast();
        payroll.runPayroll(usdc, budget, ids);
        vm.stopBroadcast();
        console.log("Ran payroll for streams:", ids.length);
    }

    /// @notice Deploys a CRE receiver that runs the signer's USDC payroll, and allows it as payroll operator
    /// @dev Use Monad testnet's MockKeystoneForwarder for `cre workflow simulate --broadcast`, and the
    ///      KeystoneForwarder for a deployed workflow
    /// @param forwarder The CRE forwarder allowed to deliver reports
    /// @param maxBudget Most one report may set aside, in USDC's 6 decimals
    function deployAutomation(address forwarder, uint256 maxBudget) external {
        VeilPayroll payroll = VeilPayroll(_addr("payroll"));
        vm.startBroadcast();
        VeilPayrollAutomation automation =
            new VeilPayrollAutomation(address(payroll), _addr("usdc"), forwarder, maxBudget);
        payroll.setPayrollOperator(address(automation), true);
        vm.stopBroadcast();
        console.log("VeilPayrollAutomation:", address(automation));
    }

    /// @notice Withdraws from one of the signer's streams
    /// @param streamId The stream
    /// @param amount Amount in USDC's 6 decimals
    function withdraw(uint256 streamId, uint256 amount) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).withdraw(streamId, amount);
        vm.stopBroadcast();
        console.log("Withdrew (6 dp):", amount);
    }

    /// @notice Approves a pending stream as one of the payer's approvers
    /// @param payer The employer that owns the stream
    /// @param streamId The stream to approve
    function approve(address payer, uint256 streamId) external {
        vm.startBroadcast();
        ApprovalPolicy(_addr("approvalPolicy")).approve(payer, streamId);
        vm.stopBroadcast();
        console.log("Approved stream:", streamId);
    }

    /// @notice Activates a pending stream once it has enough approvals. Anyone can call it.
    /// @param streamId The stream to activate
    function activateApproved(uint256 streamId) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).activateApproved(streamId);
        vm.stopBroadcast();
        console.log("Activated stream:", streamId);
    }

    /// @notice Cancels one of the signer's streams. What accrued before stays withdrawable.
    /// @param streamId The stream to cancel
    function cancelStream(uint256 streamId) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).cancelStream(streamId);
        vm.stopBroadcast();
        console.log("Cancelled stream:", streamId);
    }

    /// @notice Vouches that `worker` works for you. They confirm with a passkey in the app.
    /// @param worker The worker's wallet
    function vouch(address worker) external {
        vm.startBroadcast();
        EmployeeRegistry(_addr("employeeRegistry")).vouch(worker);
        vm.stopBroadcast();
        console.log("Vouched for:", worker);
    }

    /*//////////////////////////////////////////////////////////////
                             OWNER ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Allowlists another token. Payroll owner only.
    /// @param token The token to accept
    function addToken(address token) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).addToken(IERC20(token));
        vm.stopBroadcast();
        console.log("Allowlisted token:", token);
    }

    /// @notice Removes a token from the allowlist. Existing streams keep withdrawing. Payroll owner only.
    /// @param token The token to remove
    function removeToken(address token) external {
        vm.startBroadcast();
        VeilPayroll(_addr("payroll")).removeToken(IERC20(token));
        vm.stopBroadcast();
        console.log("Removed token:", token);
    }

    /*//////////////////////////////////////////////////////////////
                               READ-ONLY
    //////////////////////////////////////////////////////////////*/

    /// @notice Prints the deployment's wiring and an account's state. Sends nothing.
    /// @param who The account to look up
    function status(address who) external view {
        VeilPayroll payroll = VeilPayroll(_addr("payroll"));
        IERC20 usdc = IERC20(_addr("usdc"));

        console.log("Chain:", block.chainid);
        console.log("Payroll:", address(payroll));
        console.log("  period (s):", payroll.PERIOD());
        console.log("  policy wired:", address(payroll.I_APPROVAL_POLICY()) == _addr("approvalPolicy"));
        console.log("  USDC allowlisted:", payroll.s_supportedTokens(usdc));

        console.log("Account:", who);
        IVeilPayroll.Org memory org = payroll.orgOf(who);
        console.log("  org:", org.exists ? org.name : "(none)");
        console.log("  vault USDC (6 dp):", payroll.vaultOf(who, usdc));
        console.log("  streams as payer:", payroll.streamsOfPayer(who).length);
        console.log("  streams as payee:", payroll.streamsOfPayee(who).length);
        console.log("  has policy:", ApprovalPolicy(_addr("approvalPolicy")).hasPolicy(who));
        console.log("  auditors:", AuditRegistry(_addr("auditRegistry")).auditorCount(who));
        console.log("  passkey set:", EmployeeRegistry(_addr("employeeRegistry")).passkeyOf(who).x != bytes32(0));
        console.log("  USDC (6 dp):", usdc.balanceOf(who));
    }

    /*//////////////////////////////////////////////////////////////
                      INTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice The payer's Active streams in `token` not yet funded this period
    /// @param payroll The payroll contract
    /// @param token The token
    /// @param payer The payer
    /// @return ids The stream ids
    function _fundable(VeilPayroll payroll, IERC20 token, address payer) internal view returns (uint256[] memory ids) {
        uint256[] memory all = payroll.streamsOfPayer(payer);
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 end = payroll.periodEnd(uint64(block.timestamp));
        ids = new uint256[](all.length);
        uint256 n;
        for (uint256 i; i < all.length; ++i) {
            IVeilPayroll.Stream memory s = payroll.getStream(all[i]);
            if (s.status == IVeilPayroll.Status.Active && s.token == token && s.allocEnd != end) ids[n++] = all[i];
        }
        assembly ("memory-safe") {
            mstore(ids, n)
        }
    }

    /// @notice Reads one address from deployments/<chainId>.json
    /// @param key The JSON key, e.g. "payroll"
    /// @return The address
    function _addr(string memory key) internal view returns (address) {
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        if (!vm.exists(path)) revert InteractionsScript__NotDeployed(block.chainid);
        return vm.parseJsonAddress(vm.readFile(path), string.concat(".", key));
    }
}
