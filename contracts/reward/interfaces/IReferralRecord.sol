pragma solidity 0.6.12;

// A record of referrals, tracking "value" events.
interface IReferralRecord {
  function recordReferral(address _user, uint256 _value, bytes32 _referralCode) external;
}
