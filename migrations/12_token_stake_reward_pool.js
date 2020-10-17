const TokenStakeRewardPool = artifacts.require("TokenStakeRewardPool");
const ChickenTokenFinal = artifacts.require("ChickenTokenFinal");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { me } = values({ network, web3 });

  deployer.then(async () => {
      // retrieve referenced addresses
      const chicken = await ChickenTokenFinal.deployed();

      // deploy the stake pool
      await deployer.deploy(TokenStakeRewardPool, chicken.address);
  });
};
