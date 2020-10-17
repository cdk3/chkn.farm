pragma solidity 0.6.12;

import "../uniswapv2/UniswapV2TokenBufferRedirectable.sol";

// An LP TokenBuffer for the RewardPool.
// Redirectable, just in case it takes time to get the MasterTokenPool
// up and fully tested.

contract RewardPoolTokenBuffer is UniswapV2TokenBufferRedirectable {
  constructor(IUniswapV2Factory _factory, address _poolOrZero, address _token, address _weth)
  UniswapV2TokenBufferRedirectable(_factory, _poolOrZero, _token, _weth) public {

  }
}
