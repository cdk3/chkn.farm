const ChickenTokenFinal = artifacts.require("ChickenTokenFinal");
const ChickenHatchery = artifacts.require("ChickenHatchery");
const ChickenHatcheryTokenBuffer = artifacts.require("ChickenHatcheryTokenBuffer");
const UniswapV2Router03 = artifacts.require("UniswapV2Router03");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");

// Deploy the ChickenHatchery: stake chicken, earn chicken.
module.exports = function (deployer, network, accounts) {
  deployer.then(async () => {
    // get previously deployed contracts and related addresses
    const chicken = await ChickenTokenFinal.deployed();
    const router = await UniswapV2Router03.deployed();
    const factory = await UniswapV2Factory.deployed();
    const weth = await router.WETH();

    // deploy hatchery
    await deployer.deploy(ChickenHatchery, chicken.address);
    const hatchery = await ChickenHatchery.deployed();

    // deploy buffer
    await deployer.deploy(ChickenHatcheryTokenBuffer, factory.address, hatchery.address, chicken.address, weth);
    const buffer = await ChickenHatcheryTokenBuffer.deployed();

    // divert swap fees to the buffer
    await factory.setFeeTo(buffer.address);
  });
};
