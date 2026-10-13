// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IReceiver
 * @author Kelechi Kizito Ugwu
 * @notice Chainlink CRE's report receiver: the forwarder delivers each signed workflow report here.
 * @dev Matches the interface in Chainlink's CRE consumer-contract guide. Implementations must report
 *      support for it through ERC165.
 */
interface IReceiver is IERC165 {
    /// @notice Handles a report from a CRE workflow, delivered by the forwarder
    /// @param metadata Workflow id (32 bytes), name (10 bytes) and owner (20 bytes), packed; then the report id
    /// @param report The ABI-encoded payload the workflow produced
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
