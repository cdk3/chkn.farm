pragma solidity 0.6.12;

import "./uniswapv2/interfaces/IUniswapV2Router01.sol";
import "./uniswapv2/UniswapV2TokenBuffer.sol";
import "./ChickenHatchery.sol";

// An LP TokenBuffer for the ChickenHatchery, directly named for easier reference
// in migration and libraries.
contract ChickenHatcheryTokenBuffer is UniswapV2TokenBuffer {
    constructor(IUniswapV2Factory _factory, address _hatchery, address _chicken, address _weth)
    UniswapV2TokenBuffer(_factory, _hatchery, _chicken, _weth) public {
      
    }
}
