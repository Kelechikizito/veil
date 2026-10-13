// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/*//////////////////////////////////////////////////////////////
                INTERFACES, LIBRARIES, CONTRACT
//////////////////////////////////////////////////////////////*/

/**
 * @title StealthRegistry
 * @author Kelechi Kizito Ugwu
 * @notice Maps a wallet to its stealth meta-address, so an employer can pay it at a fresh address each time.
 * @dev The core of ERC-6538, without signature registration. Scheme 1 is secp256k1 with view tags (ERC-5564):
 *      the meta-address is the 33-byte compressed spending key followed by the 33-byte compressed viewing key.
 *      Publishing it reveals nothing: only the viewing key's owner can tell which payments are theirs.
 */
contract StealthRegistry {
    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    /// @notice Thrown when a scheme-1 meta-address isn't 66 bytes
    error StealthRegistry__BadMetaAddress();

    /*//////////////////////////////////////////////////////////////
                            STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-5564 scheme 1: secp256k1 with view tags
    uint256 public constant SCHEME_SECP256K1 = 1;

    /// @notice Length of a scheme-1 meta-address: two compressed public keys
    uint256 private constant META_ADDRESS_LENGTH = 66;

    /// @notice Each wallet's meta-address, per scheme
    mapping(address registrant => mapping(uint256 schemeId => bytes metaAddress)) private s_metaAddresses;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a wallet sets or replaces its meta-address (ERC-6538)
    /// @param registrant The wallet
    /// @param schemeId The stealth scheme
    /// @param stealthMetaAddress The meta-address
    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the caller's meta-address for a scheme
    /// @param schemeId The stealth scheme; 1 for secp256k1
    /// @param stealthMetaAddress The meta-address
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        if (schemeId == SCHEME_SECP256K1 && stealthMetaAddress.length != META_ADDRESS_LENGTH) {
            revert StealthRegistry__BadMetaAddress();
        }
        s_metaAddresses[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /*//////////////////////////////////////////////////////////////
                      EXTERNAL VIEW/PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns a wallet's meta-address for a scheme, or empty bytes
    /// @param registrant The wallet
    /// @param schemeId The stealth scheme
    /// @return The meta-address
    function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory) {
        return s_metaAddresses[registrant][schemeId];
    }
}
