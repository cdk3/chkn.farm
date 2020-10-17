pragma solidity 0.6.12;

// A pool which tracks points earned by users.
// Users are either qualified or not, and have monotonically increasing points
// starting from zero.
interface IPointPool {
  event Qualified(address indexed user, uint256 points);

  // User state
  function qualified(address _user) external view returns (bool);
  function points(address _user) external view returns (uint256);

  // Overall state
  function totalPoints() external view returns (uint256);
  function totalQualifiedPoints() external view returns (uint256);
}
