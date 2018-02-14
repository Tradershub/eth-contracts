const MultiSigWallet = artifacts.require('./gnosis/MultiSigWallet');
const config = require('../config.js');

/**
 * Deploy and live test multisigs before deploying the Sale.
 * @dev to only deploy multisigs use [truffle migrate -f 2 --network NETWORK_NAME]
 * @param deployer
 */
module.exports = function(deployer) {
    // deployer.deploy(MultiSigWallet, config.MULTISIG_WALLET_TEAM_OWNERS, config.MULTISIG_WALLET_TEAM_REQ_SIG);
    // deployer.deploy(MultiSigWallet, config.MULTISIG_WALLET_TRADERSHUB_OWNERS, config.MULTISIG_WALLET_TRADERSHUB_REQ_SIG);
};
