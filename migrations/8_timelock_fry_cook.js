const Timelock = artifacts.require("Timelock");
const FryCookFinal = artifacts.require("FryCookFinal");

const values = require('./shared/values');

// Transfer control of the FryCookFinal to the Timelock contract.
module.exports = function (deployer, network) {
  const { roles } = values({ network, web3 });
  const { executive, headChef } = roles;

  deployer.then(async() => {
    const cook = await FryCookFinal.deployed();
    const oldOwner = await cook.getRoleMember(executive, 0);
    const timelock = await Timelock.deployed();

    // add the timelock to the frycook's two big roles
    await cook.grantRole(executive, timelock.address);
    await cook.grantRole(headChef, timelock.address);
    // renounce our position
    await cook.renounceRole(executive, oldOwner);
    await cook.renounceRole(headChef, oldOwner);
  });
};
