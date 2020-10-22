pragma solidity 0.6.12;

import "../abstract/SubordinateManagingPool.sol";
import "../abstract/TokenSender.sol";
import "../interfaces/ITokenPool.sol";

contract MockSubordinateManagingTokenPool is SubordinateManagingPool, TokenSender, ITokenPool {

  IERC20 public override token;
  uint256 public override milestone;
  uint256 public override milestoneProgress;

  uint256 public milestoneLength;

  constructor(IERC20 _token, uint256 _milestone, uint256 _milestoneLength, address[] memory _pools)
  SubordinateManagingPool(_pools)
  public {
    token = _token;
    milestone = _milestone;
    milestoneLength = _milestoneLength;
  }

  // Mock Features
  function setProgress(uint256 _progress) external {
    milestoneProgress = _progress;
  }

  function addProgress(uint256 _progress) external {
    milestoneProgress = _progress;
  }

  function _unlock() internal override {
    milestone = milestone + 1;
    _safeTransfer(address(token), pools[0], token.balanceOf(address(this)));

    SubordinateManagingPool._unlock();
  }

  function _afterUnlock() internal override {
    milestoneProgress = 0;

    SubordinateManagingPool._afterUnlock();
  }

  // TokenPool
  function milestoneStart() public override view returns (uint256) {
    return 0;
  }

  function milestoneGoal() public override view returns (uint256) {
    return milestoneLength;
  }

  function canUnlock() public override virtual view returns (bool) {
    return milestoneProgress >= milestoneLength;
  }

  function unlock() public override virtual returns (bool _unlocked) {
    _unlocked = canUnlock();
    if (_unlocked) {
      uint _milestone = milestone;
      uint _start = milestoneStart();
      uint _goal = milestoneGoal();
      uint _amount = milestoneProgress;
      _beforeUnlock();
      _unlock();
      _afterUnlock();
      emit Milestone(_milestone, _start, _goal, _amount);
    }
  }
}
