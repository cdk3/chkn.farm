pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockFLPTokenMigrator {
    event Migrate(uint256 amount, address token0, address token1, address remainderTo);

    uint256 public deduction;

    constructor(uint256 _deduction) public {
      deduction = _deduction;
    }

    function migrate(uint256 amount, address token0, address token1, address remainderTo) external returns (uint256 amountOut) {
        amountOut = amount - deduction;
        IERC20(token0).transferFrom(msg.sender, remainderTo, deduction);
        emit Migrate(amount, token0, token1, remainderTo);
    }
}
