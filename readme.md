# Tradershub.io Crowdsale and Token contracts

## Details of the Token Offering

The token offering is executed in 5 Stages (Tranches). When each Stage is sold out, the next Stage is activated, with some special considerations for Stage 1 and 2 during the presale period.

* **Stage 1**: Ether cap 3000, 40% bonus
* **Stage 2**: Ether cap 1800, 20% bonus
* **Stage 3**: Ether cap 2250, 10% bonus *(Not available during presale)*
* **Stage 4**: Ether cap 2250, 5% bonus *(Not available during presale)*
* **Stage 5**: Ether cap 2700, no bonus *(Not available during presale)*

Maximum cap is 12,000 ether, presale cap is 4800 ether and the soft cap is 3000 ether.

The token offering lasts up to 32 days starting February 22nd and finishing at the latest March 26th.

The token offering uses a whitelist system to assure only KYC approved contributors can purchase THT.    

The token presale starts with Stage 1 active on **February 22nd** and is open for up to 48 hours to whitelisted members who can purchase up to Stage 1 cap worth of THT. 

Then follows a ~48 hour technical break after which the presale continues on **February 26th** until **March 2nd** allowing whitelisted members to participate. Stages 1 and 2 can be filled during this phase.
  
On **March 3rd** at the latest the Presale phase concludes.
  
The crowdsale starts on **March 5th** and lasts up to **March 26th** or finishes earlier if all 5 Stages are filled before the deadline. If any of Stages 1 or 2 have not been bought out during the presale they are available with their respective discounts during the crowdsale as well. The 5 stages are advanced manually via owner control.   
 
Refund functionality is included and available if softcap is not reached.
 
A vesting system is implemented for locking Advisor and Team tokens.
 
The contract defines minimum and maximum investments, which are to be set prior to mainnet deployment.
 
## Details of the Token

THT is an ERC20 Ethereum token. 

THT are available for transfer and use immediately a few days after the crowdsale is successfully funded.
 
No new THT can be created after the crowdsale is finished.

A **Max.** Total of 83,385,000 THT will ever be minted. 

## Testing

A test suite is available in `/test`.
 
Use a package manager like yarn or node to install dependencies.

```
yarn install
```

Run an ethereum RPC client, like [ganache-cli](https://github.com/trufflesuite/ganache-cli). 

A command which creates 10 accounts with 1e6 ether each is available under scripts for a quick start.

```
.\scripts\tht-ganache-cli.cmd
```

Run test using truffle

```
truffle test
```

## Etherscan / Swarm source

### Flattener

Run on *nix or use Vagrant on win.

```
./flatten.sh
```

### ABI generator

```
node scripts/gen-abi.js
```

## About Tradershub.io

## Testnet deployments

THTokenSale@Kovan: https://kovan.etherscan.io/address/0xb1ef5f5c94e88eea50fdad8e40d5607cb38c73c6#readContract
THToken:@Kovan: https://kovan.etherscan.io/address/0x3d5028fb77d77a4377ddf870beb11dcdf845e73b#readContract

More information about us can be found at our:

* [Website](https://tradershub.io)
* [Ico details](https://tradershub.io/ico_details)
* [Whitepaper](https://tradershub.io/build/static/downloadables/Whitepaper.pdf)
* [Onepager](https://tradershub.io/build/static/downloadables/One_Page_Summary.pdf)
* [Tradershub@Medium](https://medium.com/@tradershub)
* [Telegram](https://t.me/tradershub_comunity)