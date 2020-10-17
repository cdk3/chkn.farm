const Timelock = artifacts.require("Timelock");

const values = require('./shared/values');

// Deploy Timelock
module.exports = function (deployer, network) {
  const { timelock } = values({ network, web3 });

  deployer.then(async() => {
    await deployer.deploy(Timelock, timelock.owner, timelock.delay);  // 2 days, in seconds
  });
};
