pragma solidity 0.6.12;

import "../interfaces/ISubordinatePool.sol";

// A TokenPool that manages subordinate pools, indicating when they should
// unlock and such.
abstract contract SubordinateManagingPool {

  address[] public pools;

  constructor(address[] memory _pools) public {
    pools = _pools;
  }

  function _beforeUnlock() internal virtual {
    // inform subordinates
    for (uint i = 0; i < pools.length; i++) {
      ISubordinatePool(pools[i]).beforeUnlockAsSubordinate();
    }
  }

  function _unlock() internal virtual {
    // inform subordinates
    for (uint i = 0; i < pools.length; i++) {
      ISubordinatePool(pools[i]).unlockAsSubordinate();
    }
  }

  function _afterUnlock() internal virtual {
    // inform subordinates
    for (uint i = 0; i < pools.length; i++) {
      ISubordinatePool(pools[i]).afterUnlockAsSubordinate();
    }
  }
}
