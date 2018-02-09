var THTokenSale = artifacts.require("./THTokenSale");

// TODO:
module.exports = function(deployer, network, accounts) {
  const walletOps = accounts[0];
  const walletTeam = accounts[1];
  const startStamp = Math.floor(Date.now() / 1000);
  deployer.deploy(THTokenSale, startStamp, walletOps, walletTeam);
};
