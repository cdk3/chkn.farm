const MockWETH = artifacts.require("MockWETH");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const UniswapV2Router03 = artifacts.require("UniswapV2Router03");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { tokens, me } = values({ network, web3 });

  deployer.then(async () => {
      let weth = tokens['WETH'];
      if (!weth) {
          // deploy
          await deployer.deploy(MockWETH);
          const mockWeth = await MockWETH.deployed();
          weth = mockWeth.address;
      }

      await deployer.deploy(UniswapV2Factory, me || accounts[0]);  // allow deploying account to set feeTo
      factory = await UniswapV2Factory.deployed();
      await deployer.deploy(UniswapV2Router03, factory.address, weth);
  });
};
