pragma solidity 0.6.12;

import "./interfaces/IAddressLookup.sol";

// A data store that encodes addresses as arbitrary codes.
contract ReferralAddressLookup is IAddressLookup {

  mapping(address => bytes32) internal lastKeyForAddress;
  mapping(bytes32 => address) internal addressForKey;

  uint256 public keysGenerated;
  uint8 public keyLength;

  constructor(uint8 _keyLength) public {
    require(_keyLength > 0, "ReferralAddressLookup::constructor: must have nonzero _keyLength");
    keyLength = _keyLength;
  }

  function generateKey(address _address, bytes32 _salt) public override returns (bytes32) {
    bytes32 key = createKey(_address, _salt, 16, false);
    if (key == 0) {
      require(keyLength < 255, "ReferralAddressLookup::generateKey: too many collisions (please try again)");

      keyLength++;
      key = createKey(_address, _salt, 2, true);
    }
    return key;
  }

  function createKey(address _address, bytes32 _salt, uint8 _attempts, bool _fullLength) private returns (bytes32) {
    for (uint8 i = 0; i < _attempts; i++) {
      bytes32 key = keyGen(_address, _salt, i, keyLength, _fullLength);

      // check for uniqueness, validity
      if (key != 0 && addressForKey[key] == address(0)) {
        keysGenerated++;
        lastKeyForAddress[_address] = key;
        addressForKey[key] = _address;
        return key;
      }
    }
    return 0;
  }

  function keyGen(address _address, bytes32 _salt, uint8 i, uint8 _length, bool _fullLength) private view returns (bytes32) {
    uint256 keyAsNum = uint256(keccak256(abi.encodePacked(
        _address,
        _salt,
        address(this),
        keysGenerated,
        block.number,
        i
      )));

    uint256 trunc = 2 ** uint256(256 - _length);
    keyAsNum = (keyAsNum / trunc) * trunc;    // right-pad with zeros

    if (_fullLength && keyAsNum % (trunc * 2) == 0) {
      keyAsNum += trunc;
    }

    return bytes32(keyAsNum);
  }

  function getKey(address _address) public view override returns (bytes32) {
    return lastKeyForAddress[_address];
  }

  function lookup(bytes32 _key) public view override returns (address) {
    return addressForKey[_key];
  }
}
