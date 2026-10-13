// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                            IMPORTS
//////////////////////////////////////////////////////////////*/
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title DemoToken
 * @author Kelechi Kizito Ugwu
 * @notice A testnet stablecoin anyone can mint, so the demo needs no faucet.
 * @dev Never deploy to mainnet.
 */
contract DemoToken is ERC20 {
    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice The token's decimals
    uint8 private immutable i_decimals;

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the name, symbol and decimals
    /// @param name_ The token name
    /// @param symbol_ The token symbol
    /// @param decimals_ The token decimals
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        i_decimals = decimals_;
    }

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Mints `amount` to `to`. Anyone can call it.
    /// @param to Who receives the tokens
    /// @param amount How much to mint
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /*//////////////////////////////////////////////////////////////
                      PUBLIC VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the token's decimals
    /// @return The decimals
    function decimals() public view override returns (uint8) {
        return i_decimals;
    }
}
