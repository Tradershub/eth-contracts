require("babel-polyfill");
require('babel-register')({
    // Ignore everything in node_modules except node_modules/zeppelin-solidity.
    presets: ["es2015"],
    plugins: ["syntax-async-functions","transform-regenerator"],
    ignore: /node_modules\/(?!zeppelin-solidity)/,
});
const vault = require('./vault/pkeys.js');

const Web3 = require("web3");
const web3 = new Web3();
const WalletProvider = require("truffle-wallet-provider");
const Wallet = require('ethereumjs-wallet');

// let mainNetPrivateKey = new Buffer(vault.PKEY_MAINNET, "hex");
// let mainNetWallet = Wallet.fromPrivateKey(mainNetPrivateKey);
// let mainNetProvider = new WalletProvider(mainNetWallet, "https://mainnet.infura.io/");

let kovanPrivateKey = new Buffer(vault.PKEY_KOVAN, "hex");
let kovanWallet = Wallet.fromPrivateKey(kovanPrivateKey);
let kovanProvider = new WalletProvider(kovanWallet, "https://kovan.infura.io/");

let ropstenPrivateKey = new Buffer(vault.PKEY_ROPSTEN, "hex");
let ropstenWallet = Wallet.fromPrivateKey(ropstenPrivateKey);
let ropstenProvider = new WalletProvider(ropstenWallet, "https://ropsten.infura.io/");

module.exports = {
    // See <http://truffleframework.com/docs/advanced/configuration>
    networks: {
        development: {
            host: "127.0.0.1",
            port: 8545, // ganache-cli
            network_id: "*" // Match any network id
        },
        kovan: {
            provider: kovanProvider,
            network_id: 42,        // Kovan test network
            gas: 6912000,
            gasPrice: web3.toWei("20", "gwei")
        },
        // live: {
        //     provider: mainNetProvider,
        //     network_id: 1,        // mainnet
        //     gas: 5989000,
        //     gasPrice: web3.toWei("21", "gwei")
        // },
        // Problematic for THToken sale due to Kovan's current block gas limit of 4.7e6
        // Can still be deployed by deploying THToken and THTokenSale separately and setting THToken's owner to THTokenSale
        // ropsten: {
        //     provider: ropstenProvider,
        //     network_id: 3,        // Ropsten test network
        //     gas: 4700000,
        //     gasPrice: web3.toWei("20", "gwei")
        // },
    },
    solc: {
        optimizer: {
            enabled: true,
            runs: 200
        }
    }
};
