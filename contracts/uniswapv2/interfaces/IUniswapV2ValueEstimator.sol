pragma solidity >=0.5.0;

// Use swap contracts to estimate the total value of the tokens and amounts
// specified, relative to some reference token.
interface IUniswapV2ValueEstimator {
    function estimateValueETH(address[] calldata _tokens, uint256[] calldata _values) external view returns (uint256 _value);
    function estimateValue(address[] calldata _tokens, uint256[] calldata _values, address referenceToken) external view returns (uint256 _value);
}
