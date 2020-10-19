pragma solidity 0.6.12;

import "../abstract/SubordinateTokenPool.sol";

contract MockSubordinateTokenPool is SubordinateTokenPool {

  event BeforeUnlockAsSubordinate(uint256 count, uint256 milestone, uint256 balance, uint256 managerBalance);
  event UnlockAsSubordinate(uint256 count, uint256 milestone, uint256 balance, uint256 managerBalance);
  event AfterUnlockAsSubordinate(uint256 count, uint256 milestone, uint256 balance, uint256 managerBalance);

  uint256 subordinateCount;

  constructor()
  public {
    // nothing to do
  }

  function beforeUnlockAsSubordinate() external virtual override onlyManager {
    // this is our only easy chance to emit the Milestone event, so do it now
    ITokenPool manager = ITokenPool(tokenPool);
    uint _start = manager.milestoneStart();
    uint _goal = manager.milestoneGoal();
    uint _amount = manager.milestoneProgress();
    emit Milestone(milestone, _start, _goal, _amount);

    IERC20 _token = token();
    uint256 _milestone = ITokenPool(tokenPool).milestone();
    emit BeforeUnlockAsSubordinate(subordinateCount++, _milestone, _token.balanceOf(address(this)), _token.balanceOf(tokenPool));

    _beforeUnlock();
  }

  function unlockAsSubordinate() external virtual override onlyManager {
    IERC20 _token = token();
    uint256 _milestone = ITokenPool(tokenPool).milestone();
    emit UnlockAsSubordinate(subordinateCount++, _milestone, _token.balanceOf(address(this)), _token.balanceOf(tokenPool));

    _unlock();
  }

  function afterUnlockAsSubordinate() external virtual override onlyManager {
    IERC20 _token = token();
    uint256 _milestone = ITokenPool(tokenPool).milestone();
    emit AfterUnlockAsSubordinate(subordinateCount++, _milestone, _token.balanceOf(address(this)), _token.balanceOf(tokenPool));

    _afterUnlock();
  }


}
