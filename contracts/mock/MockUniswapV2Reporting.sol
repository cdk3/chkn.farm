pragma solidity 0.6.12;

import '../uniswapv2/interfaces/IUniswapV2Router01.sol';

contract MockUniswapV2Reporting {
    event AddLiquidity(address user, address tokenA, uint256 amountA, address tokenB, uint256 amountB, bytes32 referrer);
    event AddLiquidityETH(address user, address token, uint256 amountToken, uint256 amountETH, bytes32 referrer);

    function addedLiquidity(address _user, address _tokenA, uint256 _amountA, address _tokenB, uint256 _amountB, bytes32 _referrer) external {
      emit AddLiquidity(_user, _tokenA, _amountA, _tokenB, _amountB, _referrer);
    }

    function addedLiquidityETH(address _user, address _token, uint256 _amountToken, uint256 _amountETH, bytes32 _referrer) external {
      emit AddLiquidityETH(_user, _token, _amountToken, _amountETH, _referrer);
    }
}
