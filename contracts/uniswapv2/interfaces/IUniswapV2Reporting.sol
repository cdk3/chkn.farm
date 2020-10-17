pragma solidity >=0.5.0;

interface IUniswapV2Reporting {
    function addedLiquidity(address _user, address _tokenA, uint256 _amountA, address _tokenB, uint256 _amountB, bytes32 _referrer) external;
    function addedLiquidityETH(address _user, address _token, uint256 _amountToken, uint256 _amountETH, bytes32 _referrer) external;
}
