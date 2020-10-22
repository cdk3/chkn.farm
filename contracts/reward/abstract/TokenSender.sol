pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";


// handles progress towards specific milestones, measured as token quantities.
// tracks upward movement (deposits) as progress towards the milestone; ignores
// downward movement except to adjust the level from where progress is noted
// at the next deposit.
// if the token balance ever changes, make sure to note it with
// _updateTokenBalance() or _noteTokenBalance(uint256). This is especially important
// before and after any balance _decreases_.
abstract contract TokenSender {
  using SafeMath for uint256;

  bytes4 private constant SELECTOR = bytes4(keccak256(bytes('transfer(address,uint256)')));

  function _safeTransfer(address token, address to, uint value) internal {
      (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
      require(success && (data.length == 0 || abi.decode(data, (bool))), 'UniswapV2: TRANSFER_FAILED');
  }

}
