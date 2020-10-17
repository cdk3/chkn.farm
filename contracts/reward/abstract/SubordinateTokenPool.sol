pragma solidity 0.6.12;

import "../interfaces/ITokenPool.sol";
import "../interfaces/ISubordinatePool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// A TokenPool that is subordinate to another, waiting for cues on when to unlock
// and such. Most view functions are passed to the manager.
abstract contract SubordinateTokenPool is ISubordinatePool, ITokenPool {
  using SafeMath for uint256;

  bool public override tokenPoolSet;
  address public override tokenPool;
  address public tokenPoolSetter;

  uint256 public override milestone;

  constructor() public {
    tokenPoolSetter = msg.sender;
    _setTokenPool(address(0));
  }

  modifier onlyManager() {
    require(tokenPool == msg.sender, "SubordinatePool::onlyManager: caller is not the ManagingTokenPool");
    _;
  }

  modifier onlyTokenPoolSetter() {
    require(tokenPoolSetter == msg.sender, "SubordinatePool::onlyTokenPoolSetter: caller is not the tokenPoolSetter");
    _;
  }

  function setTokenPoolSetter(address _tokenPoolSetter) public onlyTokenPoolSetter {
    tokenPoolSetter = _tokenPoolSetter;
  }

  function setTokenPool(address _tokenPool) public onlyTokenPoolSetter {
    require(_tokenPool == address(0) || milestone == ITokenPool(_tokenPool).milestone(),
      'SubordinatePool::setTokenPool: milestones must match');
    _setTokenPool(_tokenPool);
  }

  function _setTokenPool(address _tokenPool) internal {
    tokenPoolSet = _tokenPool != address(0);
    tokenPool = _tokenPool;
    emit SetTokenPool(tokenPool);
  }

  function _beforeUnlock() internal virtual { }

  function _unlock() internal virtual {
    milestone = milestone.add(1);
  }

  function _afterUnlock() internal virtual { }

  // ISubordinatePool
  function beforeUnlockAsSubordinate() external virtual override onlyManager {
    // this is our only easy chance to emit the Milestone event, so do it now
    ITokenPool manager = ITokenPool(tokenPool);
    uint _start = manager.milestoneStart();
    uint _goal = manager.milestoneGoal();
    uint _amount = manager.milestoneProgress();
    emit Milestone(milestone, _start, _goal, _amount);

    _beforeUnlock();
  }

  function unlockAsSubordinate() external virtual override onlyManager {
    _unlock();
  }

  function afterUnlockAsSubordinate() external virtual override onlyManager {
    _afterUnlock();
  }

  // Pool information
  function token() public override view returns (IERC20) {
    return ITokenPool(tokenPool).token();
  }

  function milestoneStart() public override view returns (uint256) {
    return ITokenPool(tokenPool).milestoneStart();
  }

  function milestoneGoal() public override view returns (uint256) {
    return ITokenPool(tokenPool).milestoneGoal();
  }

  function milestoneProgress() public override view returns (uint256) {
    return ITokenPool(tokenPool).milestoneProgress();
  }

  function canUnlock() external override view returns (bool) {
    return ITokenPool(tokenPool).canUnlock();
  }

  function unlock() external override returns (bool) {
    return ITokenPool(tokenPool).unlock();
  }
}
