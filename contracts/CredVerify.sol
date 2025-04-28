// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./ReputationNFT.sol";

contract CredVerify is Ownable, ReentrancyGuard {
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate

    // track approved stablecoins
    mapping(address => bool) public approvedStablecoins;
    address[] public approvedStablecoinsList;

    // Events
    event StablecoinStatusChanged(address indexed stablecoin, bool approved);

    constructor() Ownable(msg.sender) {}

    /**
     * @dev Approves or disapproves a stablecoin for use as collateral
     * @param _stablecoin The address of the stablecoin contract
     * @param _status Whether the stablecoin is approved (true) or not (false)
     */
    function setStablecoinApproval(
        address _stablecoin,
        bool _status
    ) external onlyOwner {
        require(
            _stablecoin != address(0),
            "CollateralManager: invalid stablecoin address"
        );

        bool previousStatus = approvedStablecoins[_stablecoin];
        
        // If status is changing
        if (previousStatus != _status) {
            approvedStablecoins[_stablecoin] = _status;
            
            if (_status) {
                // Add to list if being approved
                approvedStablecoinsList.push(_stablecoin);
            } else {
                // Remove from list if being disapproved
                for (uint256 i = 0; i < approvedStablecoinsList.length; i++) {
                    if (approvedStablecoinsList[i] == _stablecoin) {
                        approvedStablecoinsList[i] = approvedStablecoinsList[approvedStablecoinsList.length - 1];
                        approvedStablecoinsList.pop();
                        break;
                    }
                }
            }
            
            // Emit event
            emit StablecoinStatusChanged(_stablecoin, _status);
        }
    }

    /**
     * @dev Checks if a stablecoin is approved for use as collateral
     * @param _stablecoin The address of the stablecoin contract
     * @return Whether the stablecoin is approved
     */
    function isStablecoinApproved(
        address _stablecoin
    ) public view returns (bool) {
        return approvedStablecoins[_stablecoin];
    }

    /**
     * @dev Returns the list of approved stablecoins
     * @return An array of addresses of approved stablecoins
     */
    function getApprovedStablecoins() public view returns (address[] memory) {
        return approvedStablecoinsList;
    }
}