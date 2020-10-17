pragma solidity 0.6.12;

// A TokenPool that is subordinate to another, which manages it.
interface ISubordinatePool {
  event SetTokenPool(address indexed pool);

  function tokenPoolSet() external view returns (bool);
  function tokenPool() external view returns (address);

  // Called by the managing token pool to unlock subordinate pools in their current state.
  function beforeUnlockAsSubordinate() external;
  function unlockAsSubordinate() external;
  function afterUnlockAsSubordinate() external;
}
