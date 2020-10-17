const MasterTokenPool = artifacts.require("MasterTokenPool");
const RewardPoolTokenBuffer = artifacts.require("RewardPoolTokenBuffer");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { me } = values({ network, web3 });

  deployer.then(async () => {
      // retrieve referenced addresses
      const pool = await MasterTokenPool.deployed();
      const buffer = await RewardPoolTokenBuffer.deployed();

      // from this moment, money (USDT) can flow from the token buffer into
      // the master reward pool, potentially reaching reward milestones.
      // money that reaches those contracts can't go anywhere but into user rewards.
      await buffer.setRecipient(pool.address);
  });
};
