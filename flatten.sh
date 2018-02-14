#!/usr/bin/env bash

#sudo pip3 install solidity-flattener --no-cache-dir -U
rm -rf flat/*
solidity_flattener contracts/THToken.sol | sed "1s/.*/pragma solidity ^0.4.18;/" > flat/THToken_flat.sol
solidity_flattener contracts/THTokenSale.sol | sed "1s/.*/pragma solidity ^0.4.18;/" > flat/THTokenSale_flat.sol
