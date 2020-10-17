pragma solidity 0.6.12;

import "../interfaces/ITokenPool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


// handles progress towards specific milestones, measured as token quantities.
// tracks upward movement (deposits) as progress towards the milestone; ignores
// downward movement except to adjust the level from where progress is noted
// at the next deposit.
// if the token balance ever changes, make sure to note it with
// _updateTokenBalance() or _noteTokenBalance(uint256). This is especially important
// before and after any balance _decreases_.
abstract contract DepositMilestoneTokenPool is ITokenPool {
  using SafeMath for uint256;

  // token and balance info
  IERC20 public override token;
  uint256 internal lastTokenBalance;
  uint256 internal lastMilestoneProgress;

  uint256 public override milestone;

  uint256[] public milestones;
  uint256 public milestoneStep;

  constructor (address _token, uint256[] memory _milestones, uint256 _milestoneStep) public {
    token = IERC20(_token);
    milestones = _milestones;
    milestoneStep = _milestoneStep;

    _updateTokenBalance();
  }

  function _updateTokenBalance() internal {
    uint256 balance = token.balanceOf(address(this));
    _noteTokenBalance(balance);
  }

  function _noteTokenBalance(uint256 _balance) internal virtual {
    if  (_balance > lastTokenBalance) {
      lastMilestoneProgress = lastMilestoneProgress.add(_balance).sub(lastTokenBalance);
    }

    if (_balance != lastTokenBalance) {
      lastTokenBalance = _balance;
    }
  }

  function _beforeUnlock() internal virtual {
    // nothing to do
  }

  function _unlock() internal virtual {
    milestone++;
  }

  function _afterUnlock() internal virtual {
    // nothing to do
  }

  // ITokenPool: Milestones

  function milestoneStart() public override view returns (uint256) {
    if (milestone == 0) {
      return 0;
    } else if (milestone < milestones.length) {
      return milestones[milestone - 1];
    } else {
      uint256 base = milestones[milestones.length - 1];
      uint256 steps = milestone.sub(milestones.length);
      return base.add(steps.mul(milestoneStep));
    }
  }

  function milestoneGoal() public override view returns (uint256) {
    if (milestone < milestones.length) {
      return milestones[milestone];
    } else {
      uint256 base = milestones[milestones.length - 1];
      uint256 steps = milestone.sub(milestones.length).add(1);
      return base.add(steps.mul(milestoneStep));
    }
  }

  function milestoneProgress() public override view returns (uint256) {
    uint256 balance = token.balanceOf(address(this));
    if (balance > lastTokenBalance) {
      return lastMilestoneProgress.add(balance.sub(lastTokenBalance));
    }
    return lastMilestoneProgress;
  }

  function canUnlock() public override virtual view returns (bool) {
    return milestoneProgress() >= milestoneGoal();
  }

}
