pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// A TokenPool: a pool of tokens which approaches "milestones" and can unlock
// at each one.
interface ITokenPool {
  event Milestone(uint256 milestone, uint256 start, uint256 goal, uint256 amount);

  // Pool information
  function token() external view returns (IERC20);

  // Pool state
  function milestone() external view returns (uint256);       // monotonically increasing per-milestone
  function milestoneStart() external view returns (uint256);  // the token count to begin the current reward period
  function milestoneGoal() external view returns (uint256);   // the token count to end the current reward period
  function milestoneProgress() external view returns (uint256);   // progress: a value between milestoneStart() and milestoneGoal()

  // Unlock rewards
  function canUnlock() external view returns (bool);
  function unlock() external returns (bool);      // unlock the tokens at a given milestone, moves to the next (if appropriate)
}
