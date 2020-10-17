pragma solidity 0.6.12;

import '../uniswapv2/libraries/UniswapV2Library.sol';

contract MockUniswapV2Library {
  function pairFor(address factory, address tokenA, address tokenB) public pure returns (address) {
    return UniswapV2Library.pairFor(factory, tokenA, tokenB);
  }
}
