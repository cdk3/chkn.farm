pragma solidity 0.6.12;

// A pool in which users may stake tokens of varying types.
interface IStakingPool {
  event Deposit(address indexed user, address indexed token, uint256 amount);
  event Withdraw(address indexed user, address indexed token, uint256 amount);
  event EmergencyWithdraw(address indexed user, address indexed token, uint256 amount);

  // Token deposits and withdraws
  function deposit(address _token, uint256 _amount) external;
  function withdraw(address _token, uint256 _amount) external;
  function emergencyWithdraw(address _token) external;

  // Easy accessors
  function stakeOf(address _user, address _token) external view returns (uint256);
  function acceptsToken(address _token) external view returns (bool);

  // Token relevant to the current milestone.
  function milestoneToken() external view returns (address);
}
