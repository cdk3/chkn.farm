pragma solidity 0.6.12;

import "./interfaces/IPointPool.sol";
import "./interfaces/IRewardPool.sol";
import "./interfaces/IStakingPool.sol";
import "./abstract/SubordinateTokenPool.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// A TokenStakeRewardPool; by staking tokens, users can earn a share of an
// accumulated reward pool. The token to be staked may be set for each milestone
// independently.
//
// Staked tokens are worth a linearly decreasing number of points, depending on
// how far into the milestone they were staked. 65% to the end, they are worth 35% value.
// Tokens staked before a milestone period begins are worth full value.
contract TokenStakeRewardPool is IStakingPool, IRewardPool, IPointPool, SubordinateTokenPool, Ownable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // Records an ongoing token stake for a user.
  struct UserTokenStake {
    uint256 amount;       // total staked token amount
    uint256 score;        // <= amount: staked token value is multiplied by milestone % left
    uint256 milestone;    // the last milestone relevant to this stake (at which the score was set)
  }

  struct UserRewardInfo {
    uint256 unclaimedAmount;  // calculated and unclaimed
    uint256 claimedAmount;    // claimed
    uint256 milestone;        // calculated up to this (then-ongoing) milestone. e.g. 1 = reward for 0 is claimed.
  }

  struct RewardInfo {
    uint256 claimedAmount;  // the amount of the reward already transferred
    uint256 amount;         // the total reward pool amount unlocked for claims
    uint256 score;          // the total score to accumulate this reward
    uint256 amountPerScore; // scaled by PRECISION
  }

  // Precision values
  uint256 public constant PRECISION = 1e12;
  uint256 public constant PRECISION_NEEDED = 1e36;

  // Tokens for each milestone
  address public override milestoneToken;
  mapping(uint256 => address) milestoneTokenArray;
  address public defaultMilestoneToken;

  // ongoing milestone
  uint256 internal ongoingStakeAmount;
  uint256 internal ongoingScore;

  // stake and reward history
  uint256 internal totalRewardAmount;
  uint256 internal totalClaimedAmount;
  mapping(address => uint256) totalTokenStake;
  mapping(uint256 => RewardInfo) milestoneRewardInfo;

  // user stakes
  mapping(address => mapping (address => UserTokenStake)) userTokenStake;

  // user rewards
  mapping(address => UserRewardInfo) userRewardInfo;


  constructor(address _defaultMilestoneToken) public {
    milestoneToken = _defaultMilestoneToken;
    defaultMilestoneToken = _defaultMilestoneToken;
    milestoneTokenArray[0] = _defaultMilestoneToken;
  }

  // Setting milestone tokens
  function setMilestoneToken(uint256 _milestone, address _token) public onlyOwner {
    require(milestone < _milestone, "TokenStakeRewardPool::setMilestoneToken: milestone already passed");
    milestoneTokenArray[_milestone] = _token;
  }

  function milestoneTokens(uint256 _milestone) public view returns (address) {
    address _token = milestoneTokenArray[_milestone];
    return _token == address(0) ? defaultMilestoneToken : _token;
  }

  function setDefaulMilestoneToken(address _token) public onlyOwner {
    defaultMilestoneToken = _token;
  }

  // unlocking functions
  function _beforeUnlock() internal override {
    SubordinateTokenPool._beforeUnlock();
  }

  function _unlock() internal override {
    // Determine amount of this unlock: token balance, minus the portion
    // staked by users, minus any UNCLAIMED reward from previous milestones.

    uint256 rewardAmount;
    { // block
      IERC20 rewardToken = token();
      uint256 balance = rewardToken.balanceOf(address(this));
      uint256 stakedAmount = totalTokenStake[address(rewardToken)];
      uint256 unclaimedAmount = totalRewardAmount.sub(totalClaimedAmount);
      rewardAmount = balance.sub(stakedAmount).sub(unclaimedAmount);
    }

    // no rewards if no stakers (carry over to next milestone)
    if (ongoingScore == 0) {
      rewardAmount = 0;
    }

    // update the total cummulative reward amounts
    totalRewardAmount = totalRewardAmount.add(rewardAmount);

    // store per-score reward quantities for this milestone (times PRECISION).
    // Remember that the milestone count has already increased.
    RewardInfo storage rewardInfo = milestoneRewardInfo[milestone];
    rewardInfo.amount = rewardAmount;
    rewardInfo.score = ongoingScore;
    rewardInfo.amountPerScore = ongoingScore > 0 ? rewardAmount.mul(PRECISION).div(ongoingScore) : 0;

    SubordinateTokenPool._unlock();
  }

  function _afterUnlock() internal override {
    // set the token for the next milestone
    milestoneToken = milestoneTokenArray[milestone] != address(0)
      ? milestoneTokenArray[milestone] : defaultMilestoneToken;
    // ensure it doesn't stay empty; this is the permanent record of the token for this milestone
    milestoneTokenArray[milestone] = milestoneToken;

    // set ongoing stakes and score from saved token data
    ongoingStakeAmount = totalTokenStake[milestoneToken];
    ongoingScore = ongoingStakeAmount;

    SubordinateTokenPool._afterUnlock();
  }

  // IPointPool methods
  function qualified(address _user) external override view returns (bool) {
    return true;    // all users are qualified
  }

  function points(address _user) external override view returns (uint256) {
    // points accumulated for the current staked token
    UserTokenStake storage stake = userTokenStake[_user][milestoneToken];
    // if the stake dates from this milestone, the score is accurate.
    // otherwise, they get 100% of value from their tokens; use amount.
    if (stake.milestone == milestone) {
      return stake.score;
    } else {
      return stake.amount;
    }
  }

  function totalPoints() external override view returns (uint256) {
    return ongoingScore;
  }

  function totalQualifiedPoints() external override view returns (uint256) {
    return ongoingScore;
  }

  function unclaimedReward(address _user) public override view returns (uint256 _reward) {
    // iterate through token stakes, beginning at the first uncalculated
    // reward info.
    uint256 _milestone = milestone; // save gas
    // reward accumulate at PRECISION, then divide at the end
    UserRewardInfo storage rewardInfo = userRewardInfo[_user];
    for (uint i = rewardInfo.milestone; i < _milestone; i++) {
      address iToken = milestoneTokenArray[i];
      UserTokenStake storage stake = userTokenStake[_user][iToken];
      // if staked before milestone 'i', use the full value (amount).
      // otherwise, use score.
      uint256 score = stake.milestone < i ? stake.amount : stake.score;
      uint256 reward = score.mul(milestoneRewardInfo[i].amountPerScore);
      _reward = _reward.add(reward);
    }

    return _reward.div(PRECISION).add(rewardInfo.unclaimedAmount);
  }

  function reward(address _user) external override view returns (uint256) {
    // add unclaimed rewards to total rewards
    uint256 unclaimed = unclaimedReward(_user);
    return userRewardInfo[_user].claimedAmount.add(unclaimed);
  }

  function totalUnclaimedReward() external override view returns (uint256) {
    return totalRewardAmount.sub(totalClaimedAmount);
  }

  function totalReward() external override view returns (uint256) {
    return totalRewardAmount;
  }

  // Receive rewards
  function claim() external override returns (uint256 _reward) {
    uint256 _milestone = milestone;
    UserRewardInfo storage rewardInfo = userRewardInfo[msg.sender];
    if (rewardInfo.milestone < _milestone || rewardInfo.unclaimedAmount > 0) {
      _reward = claimToMilestone(msg.sender, _milestone);
    }
  }

  // `claim` can be expensive; this one has bounded gas cost, but may only
  // provide partial rewards. Calling multiple times will eventually produce
  // the full reward (up to one call per milestones), i.e. moving loop
  // iteration off-chain to keep each transaction's gas cost lower.
  function safeClaim() external returns (uint256 _reward) {
    uint256 _milestone = milestone;
    UserRewardInfo storage rewardInfo = userRewardInfo[msg.sender];
    if (rewardInfo.milestone < _milestone) {
      _reward = claimToMilestone(msg.sender, rewardInfo.milestone + 1);
    } else if (rewardInfo.unclaimedAmount > 0) {
      _reward = claimToMilestone(msg.sender, rewardInfo.milestone);
    }
  }

  function claimToMilestone(address _user, uint256 _milestone) internal returns (uint256 _reward) {
    // check the earliest unclaimed milestone for the user, calculate their
    // reward, and advance.
    _advanceUnclaimedReward(_user, _milestone);

    // get records
    UserRewardInfo storage rewardInfo = userRewardInfo[_user];
    _reward = rewardInfo.unclaimedAmount;

    // update records
    rewardInfo.claimedAmount = rewardInfo.claimedAmount.add(_reward);
    rewardInfo.unclaimedAmount = 0;
    totalClaimedAmount = totalClaimedAmount.add(_reward);

    // transfer, log, return.
    safeRewardTransfer(msg.sender, _reward);
    emit Claim(msg.sender, _reward);
  }

  // advances and records any "unclaimed reward" earned by the user up to (not
  // including) the milestone indicated. Does not transmit any reward, just
  // records how much was earned in the user's reward info.
  function _advanceUnclaimedReward(address _user, uint256 _milestone) internal {
    UserRewardInfo storage rewardInfo = userRewardInfo[_user];
    uint256 userMilestone = rewardInfo.milestone; // save gas

    // accumulate reward in PRECISION; divide at the end
    uint256 reward;
    if  (userMilestone < _milestone) {
      for (uint i = userMilestone; i < _milestone; i++) {
        address iToken = milestoneTokenArray[i];
        UserTokenStake storage stake = userTokenStake[_user][iToken];
        // if staked before milestone 'i', use the full value (amount).
        // otherwise, use score.
        uint256 score = stake.milestone < i ? stake.amount : stake.score;
        uint256 milestoneReward = score.mul(milestoneRewardInfo[i].amountPerScore);
        reward = reward.add(milestoneReward);
      }

      reward = reward.div(PRECISION);

      // update user reward
      rewardInfo.milestone = _milestone;  // first unexamined
      rewardInfo.unclaimedAmount = rewardInfo.unclaimedAmount.add(reward);
    }
  }

  function safeRewardTransfer(address _to, uint256 _amount) internal {
    IERC20 rewardToken = token();
    uint256 tokenBalance = rewardToken.balanceOf(address(this));
    if (_amount > tokenBalance) {
        rewardToken.transfer(_to, tokenBalance);
    } else {
        rewardToken.transfer(_to, _amount);
    }
  }

  // IStakingPool: Token deposits and withdraws
  function deposit(address _token, uint256 _amount) external override {
    uint256 _milestone = milestone; // save gas

    // changing stake can mess with unclaimed rewards; update records beforehand
    _advanceUnclaimedReward(msg.sender, _milestone);

    // receive tokens
    IERC20 stakeToken = IERC20(_token);
    stakeToken.transferFrom(msg.sender, address(this), _amount);

    // determine the score to receive
    uint256 mult = getMilestoneStakeMultiplier(milestoneStart(), milestoneGoal(), milestoneProgress());
    uint256 score = _amount.mul(mult).div(PRECISION);

    // adjust user staked amount and score
    UserTokenStake storage userStake = userTokenStake[msg.sender][_token];
    if (userStake.milestone < _milestone) {
      // update their score: any staked tokens are now full-value
      userStake.score = userStake.amount.add(score);
      userStake.milestone = _milestone;
    } else {
      userStake.score = userStake.score.add(score);
    }
    userStake.amount = userStake.amount.add(_amount);

    // adjust global token stakes
    totalTokenStake[_token] = totalTokenStake[_token].add(_amount);

    // adjust ongoing totals ONLY IF this token is the one used for the milestone!
    if (milestoneToken == _token) {
      ongoingStakeAmount = ongoingStakeAmount.add(_amount);
      ongoingScore = ongoingScore.add(score);
    }

    // log
    emit Deposit(msg.sender, _token, _amount);
  }

  function withdraw(address _token, uint256 _amount) external override {
    uint256 _milestone = milestone; // save gas
    UserTokenStake storage userStake = userTokenStake[msg.sender][_token];
    require(userStake.amount >= _amount, "TokenStakeRewardPool::withdraw: not enough staked");

    // changing stake can mess with unclaimed rewards; update records beforehand
    _advanceUnclaimedReward(msg.sender, _milestone);

    // send tokens
    IERC20 stakeToken = IERC20(_token);
    stakeToken.transfer(msg.sender, _amount);

    // adjust stake milestone
    if (userStake.milestone < _milestone) {
      // first time these tokens were touched this milestone
      userStake.score = userStake.amount;
      userStake.milestone = _milestone;
    }

    // determine the loss of score, and deduct (proportion of total score;
    // if you have 15 points and 20 coins, deducting 10 coins means you have 7.5 points)
    uint256 lostScore;
    if (userStake.amount == _amount) {
      lostScore = userStake.score;
      userStake.score = 0;
      userStake.amount = 0;
    } else if (userStake.amount < PRECISION_NEEDED) {
      // quantities are low enough for this to be safe
      lostScore = userStake.score.mul(_amount).div(userStake.amount);

      userStake.amount = userStake.amount.sub(_amount);
      userStake.score = userStake.score.sub(lostScore);
    } else {
      uint256 propLost = _amount.mul(PRECISION).div(userStake.amount);
      lostScore = userStake.score.mul(propLost).div(PRECISION);

      userStake.amount = userStake.amount.sub(_amount);
      userStake.score = userStake.score.sub(lostScore);
    }

    // adjust global token stakes
    totalTokenStake[_token] = totalTokenStake[_token].sub(_amount);

    // adjust ongoing totals ONLY IF this token is the one used for the milestone!
    if (milestoneToken == _token) {
      ongoingStakeAmount = ongoingStakeAmount.sub(_amount);
      ongoingScore = ongoingScore.sub(lostScore);
    }

    // log
    emit Withdraw(msg.sender, _token, _amount);
  }

  // withdraw without caring about rewards. EMERGENCY ONLY. Causes loss of reward.
  function emergencyWithdraw(address _token) external override {
    UserTokenStake storage stake = userTokenStake[msg.sender][_token];

    // transmit
    uint256 amount = stake.amount;
    uint256 score = stake.score;
    IERC20 stakeToken = IERC20(_token);
    stakeToken.transfer(msg.sender, amount);

    // adjust user stake
    stake.amount = 0;
    stake.score = 0;

    // global stakes
    totalTokenStake[_token] = totalTokenStake[_token].sub(amount);

    // ongoing stakes, if necessary.
    if (_token == milestoneToken) {
      ongoingStakeAmount = ongoingStakeAmount.sub(amount);
      ongoingScore = ongoingScore.sub(score);
      // NOTE: because of lazy updates to user stake scores carried over from
      // previous milestones, the `ongoingScore` may include full-value amounts
      // s.t. deducting the recorded user score isn't sufficient to remove their
      // influence on the reward pool. This can only happen once per milestone
      // per user, and requires the loss of any potential funds in the pool
      // owed to that user, so the risk is considered minimal.
    }
    emit EmergencyWithdraw(msg.sender, _token, amount);
  }

  // returns the appropriate stake amount multiplier for token deposited this
  // far into a staking period.
  function getMilestoneStakeMultiplier(uint256 _start, uint256 _goal, uint256 _progress) internal pure returns (uint256) {
    uint256 length = _goal.sub(_start);
    uint256 prog = _progress.sub(_start);

    if (prog > length) {
      return 0;
    }

    return length.sub(prog).mul(PRECISION).div(length);
  }

  // Easy accessors
  function stakeOf(address _user, address _token) external override view returns (uint256) {
    return userTokenStake[_user][_token].amount;
  }

  function acceptsToken(address _token) external override view returns (bool) {
    // we take all kinds here
    return true;
  }
}
