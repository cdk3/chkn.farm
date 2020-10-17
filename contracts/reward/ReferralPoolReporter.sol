pragma solidity 0.6.12;

import "../uniswapv2/interfaces/IUniswapV2Reporting.sol";
import "../uniswapv2/interfaces/IUniswapV2ValueEstimator.sol";
import "./interfaces/IReferralRecord.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract ReferralPoolReporter is IUniswapV2Reporting, AccessControl {
  using SafeMath for uint256;

  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");   // aka deployer: sets contract references and roles, whitelists tokens
  bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");   // whitelists tokens
  bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE"); // accept liquidity reports from these address(s)
  bytes32 public constant WHITELIST_TOKEN_ROLE = keccak256("WHITELIST_TOKEN_ROLE");   // allows value > 0

  address public record;
  address public estimator;

  constructor(address _record, address _estimator) public {
    record = _record;
    estimator = _estimator;

    // set up role administration
    _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
    _setRoleAdmin(MANAGER_ROLE, ADMIN_ROLE);
    _setRoleAdmin(ROUTER_ROLE, ADMIN_ROLE);
    _setRoleAdmin(WHITELIST_TOKEN_ROLE, MANAGER_ROLE);

    // set caller as admin
    _setupRole(ADMIN_ROLE, msg.sender);
    _setupRole(MANAGER_ROLE, msg.sender);
  }

  // changing references

  function setRecord(address _record) public {
    require(hasRole(ADMIN_ROLE, msg.sender),
      "ReferralPoolReporter::setRecord: not authorized");

    record = _record;
  }

  function setEstimator(address _estimator) public {
    require(hasRole(ADMIN_ROLE, msg.sender),
      "ReferralPoolReporter::setEstimator: not authorized");

    estimator = _estimator;
  }

  // wrap grantRole for tokens

  function addTokenToWhitelist(address _token) public {
    grantRole(WHITELIST_TOKEN_ROLE, _token);
  }

  function addTokensToWhitelist(address[] calldata _tokens) public {
    for (uint i = 0; i < _tokens.length; i++) {
      grantRole(WHITELIST_TOKEN_ROLE, _tokens[i]);
    }
  }

  function removeTokenFromWhitelist(address _token) public {
    revokeRole(WHITELIST_TOKEN_ROLE, _token);
  }

  function removeTokensFromWhitelist(address[] calldata _tokens) public {
    for (uint i = 0; i < _tokens.length; i++) {
      revokeRole(WHITELIST_TOKEN_ROLE, _tokens[i]);
    }
  }

  // receive reports
  function addedLiquidity(address _user, address _tokenA, uint256 _amountA, address _tokenB, uint256 _amountB, bytes32 _referrer) external override {
    require(hasRole(ROUTER_ROLE, msg.sender),
      "ReferralPoolReporter::addedLiquidity: not authorized");
    if (record != address(0) && estimator != address(0)) {
      // Not a requirement; if we can't report, we still want the stake to succeed,
      // so don't revert the transaction.
      address[] memory tokens = new address[](2);
      tokens[0] = _tokenA;
      tokens[1] = _tokenB;

      uint256[] memory amounts = new uint256[](2);
      amounts[0] = hasRole(WHITELIST_TOKEN_ROLE, _tokenA) ? _amountA : 0;
      amounts[1] = hasRole(WHITELIST_TOKEN_ROLE, _tokenB) ? _amountB : 0;

      uint256 value = IUniswapV2ValueEstimator(estimator).estimateValueETH(tokens, amounts);

      // report
      IReferralRecord(record).recordReferral(_user, value, _referrer);
    }
  }

  function addedLiquidityETH(address _user, address _token, uint256 _amountToken, uint256 _amountETH, bytes32 _referrer) external override {
    require(hasRole(ROUTER_ROLE, msg.sender),
      "ReferralPoolReporter::addedLiquidityETH: not authorized");
    if (record != address(0) && estimator != address(0)) {
      // Not a requirement; if we can't report, we still want the stake to succeed,
      // so don't revert the transaction.
      address[] memory tokens = new address[](1);
      tokens[0] = _token;

      uint256[] memory amounts = new uint256[](1);
      amounts[0] = hasRole(WHITELIST_TOKEN_ROLE, _token) ? _amountToken : 0;

      uint256 value = IUniswapV2ValueEstimator(estimator).estimateValueETH(tokens, amounts);

      // report
      IReferralRecord(record).recordReferral(_user, value.add(_amountETH), _referrer);
    }
  }

}
