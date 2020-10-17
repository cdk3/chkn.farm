const MasterTokenPool = artifacts.require("MasterTokenPool");
const TokenStakeRewardPool = artifacts.require("TokenStakeRewardPool");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { tokens, rewardPool, me, roles } = values({ network, web3 });

  deployer.then(async () => {
      const ZERO = tokens['zero'];

      // TODO: Add the ReferralRewardPool, deployed earlier.
      if (network != 'test') {
        console.log(`WARNING: Add the ReferralRewardPool, which should be deployed before this step.`);
      }

      // retrieve referenced addresses
      const referralPoolAddr = ZERO; // await ReferralRewardPool.deployed();
      const tokenStakePool = await TokenStakeRewardPool.deployed();

      const { milestones, step, shares, devaddr} = rewardPool;
      const token = network == 'test' ? await tokenStakePool.defaultMilestoneToken() : rewardPool.token;
      const pools = [referralPoolAddr, tokenStakePool.address];
      const poolShare = [shares.referral, shares.stake];

      // deploy the reward pool
      await deployer.deploy(MasterTokenPool, token, milestones, step, pools, poolShare, devaddr);
      const pool = await MasterTokenPool.deployed();

      // set managing pool
      // await referralPool.setTokenPool(pool.address);
      await tokenStakePool.setTokenPool(pool.address);
  });
};
