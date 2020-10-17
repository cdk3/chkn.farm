const ChickenTokenFinal = artifacts.require("ChickenTokenFinal");
const FryCookFinal = artifacts.require("FryCookFinal");

const values = require('./shared/values');

// Deploy the FryCookFinal.
module.exports = function (deployer, network, accounts) {

  const { fryCook, roles, me } = values({ network, web3 });
  const { devaddr, start, endBonus, endDevBonus, chickenPerBlock } = fryCook;

  deployer.then(async () => {
    const chicken = await ChickenTokenFinal.deployed();
    await deployer.deploy(FryCookFinal, chicken.address, devaddr, chickenPerBlock, start, endBonus, endDevBonus);
    const cook = await FryCookFinal.deployed();
    await chicken.grantRole(roles.minter, cook.address);
    await chicken.renounceRole(roles.minter, me || accounts[0]);
  });
};
