pragma solidity 0.6.12;

import "../interfaces/IAddressLookup.sol";

contract MockAddressLookupFlooder{

  constructor()
  public {

  }

  // Mock Features
  function generateKeys(address _lookup, uint _attempts, address _address, bytes32 _salt) external {
    IAddressLookup lookup = IAddressLookup(_lookup);
    for (uint i = 0; i < _attempts; i++) {
      lookup.generateKey(_address, _salt);
    }
  }
}
