const MockWETH = artifacts.require("MockWETH");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const UniswapV2Router03 = artifacts.require("UniswapV2Router03");
const UniswapV2ValueEstimator = artifacts.require("UniswapV2ValueEstimator");
const RewardPoolTokenBuffer = artifacts.require("RewardPoolTokenBuffer");
const ReferralPoolReporter = artifacts.require("ReferralPoolReporter");

const values = require('./shared/values');

module.exports = function (deployer, network, accounts) {
  const { tokens, me, roles } = values({ network, web3 });

  deployer.then(async () => {
      const ZERO = tokens['zero'];
      const USDT = tokens['USDT'];

      const router = await UniswapV2Router03.deployed();
      const factory = await UniswapV2Factory.deployed();
      const WETH = await router.WETH();

      // deploy the value estimator
      await deployer.deploy(UniswapV2ValueEstimator, factory.address, WETH);
      const estimator = await UniswapV2ValueEstimator.deployed();

      // deploy the reward pool token buffer
      await deployer.deploy(RewardPoolTokenBuffer, factory.address, ZERO, USDT, WETH);

      // deploy the reporter
      await deployer.deploy(ReferralPoolReporter, ZERO, estimator.address);
      const reporter = await ReferralPoolReporter.deployed();

      // allow reporter to report
      await reporter.grantRole(roles.router, router.address);
  });
};
