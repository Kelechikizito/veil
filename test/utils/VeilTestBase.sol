// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {Test} from "forge-std/Test.sol";
import {DemoToken} from "src/DemoToken.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title VeilTestBase
 * @author Kelechi Kizito Ugwu
 * @notice Shared setup for every Veil test: tokens and actors.
 */
abstract contract VeilTestBase is Test {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice 6-decimal stablecoins, and an 18-decimal token
    DemoToken internal usdc;
    DemoToken internal eurc;
    DemoToken internal weth;

    /// @notice Actors
    address internal employer = makeAddr("employer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    /*//////////////////////////////////////////////////////////////
                                 SETUP
    //////////////////////////////////////////////////////////////*/

    /// @notice Deploys the tokens
    function setUp() public virtual {
        usdc = new DemoToken("USD Coin", "USDC", 6);
        eurc = new DemoToken("Euro Coin", "EURC", 6);
        weth = new DemoToken("Wrapped Ether", "WETH", 18);
        vm.label(address(usdc), "USDC");
        vm.label(address(eurc), "EURC");
        vm.label(address(weth), "WETH");
    }
}
