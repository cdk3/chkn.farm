const ChickenTokenFinal = artifacts.require("ChickenTokenFinal");

const values = require('./shared/values');

// Deploy the ChickenTokenFinal. CHKNs!
module.exports = function (deployer, network) {
  const { chickenHolders } = values({ network, web3 });

  deployer.then(async () => {
    // deploy ChickenTokenFinal
    await deployer.deploy(ChickenTokenFinal);
    const chicken = await ChickenTokenFinal.deployed();

    // initial mints: provide starting token supply (useful if e.g. putting
    // on exchanges, starting an initial swap, etc.)
    for (const holder of chickenHolders) {
      await chicken.mint(holder.address, holder.amount);
    }
  });
};
