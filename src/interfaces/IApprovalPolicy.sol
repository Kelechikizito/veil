// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title IApprovalPolicy
 * @author Kelechi Kizito Ugwu
 * @notice Per-payer k-of-n approver set plus a monthly threshold per token.
 * @dev Salaries above the threshold need k approvals before payroll activates them.
 */
interface IApprovalPolicy {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when a payer sets or replaces their policy
    /// @param payer The payer that owns the policy
    /// @param required Number of approvals needed
    /// @param approverCount Number of approvers in the set
    event PolicySet(address indexed payer, uint8 required, uint256 approverCount);

    /// @notice Emitted when a payer sets or replaces their threshold for one token
    /// @param payer The payer that owns the policy
    /// @param token The token the threshold applies to
    /// @param threshold The monthly threshold
    event ThresholdSet(address indexed payer, address indexed token, uint256 threshold);

    /// @notice Emitted when an approver signs off on a pending stream
    /// @param payer The payer that owns the stream
    /// @param streamId The stream being approved
    /// @param approver The approver who signed off
    /// @param count Approvals so far, including this one
    event Approved(address indexed payer, uint256 indexed streamId, address indexed approver, uint8 count);

    /*//////////////////////////////////////////////////////////////
                           EXTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the caller's approver set
    /// @param approvers Addresses allowed to approve
    /// @param required Approvals needed; must be > 0 and <= approvers.length
    function setPolicy(address[] calldata approvers, uint8 required) external;

    /// @notice Sets the caller's monthly threshold for one token
    /// @param token The token the threshold applies to
    /// @param threshold Monthly threshold in the token's units
    function setThreshold(address token, uint256 threshold) external;

    /// @notice Records the caller's approval of a pending stream
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to approve
    function approve(address payer, uint256 streamId) external;

    /*//////////////////////////////////////////////////////////////
                         VIEW & PURE FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns how many approvals a stream has
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to look up
    /// @return The approval count
    function approvalCount(address payer, uint256 streamId) external view returns (uint8);

    /// @notice Returns how many approvals the payer's policy requires
    /// @param payer The payer to look up
    /// @return The required approval count
    function required(address payer) external view returns (uint8);

    /// @notice Checks whether the payer has set a policy
    /// @param payer The payer to look up
    /// @return True if a policy exists
    function hasPolicy(address payer) external view returns (bool);

    /// @notice Checks whether the payer has set a threshold for a token
    /// @param payer The payer to look up
    /// @param token The token to look up
    /// @return True if a threshold exists
    function hasThreshold(address payer, address token) external view returns (bool);

    /// @notice Returns the payer's current approvers
    /// @param payer The payer to look up
    /// @return The approver addresses
    function approversOf(address payer) external view returns (address[] memory);

    /// @notice Checks whether an address approves for the payer under the current policy
    /// @param payer The payer to look up
    /// @param who The address to check
    /// @return True if `who` is a current approver
    function isApprover(address payer, address who) external view returns (bool);

    /// @notice Checks whether an approver already approved a stream under the current policy
    /// @param payer The payer that owns the stream
    /// @param streamId The stream to look up
    /// @param who The approver to check
    /// @return True if `who` approved `streamId`
    function hasApproved(address payer, uint256 streamId, address who) external view returns (bool);

    /// @notice Returns the payer's threshold for a token
    /// @param payer The payer to look up
    /// @param token The token to look up
    /// @return The threshold; zero if never set
    function thresholdOf(address payer, address token) external view returns (uint256);

    /// @notice Whether a monthly salary needs approval under the payer's policy
    /// @dev False with no policy. True with a policy but no threshold for `token` (fail closed).
    /// @param payer The payer whose policy applies
    /// @param token The token the stream pays in
    /// @param monthly The monthly salary
    /// @return True if `monthly` is above the threshold
    function needsApproval(address payer, address token, uint256 monthly) external view returns (bool);
}
