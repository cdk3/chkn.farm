pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";

// Leave your Chickens here for a while. When you come back for them, they may
// have multiplied!
// Depositing ChickenTokens entitles you to the equivalent proportion of all
// CHKN held by this contract, which may have increased over time (e.g. by
// the accumulation of transaction fees transfered to this contract).
// xCHKN tokens function as claim tickets; they can be traded as tokens
// representing future swap fees.
contract ChickenHatchery is ERC20("ChickenHatchery", "xCHKN") {
    using SafeMath for uint256;
    IERC20 public chicken;

    constructor(IERC20 _chicken) public {
        chicken = _chicken;
    }

    // Drop off your chickens at the Hatchery
    function enter(uint256 _amount) public {
        uint256 totalChicken = chicken.balanceOf(address(this));
        uint256 totalShares = totalSupply();
        if (totalShares == 0 || totalChicken == 0) {
            _mint(msg.sender, _amount);
        } else {
            uint256 what = _amount.mul(totalShares).div(totalChicken);
            _mint(msg.sender, what);
        }
        chicken.transferFrom(msg.sender, address(this), _amount);
    }

    // Collect your chickens from the Hatchery, and any extras.
    function leave(uint256 _share) public {
        uint256 totalShares = totalSupply();
        uint256 what = _share.mul(chicken.balanceOf(address(this))).div(totalShares);
        _burn(msg.sender, _share);
        _safeChickenTransfer(msg.sender, what);
    }

    // Safely transfer chickens to the specified address (up to existing balance).
    function _safeChickenTransfer(address _to, uint256 _amount) internal {
        uint256 balance = chicken.balanceOf(address(this));
        chicken.transfer(_to, Math.min(_amount, balance));
    }
}
