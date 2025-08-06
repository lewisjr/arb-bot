// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IFlashLoanReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

contract FlashLoanArbitrage is IFlashLoanReceiver {
    address public owner;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor(address _addressProvider) {
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(ADDRESSES_PROVIDER.getPool());
        owner = msg.sender;
    }

    /// @notice Initiates a flash loan
    function executeFlashLoan(
        address asset,
        uint256 amount
    ) external onlyOwner {
        address;
        uint256;
        uint256;

        assets[0] = asset;
        amounts[0] = amount;
        interestModes[0] = 0; // 0 = no debt (flash loan mode)

        POOL.flashLoan(
            address(this), // ReceiverAddress
            assets, // assets
            amounts, // amounts
            interestModes, // interestRateModes
            address(this), // onBehalfOf
            "", // params
            0 // referralCode
        );
    }

    /// @notice Called by Aave after loan is granted
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata /* params */
    ) external override returns (bool) {
        require(msg.sender == address(POOL), "Untrusted lender");
        require(initiator == address(this), "Untrusted initiator");

        // TODO: Arbitrage logic goes here (external calls or bot-triggered trades)

        // Repay loan + premium
        for (uint i = 0; i < assets.length; i++) {
            uint256 totalRepayment = amounts[i] + premiums[i];
            IERC20(assets[i]).approve(address(POOL), totalRepayment);
        }

        return true;
    }

    /// @notice Withdraw tokens manually
    function withdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No balance to withdraw");
        IERC20(token).transfer(owner, balance);
    }

    /// @notice Receive native token (e.g., MATIC or ETH)
    receive() external payable {}
}
