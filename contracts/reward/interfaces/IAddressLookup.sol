pragma solidity 0.6.12;

// A data store that encodes addresses as arbitrary codes.
interface IAddressLookup {
  function generateKey(address _address, bytes32 _salt) external returns (bytes32);
  function getKey(address _address) external view returns (bytes32);

  function lookup(bytes32 _key) external view returns (address);
}
