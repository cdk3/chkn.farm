pragma solidity 0.6.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./abstract/DepositMilestoneTokenPool.sol";
import "./abstract/SubordinateManagingPool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// Tracks reward pool milestones, distributing quantities to subordinate pools
// and to a devaddr. The devaddr gets 25% off the top; remaining funds are split
// between subordinate pools on each unlock.
contract MasterTokenPool is SubordinateManagingPool, DepositMilestoneTokenPool, Ownable {
  using SafeMath for uint256;

  event SetPools(address[] pools, uint256[] poolShare);

  address public devaddr;

  uint256[] public poolShare;
  uint256 public totalPoolShare;

  constructor(
    address _token,
    uint256[] memory _milestones,
    uint256 _milestoneStep,
    address[] memory _pools,
    uint256[] memory _poolShare,
    address _devaddr
    ) public
  SubordinateManagingPool(_pools)
  DepositMilestoneTokenPool(_token, _milestones, _milestoneStep) {
    devaddr = _devaddr;

    uint _totalPoolShare = 0; // save gas
    for (uint i = 0; i < _poolShare.length; i++) {
      _totalPoolShare = _totalPoolShare.add(_poolShare[i]);
    }

    require(_pools.length == _poolShare.length,
      "MasterRewardPool::constructor: _pools and _poolShare must have the same length");
    require(_totalPoolShare > 0, "MasterRewardPool::constructor: _poolShare must sum to > 0");

    poolShare = _poolShare;
    totalPoolShare = _totalPoolShare;

    emit SetPools(pools, poolShare);
  }

  function setPools(address[] calldata _pools, uint256[] calldata _poolShare) public onlyOwner {
    uint _totalPoolShare = 0; // save gas
    for (uint i = 0; i < _poolShare.length; i++) {
      _totalPoolShare = _totalPoolShare.add(_poolShare[i]);
    }

    require(_pools.length == _poolShare.length,
      "MasterRewardPool::setPools: _pools and _poolShare must have the same length");
    require(_totalPoolShare > 0, "MasterRewardPool::setPools: _poolShare must sum to > 0");

    pools = _pools;
    poolShare = _poolShare;
    totalPoolShare = _totalPoolShare;

    emit SetPools(pools, poolShare);
  }

  function _beforeUnlock() internal override(SubordinateManagingPool, DepositMilestoneTokenPool) {
    DepositMilestoneTokenPool._beforeUnlock();
    SubordinateManagingPool._beforeUnlock(); // subordinates last
  }

  function _unlock() internal override(SubordinateManagingPool, DepositMilestoneTokenPool) {
    // dev has already received their share. distribute everything left (except
    // additional progress past this milestone) to subordinate pairs.
    uint256 funds = milestoneGoal().sub(milestoneStart());
    funds = funds.sub(funds.div(4));
    // actual balance should never, ever be less than this (may be more due
    // to truncated division when sending dev share). Just in case...
    uint256 balance = token.balanceOf(address(this));
    if (balance < funds) {
      funds = balance;
    }

    uint256 remaining = funds;
    for (uint i = 0; i < pools.length - 1; i++) {
      uint256 share = funds.mul(poolShare[i]).div(totalPoolShare);
      token.transfer(pools[i], share);
      remaining = remaining.sub(share);
    }
    token.transfer(pools[pools.length - 1], remaining);

    // note change in funds
    _updateTokenBalance();

    // super contract functions
    DepositMilestoneTokenPool._unlock();
    SubordinateManagingPool._unlock();  // last of all, update subordinates
  }

  function _afterUnlock() internal override(SubordinateManagingPool, DepositMilestoneTokenPool) {
    DepositMilestoneTokenPool._afterUnlock();
    SubordinateManagingPool._afterUnlock(); // subordinates last
  }

  // DepositMilestoneTokenPool Overrides

  function _noteTokenBalance(uint256 _balance) internal override {
    // the devaddr gets 25% of all received tokens, but they still count
    // towards the milestone.
    uint256 _progress = milestoneProgress();
    if (_progress > lastMilestoneProgress) {
      lastMilestoneProgress = lastMilestoneProgress.add(_balance).sub(lastTokenBalance);
    }

    // transmit the dev share (if balance change > 0)
    if (_balance > lastTokenBalance) {
      // transmit the dev share
      uint received = _balance.sub(lastTokenBalance);
      uint devShare = received.div(4);

      token.transfer(devaddr, devShare);

      lastTokenBalance = _balance.sub(devShare);
    } else if (_balance != lastTokenBalance) {
      lastTokenBalance = _balance;
    }
  }

  // ITokenPool ovverrides

  function canUnlock() public override virtual view returns (bool) {
    return DepositMilestoneTokenPool.canUnlock();
  }

  function unlock() public override virtual returns (bool _unlocked) {
    _updateTokenBalance();
    _unlocked = canUnlock();
    if (_unlocked) {
      uint _milestone = milestone;
      uint _start = milestoneStart();
      uint _goal = milestoneGoal();
      uint _amount = milestoneProgress();
      _beforeUnlock();
      _unlock();
      _afterUnlock();
      emit Milestone(_milestone, _start, _goal, _amount);
    }
  }

  // Update developer address
  function dev(address _devaddr) public {
    require(msg.sender == devaddr, "MasterTokenPool::dev caller is not the devaddr");
    devaddr = _devaddr;
  }
}
