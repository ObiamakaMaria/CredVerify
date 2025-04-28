// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./ReputationNFT.sol";

contract CredVerify is Ownable, ReentrancyGuard {
    uint256 public constant LOAN_DURATION = 12; // 12 months
    uint256 public constant APR = 8; // 8% annual interest rate
<<<<<<< HEAD
    uint256 public constant SCORE_BASE = 300; // Starting credit score
    uint256 public constant SCORE_MAX = 850; // Maximum credit score



    struct Loan {
        uint256 amount; // Loan amount (equals collateral)
        uint256 startTime; // Loan start timestamp
        uint256 paymentsMade; // Number of payments completed
        uint256 totalPaid; // Total amount paid (principal + interest)
        bool active; // Loan status
    }



    mapping(address => uint256) public deposits; // User collateral deposits
    mapping(address => Loan) public loans; // User loan details
    mapping(address => uint256) public creditScores; // User credit scores


//EVENTS
    event CollateralDeposited(address indexed user, uint256 amount);
    event LoanCreated(address indexed user, uint256 amount, uint256 monthlyPayment);
    event PaymentMade(address indexed user, uint256 amount, uint256 paymentsRemaining);
    event LoanCompleted(address indexed user, uint256 finalScore);

//CONSTRUCTOR 
  constructor(address _stablecoin) Ownable(msg.sender) {
        stablecoin = IERC20(_stablecoin);
    }

    /// @notice Deposits collateral to start a credit builder loan
    /// @param amount Amount of stablecoins to deposit
    
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(loans[msg.sender].active == false, "Existing loan active");
        stablecoin.transferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount
        emit CollateralDeposited(msg.sender, amount);
    }
=======
>>>>>>> 26424391a2e2e7c351ecd353132d8a61b6a8055b

    // track approved stablecoins
    mapping(address => bool) public approvedStablecoins;
    address[] public approvedStablecoinsList;

<<<<<<< HEAD
=======
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
>>>>>>> 26424391a2e2e7c351ecd353132d8a61b6a8055b
}