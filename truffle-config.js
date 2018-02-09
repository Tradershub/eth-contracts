require("babel-polyfill");
require('babel-register')({
    // Ignore everything in node_modules except node_modules/zeppelin-solidity.
    presets: ["es2015"],
    plugins: ["syntax-async-functions","transform-regenerator"],
    ignore: /node_modules\/(?!zeppelin-solidity)/,
});

module.exports = {
    // See <http://truffleframework.com/docs/advanced/configuration>
    // to customize your Truffle configuration!
    networks: {
        development: {
            host: "127.0.0.1",
            // port: 7545, // ganache-gui
            port: 8545, // ganache-cli
            network_id: "*" // Match any network id
        },
        live: {
            host: "0.0.0.0", // Random IP for example purposes (do not use)
            port: 80,
            network_id: 1,        // Ethereum public network
        }
    }
};
