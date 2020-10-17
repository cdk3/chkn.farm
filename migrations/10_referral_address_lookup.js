const ReferralAddressLookup = artifacts.require("ReferralAddressLookup");

module.exports = function (deployer, network) {
  deployer.then(async () => {
    await deployer.deploy(ReferralAddressLookup, 24);   // 6 characters
  });
};
