var abi = require('ethereumjs-abi');
var config = require('../config');
var encoded = abi.rawEncode(
    [
        "uint256",
        "address",
        "address",
        "address",
        "address" ],
    [
        config.CROWDSALE_START_TIME,
        config.MULTISIG_WALLET_TRADERSHUB_ADDRESS,
        config.MULTISIG_WALLET_TEAM_ADDRESS,
        config.WALLET_PLATFORM,
        config.WALLET_BOUNTY_AND_ADVISORS
    ]
);
console.log(encoded.toString('hex'));