const Timelock = artifacts.require("Timelock");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");

// Transfer 'feeToSetter' status to the Timelock.
module.exports = function (deployer, network) {
  deployer.then(async() => {
    const factory = await UniswapV2Factory.deployed();
    const timelock = await Timelock.deployed();

    // set the timelock as the feeTo setter for the factory, to later
    // attach reword pool.
    await factory.setFeeToSetter(timelock.address);
  });
};
