pragma solidity >=0.5.0;

interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function reportingTo() external view returns (address);
    function mintingFeeTo() external view returns (address);
    function mintingFeeSuspended() external view returns (bool);
    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);
    function feeSuspendedSetter() external view returns (address);
    function migrator() external view returns (address);

    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);

    function setReportingTo(address) external;
    function setMintingFeeTo(address) external;
    function setMintingFeeSuspended(bool) external;
    function setFeeTo(address) external;
    function setFeeToSetter(address) external;
    function setFeeSuspendedSetter(address) external;
    function setMigrator(address) external;
}
