const MasterTokenPool = artifacts.require("MasterTokenPool");
const RewardPoolTokenBuffer = artifacts.require("RewardPoolTokenBuffer");
const ReferralPoolReporter = artifacts.require("ReferralPoolReporter");
const TokenStakeRewardPool = artifacts.require("TokenStakeRewardPool");
const Timelock = artifacts.require("Timelock");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { me, roles } = values({ network, web3 });

  deployer.then(async () => {
      // retrieve referenced addresses
      const masterPool = await MasterTokenPool.deployed();
      const tokenStakePool = await TokenStakeRewardPool.deployed();
      const buffer = await RewardPoolTokenBuffer.deployed();
      const reporter = await ReferralPoolReporter.deployed();
      const timelock = await Timelock.deployed();

      await masterPool.transferOwnership(timelock.address);
      await tokenStakePool.transferOwnership(timelock.address);
      await buffer.setRecipientSetter(timelock.address);

      await reporter.grantRole(roles.admin, timelock.address);
      await reporter.grantRole(roles.manager, timelock.address);
      await reporter.renounceRole(roles.admin, me || accounts[0]);
      await reporter.renounceRole(roles.manager, me || accounts[0]);
  });
};
