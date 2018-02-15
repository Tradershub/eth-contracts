const THTokenSale = artifacts.require('./THTokenSale');
const config = require('../config.js');

/**
 * Deploy and live test multisigs before deploying the Sale.
 * @dev to only deploy multisigs use [truffle migrate -f 2 --network NETWORK_NAME]
 * @param deployer
 * @param network
 * @param accounts
 */
module.exports = function(deployer, network, accounts) {
    if (network == "live" || network == "kovan") {
        deployer.deploy(
            THTokenSale,
            config.CROWDSALE_START_TIME,
            config.MULTISIG_WALLET_TRADERSHUB_ADDRESS,
            config.MULTISIG_WALLET_TEAM_ADDRESS,
            config.WALLET_PLATFORM,
            config.WALLET_BOUNTY_AND_ADVISORS
        ).then(() => {
            console.log("-- Crowdsale: " + THTokenSale.address + "\n");
        });
    } else if (network == "ropsten") {
        // @dev deployer.deploy(THToken).then(..
    }
    else {
        //
    }
};
