// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IFlashLoanSimpleReceiver} from "@aave/core-v3/contracts/flashloan/interfaces/IFlashLoanSimpleReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IOpenOceanExecutor {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address to
    ) external;
}

contract FlashLoanArb is IFlashLoanSimpleReceiver, Ownable {
    IPool public immutable aavePool;
    address public executor;

    constructor(address _aavePool, address _executor) {
        aavePool = IPool(_aavePool);
        executor = _executor;
    }

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
    }

    function executeFlashLoan(
        address asset,
        uint256 amount
    ) external onlyOwner {
        aavePool.flashLoanSimple(address(this), asset, amount, "", 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata
    ) external override returns (bool) {
        require(msg.sender == address(aavePool), "Untrusted lender");
        require(initiator == address(this), "Untrusted initiator");

        // Transfer loaned funds to your swap executor
        IERC20(asset).approve(executor, amount);
        IOpenOceanExecutor(executor).swap(
            asset,
            address(0),
            amount,
            address(this)
        ); // dummy logic

        // Repay Aave
        uint256 totalOwed = amount + premium;
        IERC20(asset).approve(address(aavePool), totalOwed);

        return true;
    }
}
