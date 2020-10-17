pragma solidity 0.6.12;


import "@openzeppelin/contracts/access/Ownable.sol";


contract MockOwnable is Ownable {
    uint256 public ticks = 0;

    address public where;
    uint256 public what;
    bool public whether;

    constructor() public {

    }

    function tick() public onlyOwner {
        ticks = ticks + 1;
    }

    function set(address _where, uint256 _what, bool _whether) public onlyOwner {
        where = _where;
        what = _what;
        whether = _whether;
    }
}
