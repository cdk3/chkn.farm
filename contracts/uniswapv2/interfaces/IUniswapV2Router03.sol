pragma solidity >=0.6.2;

import './IUniswapV2Router02.sol';

// Add referrer-reporting addLiquidity functions.
interface IUniswapV2Router03 is IUniswapV2Router02 {
    function addLiquidityWithReferrer(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        bytes32 referrer,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function addLiquidityETHWithReferrer(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        bytes32 referrer,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}
