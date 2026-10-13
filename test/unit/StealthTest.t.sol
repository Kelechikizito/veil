// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {EmployeeRegistry} from "src/EmployeeRegistry.sol";
import {IncomeCredential} from "src/IncomeCredential.sol";
import {StealthRegistry} from "src/StealthRegistry.sol";
import {VeilPayroll} from "src/VeilPayroll.sol";
import {IVeilPayroll} from "src/interfaces/IVeilPayroll.sol";
import {PayrollTestBase} from "../utils/PayrollTestBase.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title StealthTest
 * @author Kelechi Kizito Ugwu
 * @notice Stealth payees: the meta-address registry, stealth streams, and relayed withdrawals and credentials.
 * @dev The stealth address is a plain key here; the browser derives it from alice's meta-address (ERC-5564).
 *      Bob plays the relayer: he sends every signed call, so the stealth address never needs gas.
 */
contract StealthTest is PayrollTestBase {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Meta-address registry
    StealthRegistry internal stealthRegistry;

    /// @notice Income credentials
    IncomeCredential internal credential;

    /// @notice The private key of alice's one-time address for this stream
    uint256 internal constant STEALTH_PKEY = 0x5EA1;

    /// @notice Alice's one-time address
    address internal stealth;

    /// @notice A compressed ephemeral public key (shape only; payroll doesn't check the curve)
    bytes internal constant EPHEMERAL = hex"02aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";

    /// @notice Alice's monthly salary
    uint256 internal constant MONTHLY = 3000e6;

    /// @notice A signature deadline far in the future
    uint256 internal deadline;

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the registry and the credential
    function setUp() public override {
        super.setUp();
        stealthRegistry = new StealthRegistry();
        credential = new IncomeCredential(address(payroll), address(new EmployeeRegistry()));
        stealth = vm.addr(STEALTH_PKEY);
        deadline = block.timestamp + 1 days;
    }

    /*//////////////////////////////////////////////////////////////
                           INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc PayrollTestBase
    function _period() internal pure override returns (uint64) {
        return 600;
    }

    /// @notice Creates a funded stealth stream to `stealth` at a period start
    /// @return id The stream id
    function _createFundedStealthStream() internal returns (uint256 id) {
        _warpToPeriodStart();
        _fund(usdc, MONTHLY);
        vm.prank(employer);
        id = payroll.createStealthStream(stealth, usdc, MONTHLY, EPHEMERAL, 0xab);
        _runPayroll(usdc, MONTHLY, id);
    }

    /// @notice Signs a withdrawal as `pkey`
    /// @param pkey The signer
    /// @param id The stream
    /// @param amount The amount
    /// @param to Where the money goes
    /// @param nonce The payee's nonce
    /// @return The 65-byte signature
    function _signWithdraw(uint256 pkey, uint256 id, uint256 amount, address to, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Withdraw(uint256 id,uint256 amount,address to,uint256 nonce,uint256 deadline)"),
                id,
                amount,
                to,
                nonce,
                deadline
            )
        );
        return _sign(pkey, payroll.DOMAIN_SEPARATOR(), structHash);
    }

    /// @notice Signs an EIP-712 struct hash under a domain
    /// @param pkey The signer
    /// @param domainSeparator The domain
    /// @param structHash The struct hash
    /// @return The 65-byte signature
    function _sign(uint256 pkey, bytes32 domainSeparator, bytes32 structHash) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(pkey, keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)));
        return abi.encodePacked(r, s, v);
    }

    /// @notice The credential contract's EIP-712 domain separator
    /// @return The separator
    function _credentialDomain() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Veil IncomeCredential"),
                keccak256("1"),
                block.chainid,
                address(credential)
            )
        );
    }

    /*//////////////////////////////////////////////////////////////
                                REGISTRY
    //////////////////////////////////////////////////////////////*/

    /// @notice 1. A wallet registers its meta-address; scheme 1 must be two compressed keys
    function test_registry() public {
        bytes memory meta = abi.encodePacked(EPHEMERAL, EPHEMERAL);
        vm.expectEmit(true, true, false, true, address(stealthRegistry));
        emit StealthRegistry.StealthMetaAddressSet(alice, 1, meta);
        vm.prank(alice);
        stealthRegistry.registerKeys(1, meta);
        assertEq(stealthRegistry.stealthMetaAddressOf(alice, 1), meta);
        assertEq(stealthRegistry.stealthMetaAddressOf(bob, 1).length, 0);

        vm.prank(alice);
        vm.expectRevert(StealthRegistry.StealthRegistry__BadMetaAddress.selector);
        stealthRegistry.registerKeys(1, EPHEMERAL);
    }

    /*//////////////////////////////////////////////////////////////
                            STEALTH STREAMS
    //////////////////////////////////////////////////////////////*/

    /// @notice 2. A stealth stream pays the one-time address and announces it, ERC-5564 style
    function test_createStealthStream() public {
        vm.expectEmit(true, true, true, true, address(payroll));
        emit IVeilPayroll.Announcement(1, stealth, employer, EPHEMERAL, abi.encodePacked(bytes1(0xab), uint256(1)));
        vm.prank(employer);
        uint256 id = payroll.createStealthStream(stealth, usdc, MONTHLY, EPHEMERAL, 0xab);

        assertEq(payroll.getStream(id).payee, stealth);
        IVeilPayroll.StealthAnnouncement memory a = payroll.announcementOf(id);
        assertEq(a.ephemeralPubKey, EPHEMERAL);
        assertEq(a.viewTag, bytes1(0xab));
        assertEq(payroll.streamCount(), 1);

        uint256 plain = _createStream(usdc, MONTHLY);
        assertEq(payroll.announcementOf(plain).ephemeralPubKey.length, 0);
    }

    /// @notice 3. The ephemeral key must be 33 bytes
    function test_createStealthStream_revertsOnBadKey() public {
        vm.prank(employer);
        vm.expectRevert(VeilPayroll.VeilPayroll__BadEphemeralKey.selector);
        payroll.createStealthStream(stealth, usdc, MONTHLY, hex"02aabb", 0xab);
    }

    /*//////////////////////////////////////////////////////////////
                           RELAYED WITHDRAW
    //////////////////////////////////////////////////////////////*/

    /// @notice 4. The stealth payee signs, the relayer sends, the money goes where the payee chose
    function test_withdrawWithSig() public {
        uint256 id = _createFundedStealthStream();
        vm.warp(block.timestamp + _period() / 2);
        address exchange = makeAddr("exchange");

        bytes memory sig = _signWithdraw(STEALTH_PKEY, id, 1000e6, exchange, 0);
        vm.prank(bob);
        payroll.withdrawWithSig(id, 1000e6, exchange, deadline, sig);

        assertEq(usdc.balanceOf(exchange), 1000e6);
        assertEq(payroll.getStream(id).withdrawn, 1000e6);
        assertEq(payroll.nonces(stealth), 1);
        assertEq(stealth.balance, 0); // never needed gas
    }

    /// @notice 5. A signature works once, only for its exact terms, only from the payee, only before its deadline
    function test_withdrawWithSig_reverts() public {
        uint256 id = _createFundedStealthStream();
        vm.warp(block.timestamp + _period() / 2);
        bytes memory sig = _signWithdraw(STEALTH_PKEY, id, 1000e6, alice, 0);

        // Different amount or destination than signed
        vm.expectRevert(VeilPayroll.VeilPayroll__BadSignature.selector);
        payroll.withdrawWithSig(id, 1001e6, alice, deadline, sig);
        vm.expectRevert(VeilPayroll.VeilPayroll__BadSignature.selector);
        payroll.withdrawWithSig(id, 1000e6, bob, deadline, sig);

        // Someone else's key. Signatures are built before expectRevert: signing reads the domain from payroll.
        bytes memory wrongKey = _signWithdraw(0xBAD, id, 1000e6, alice, 0);
        vm.expectRevert(VeilPayroll.VeilPayroll__BadSignature.selector);
        payroll.withdrawWithSig(id, 1000e6, alice, deadline, wrongKey);

        // Works once, then the nonce has moved on
        payroll.withdrawWithSig(id, 1000e6, alice, deadline, sig);
        vm.expectRevert(VeilPayroll.VeilPayroll__BadSignature.selector);
        payroll.withdrawWithSig(id, 1000e6, alice, deadline, sig);

        // Expired
        bytes memory late = _signWithdraw(STEALTH_PKEY, id, 1, alice, 1);
        vm.warp(deadline + 1);
        vm.expectRevert(VeilPayroll.VeilPayroll__Expired.selector);
        payroll.withdrawWithSig(id, 1, alice, deadline, late);
    }

    /// @notice 6. The usual limits still apply: no more than streamed, never to the zero address
    function test_withdrawWithSig_keepsLimits() public {
        uint256 id = _createFundedStealthStream();
        vm.warp(block.timestamp + _period() / 2);

        bytes memory tooMuch = _signWithdraw(STEALTH_PKEY, id, MONTHLY, alice, 0);
        vm.expectRevert(VeilPayroll.VeilPayroll__ExceedsAvailable.selector);
        payroll.withdrawWithSig(id, MONTHLY, alice, deadline, tooMuch);

        bytes memory toZero = _signWithdraw(STEALTH_PKEY, id, 1, address(0), 0);
        vm.expectRevert(VeilPayroll.VeilPayroll__ZeroAddress.selector);
        payroll.withdrawWithSig(id, 1, address(0), deadline, toZero);
    }

    /*//////////////////////////////////////////////////////////////
                          RELAYED CREDENTIALS
    //////////////////////////////////////////////////////////////*/

    /// @notice 7. The stealth payee issues and revokes a credential by signature, through the relayer
    function test_credentialWithSig() public {
        uint256 id = _createFundedStealthStream();
        address landlord = makeAddr("landlord");
        uint64 expiresAt = uint64(block.timestamp + 1 hours);

        bytes32 issueHash = keccak256(
            abi.encode(
                keccak256(
                    "Issue(uint256 streamId,address verifier,uint256 threshold,uint64 expiresAt,uint256 nonce,uint256 deadline)"
                ),
                id,
                landlord,
                2500e6,
                expiresAt,
                0,
                deadline
            )
        );
        vm.prank(bob);
        uint256 cred = credential.issueWithSig(
            id, landlord, 2500e6, expiresAt, deadline, _sign(STEALTH_PKEY, _credentialDomain(), issueHash)
        );
        assertEq(credential.get(cred).payee, stealth);
        assertTrue(credential.get(cred).ok);
        assertTrue(credential.isValid(cred));

        // A replay of the same signature fails: the nonce moved
        vm.expectRevert(IncomeCredential.IncomeCredential__BadSignature.selector);
        credential.issueWithSig(
            id, landlord, 2500e6, expiresAt, deadline, _sign(STEALTH_PKEY, _credentialDomain(), issueHash)
        );

        bytes32 revokeHash =
            keccak256(abi.encode(keccak256("Revoke(uint256 id,uint256 nonce,uint256 deadline)"), cred, 1, deadline));
        vm.expectRevert(IncomeCredential.IncomeCredential__BadSignature.selector);
        credential.revokeWithSig(cred, deadline, _sign(0xBAD, _credentialDomain(), revokeHash));

        vm.prank(bob);
        credential.revokeWithSig(cred, deadline, _sign(STEALTH_PKEY, _credentialDomain(), revokeHash));
        assertFalse(credential.isValid(cred));
    }
}
