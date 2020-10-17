pragma solidity 0.6.12;

// A pool which distributes rewards to users according to a point system.
// Users are either qualified or not, and if qualified, receive a share of
// the reward proportional to their points.
interface IRewardPool {
  event Qualified(address indexed user, uint256 points);
  event Claim(address indexed user, uint256 amount);

  // Rewards
  function unclaimedReward(address _user) external view returns (uint256);
  function reward(address _user) external view returns (uint256);
  function totalUnclaimedReward() external view returns (uint256);
  function totalReward() external view returns (uint256);

  // Receive rewards
  function claim() external returns (uint256);
}
