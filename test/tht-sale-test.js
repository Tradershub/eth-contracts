import assertRevert from '../node_modules/zeppelin-solidity/test/helpers/assertRevert';
import ether from '../node_modules/zeppelin-solidity/test/helpers/ether';
import { advanceBlock } from '../node_modules/zeppelin-solidity/test/helpers/advanceToBlock';
import { increaseTimeTo, duration, default as increaseTime } from '../node_modules/zeppelin-solidity/test/helpers/increaseTime';
import latestTime from '../node_modules/zeppelin-solidity/test/helpers/latestTime';

// web3 provided by truffle
const BigNumber = web3.BigNumber;
require('chai')
    .use(require('chai-as-promised'))
    .use(require('chai-bignumber')(BigNumber))
    .should();

let THToken = artifacts.require("./THToken.sol");
let TokenSale = artifacts.require("./THTokenSale.sol");

contract('TokenSale', (accounts) => {
    let owner, wallet, client, client2, walletCoreTeam, token, tokensale, startTime, endTime, afterEndTime;
    let testRate, minEthInvestment, maxEthInvestment, softCap, hardCap;
    let Token = THToken;
    let stages;

    before(async () => {
        // Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock();
        owner = web3.eth.accounts[0];
        wallet = web3.eth.accounts[1];
        client = web3.eth.accounts[2];
        client2 = web3.eth.accounts[3];
        walletCoreTeam = web3.eth.accounts[4];
    });

    let shouldHaveException = async (fn, error_msg) => {
        let has_error = false;

        try {
            await fn();
        } catch(err) {
            has_error = true;
        } finally {
            assert.equal(has_error, true, error_msg);
        }
    };

    beforeEach(async function () {
        startTime = latestTime() + duration.weeks(1);
        endTime = startTime + duration.days(32);    // TODO: Sale duration
        afterEndTime = endTime + duration.weeks(1);
        tokensale = await TokenSale.new(startTime, wallet, walletCoreTeam);
        token = await Token.at(await tokensale.token());

        stages = [];
        for(let i = 0; i < 5; i++) {
            stages.push({
                cap: await tokensale.stageCaps(i),
                tokensPerWei: await tokensale.stageTokenMul(i)
            });
        }
        testRate = 5040;
        softCap = await tokensale.softCap();
        hardCap = await tokensale.hardCap();
        minEthInvestment = await tokensale.minInvestment();
        maxEthInvestment = await tokensale.maxInvestment();
    });

    describe('#stage system tests', async ()=> {
        it('activateNextStage can be activated by owner', async ()=> {
            let activeStage = 0;
            let buyUpToStageCap = stages[activeStage].cap;
            await tokensale.addWhitelist(client, buyUpToStageCap, {from: owner});

            await increaseTimeTo(startTime);
            await tokensale.buyTokens(client, { from: client, value: buyUpToStageCap });
            await tokensale.activateNextStage({from: owner});
        });

        it('activateNextStage cannot be activated by non-owner', async ()=> {
            let activeStage = 0;
            let buyUpToStageCap = stages[activeStage].cap;
            await tokensale.addWhitelist(client, buyUpToStageCap, {from: owner});

            await increaseTimeTo(startTime);
            await tokensale.buyTokens(client, { from: client, value: buyUpToStageCap });
            await assertRevert(tokensale.activateNextStage({from: client}));
        });

        it('active stage cannot be changed before current stage cap is filled', async ()=> {
            let activeStage = 0;
            let buyLessThanStageCap = stages[activeStage].cap / 2;
            await tokensale.addWhitelist(client, buyLessThanStageCap, {from: owner});

            await increaseTimeTo(startTime);
            await tokensale.buyTokens(client, { from: client, value: buyLessThanStageCap });
            await assertRevert(tokensale.activateNextStage({from: owner}));
        });

        it('all valid stages can be activated and filled', async ()=> {
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await increaseTimeTo(startTime);

            // Stage 1 is active at start
            let stagesActivated = 1;
            for(let i = 0; i < stages.length - 1; i++) {
                await assertRevert(tokensale.activateNextStage({from: owner}));
                await tokensale.buyTokens(client, { from: client, value: maxEthInvestment });
                await tokensale.activateNextStage({from: owner});
                stagesActivated++;
            }
            assert.equal(await stagesActivated, stages.length, "Must activate all stages");

            let fundsRaised = await tokensale.fundsRaised();
            fundsRaised.should.be.bignumber.equal(stages[stages.length-2].cap);

            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment });
            fundsRaised = await tokensale.fundsRaised();
            fundsRaised.should.be.bignumber.equal(stages[stages.length-1].cap);
            fundsRaised.should.be.bignumber.equal(hardCap);

            (await web3.eth.getBalance(tokensale.address)).should.be.bignumber.equal(hardCap);

            await assertRevert(tokensale.activateNextStage({from: owner}));
        });
    });

    describe('#token contract tests', async ()=> {
        it('should forbid minting from client', async ()=>{
            await shouldHaveException(async () => {
                await Token.mint(client,100, {from: client})
            });
        });

        it('should forbid endMinting from client', async ()=>{
            await shouldHaveException(async () => {
                await Token.endMinting(true, {from: client})
            });
        });

        it("should forbid transfer and transferFrom if softCap not reached and finishCrowdsale called", async() => {
            let lessThanGoal = ether(10);
            await increaseTimeTo(startTime);

            await tokensale.addWhitelist(client, lessThanGoal, {from: owner});
            (await tokensale.canContribute(client, lessThanGoal)).should.be.equal(true);
            await tokensale.buyTokens(client, { from: client, value: lessThanGoal });

            await increaseTimeTo(afterEndTime);
            (await tokensale.hasEnded()).should.be.equal(true);
            (await tokensale.softCapReached()).should.be.equal(false);

            await tokensale.finishCrowdsale({ from: owner });
            await increaseTime(duration.weeks(1));

            await assertRevert(token.transferFrom(client, owner, 10))
            await assertRevert(token.transfer(client, 10))
        });

        it("should ALLOW transfer and transferFrom if softCap reached and finishCrowdsale called", async() => {
            await increaseTimeTo(startTime);

            await tokensale.addWhitelist(client, softCap, {from: owner});
            await tokensale.addWhitelist(client2, softCap, {from: owner});
            (await tokensale.canContribute(client, softCap)).should.be.equal(true);
            (await tokensale.canContribute(client2, softCap)).should.be.equal(true);
            await tokensale.buyTokens(client, { from: client, value: ether(10) });
            await tokensale.buyTokens(client2, { from: client2, value: softCap });

            await increaseTimeTo(afterEndTime);
            (await tokensale.hasEnded()).should.be.equal(true);
            (await tokensale.softCapReached()).should.be.equal(true);

            await tokensale.finishCrowdsale({ from: owner });
            await increaseTime(duration.weeks(1));

            await token.approve(client, 10, {from: client2});
            await token.transferFrom(client2, owner, 10, {from: client});
            await token.transfer(client, 10, { from: client2 });
        });
    });

    describe('#beforeSale', async ()=>{
        it("owner should be owner", async () => {
            owner.should.be.equal( await tokensale.owner());
        });

        it("client shouldn't be owner", async () => {
            client.should.not.be.equal( await tokensale.owner());
        });

        it("Balance of client should be 0", async () => {
            assert.equal(await tokensale.balanceOf(client), 0, "Must be 0 on the start");
        });

        it("Total token supply should be 0", async () => {
            assert.equal(await token.totalSupply(), 0, "Must be 0 on the start");
        });

        it('can not buy if not initialized', async () => {
            await assertRevert(tokensale.sendTransaction({amount: ether(1)}));
        });
        it("cannot donate before startTime", async () => {
            await tokensale.addWhitelist(client, ether(1), {from: owner});
            await assertRevert(tokensale.buyTokens(client, { from: client, value: ether(10) }));
        });
    });

    describe('#whitelist checks', async ()=>{
        it('addWhitelist cannot by called by non-owner', async ()=> {
            await assertRevert(tokensale.addWhitelist(owner, ether(10), {from: client}));
        });

        it('addWhitelist should add client if called by owner', async ()=> {
            await tokensale.addWhitelist(client, ether(10), {from: owner});
            (await tokensale.canContribute(client, ether(10))).should.be.equal(true);
        });

        it('cannot buy if not whitelisted', async () => {
            await assertRevert(tokensale.sendTransaction({amount: ether(1)}));
            await increaseTimeTo(startTime);
            await assertRevert(tokensale.sendTransaction({amount: ether(1)}));
        });

        it('should be able to whitelist in bulk', async () => {
            // Also useful for approximating gas usage
            let amounts = [];
            let contributors = [];
            let num = 90;
            for(let i = 100; i < (100 + num); i++) {
                contributors.push("0x564540a26fb667306b3abdcb4ead35beb886" + i);
                amounts.push(maxEthInvestment);
            }

            await tokensale.addWhitelistBulk(contributors, amounts);
            for(let i = 0; i < contributors.length; i++) {
                (await tokensale.canContribute(contributors[i], maxEthInvestment)).should.be.equal(true);
            }
        });
    });

    describe('#ongoing sale' , async ()=> {
        it("should start tokensale after startTime", async() => {
            assert.equal((await tokensale.hasStarted()), false);
            await increaseTimeTo(startTime);
            assert.equal((await tokensale.hasStarted()), true);
        });

        it("should forbid token transfer", async() => {
            await increaseTimeTo(startTime);
            await assertRevert(token.transfer(client, 10));
        });

        it("should forbid token transfer via transferFrom", async() => {
            await increaseTime(startTime);
            await assertRevert(token.transferFrom(client, owner, 10))
        });

        it("should have token balance equal zero for client", async() => {
            await increaseTimeTo(startTime);
            let balance = await token.balanceOf(client);
            assert.equal(balance, 0, "Token balance should be 0");
        });

        it("should reject buying less than minEthInvestment", async() => {
            let veryLowBuyIn = 0.5 * minEthInvestment;
            await tokensale.addWhitelist(client, veryLowBuyIn, {from: owner});

            await increaseTimeTo(startTime);
            await assertRevert(tokensale.buyTokens(client, { from: client, value: veryLowBuyIn }));
        });

        it("should reject buying more than allocated max", async() => {
            await tokensale.addWhitelist(client, ether(100), {from: owner});
            await increaseTimeTo(startTime);
            await assertRevert(tokensale.buyTokens(client, { from: client, value: ether(200) }));
        });

        it('should handle refunds at stage cap properly', async ()=> {
            let currentStage = stages[0];
            let clientBalancePre = await web3.eth.getBalance(client);

            await tokensale.addWhitelist(client, hardCap, {from: owner});
            (await tokensale.canContribute(client, hardCap)).should.be.equal(true);

            await increaseTimeTo(startTime);

            let buyInFull = ether(1000);
            let tokensFull = buyInFull.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, { from: client, value: buyInFull, gasPrice: 0 });

            let tokensMinted = tokensFull;
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            let buyInPartial = maxEthInvestment;
            let tokensPartial = buyInPartial.times(currentStage.tokensPerWei).minus(tokensMinted);
            await tokensale.buyTokens(client, { from: client, value: buyInPartial, gasPrice: 0 });

            tokensMinted = tokensMinted.plus(tokensPartial);

            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            let fundsRaised = await tokensale.fundsRaised();
            fundsRaised.should.be.bignumber.equal(currentStage.cap);
            (await web3.eth.getBalance(tokensale.address)).should.be.bignumber.equal(currentStage.cap);

            let expectedClientBalance = clientBalancePre.minus(currentStage.cap);
            (await web3.eth.getBalance(client)).should.be.bignumber.equal(expectedClientBalance);
        });


        it('should properly handle partial buys up to stageCap', async ()=> {
            let currentStage = stages[0];
            let clientEthBalancePre = await web3.eth.getBalance(client);

            await tokensale.addWhitelist(client, hardCap, {from: owner});
            await increaseTimeTo(startTime);

            let tokensMinted;

            let buyInSubCap = ether(100);
            let tokensSubCap = buyInSubCap.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, { from: client, value: buyInSubCap, gasPrice: 0 });
            tokensMinted = tokensSubCap;

            let fillCap = currentStage.cap;
            let tokensFillCap = fillCap.times(currentStage.tokensPerWei).minus(tokensMinted);
            await tokensale.buyTokens(client, { from: client, value: fillCap, gasPrice: 0 });

            tokensMinted = tokensMinted.plus(tokensFillCap);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            let clientEthBalancePost = await web3.eth.getBalance(client);
            clientEthBalancePost.should.be.bignumber.equal(clientEthBalancePre.minus(stages[0].cap));
        });

        it('should accept between min and max in Stage 1, respect rate, partial buys and stage cap', async ()=> {
            let currentStage = stages[0];
            let clientEthBalancePre = await web3.eth.getBalance(client);
            let client2EthBalancePre = await web3.eth.getBalance(client2);

            await tokensale.addWhitelist(client, hardCap, {from: owner});
            (await tokensale.canContribute(client, hardCap)).should.be.equal(true);

            await increaseTimeTo(startTime);

            (await tokensale.canContribute(client, hardCap)).should.be.equal(true);

            let personalCap = ether(300);
            await tokensale.addWhitelist(client2, personalCap, {from: owner});
            (await tokensale.canContribute(client2, personalCap)).should.be.equal(true);

            await assertRevert(tokensale.buyTokens(client, { from: client, value: minEthInvestment.minus(1), gasPrice: 0 }));
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(new BigNumber(0));

            // Client 1 - min purchase
            let buyInMin = minEthInvestment;
            let tokensToBuyMin = buyInMin.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, { from: client, value: buyInMin, gasPrice: 0 });

            let tokensMinted = tokensToBuyMin;
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensToBuyMin);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Client 1 - just above min purchase
            let buyInJustAboveMin = minEthInvestment.plus(3);
            let tokensToBuyJustAboveMin = buyInJustAboveMin.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, { from: client, value: buyInJustAboveMin, gasPrice: 0 });

            tokensMinted = tokensMinted.plus(tokensToBuyJustAboveMin);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Client 2 - personal max purchase
            let buyInPersonalCap = personalCap;
            let tokensToBuyPersonalCap = buyInPersonalCap.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client2, { from: client2, value: buyInPersonalCap, gasPrice: 0 });

            tokensMinted = tokensMinted.plus(tokensToBuyPersonalCap);
            (await tokensale.balanceOf(client2)).should.be.bignumber.equal(tokensToBuyPersonalCap);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Fail to activate next stage
            await assertRevert(tokensale.activateNextStage({from: owner}));

            // Client 1 - buyout current stage
            let fillCap = currentStage.cap;
            let tokensFillCap = fillCap.times(currentStage.tokensPerWei).minus(tokensMinted);
            await tokensale.buyTokens(client, { from: client, value: fillCap, gasPrice: 0 });

            tokensMinted = tokensMinted.plus(tokensFillCap);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted.minus(tokensToBuyPersonalCap));
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            await assertRevert(tokensale.buyTokens(client, { from: client, value: minEthInvestment, gasPrice: 0 }));

            let fundsRaised = await tokensale.fundsRaised();
            fundsRaised.should.be.bignumber.equal(currentStage.cap);
            (await web3.eth.getBalance(tokensale.address)).should.be.bignumber.equal(currentStage.cap);

            let expectedClient2BalancePost = client2EthBalancePre.minus(buyInPersonalCap);
            (await web3.eth.getBalance(client2)).should.be.bignumber.equal(expectedClient2BalancePost);

            let expectedClientBalancePost = clientEthBalancePre.minus(currentStage.cap).plus(buyInPersonalCap);
            (await web3.eth.getBalance(client)).should.be.bignumber.equal(expectedClientBalancePost);

            // Successfully activate next stage
            await tokensale.activateNextStage({from: owner});
            (await tokensale.activeStage()).should.be.bignumber.equal(1);
        });

        it("should check if whitelisted amount is corrected accordingly after token buying", async() =>{
            let ethBuyIn = ether(40);
            let tokenAmountToBuy = ethBuyIn.times(stages[0].tokensPerWei);

            await tokensale.addWhitelist(client, maxEthInvestment, {from: owner});
            await increaseTimeTo(startTime);
            (await tokensale.canContribute(client, ethBuyIn)).should.be.equal(true);
            (await tokensale.hasStarted()).should.be.equal(true);

            await tokensale.buyTokens(client, { from: client, value: ethBuyIn });
            let balance = await tokensale.balanceOf(client);
            balance.should.be.bignumber.equal(tokenAmountToBuy, "Token balance should be " + tokenAmountToBuy);

            let checkAgainForHighAmount = await tokensale.canContribute(client, maxEthInvestment);
            checkAgainForHighAmount.should.be.equal(false);

            let checkAgainForLowAmount = await tokensale.canContribute(client, ethBuyIn);
            checkAgainForLowAmount.should.be.equal(true);
        });

        it("should NOT allow withdraw when !softCapReached", async() =>{
            // reach the soft cap
            await tokensale.addWhitelist(client, hardCap, {from: owner});
            (await tokensale.canContribute(client, hardCap)).should.be.equal(true);
            await increaseTimeTo(startTime);

            await tokensale.buyTokens(client, { from: client, value: ether(2) });
            (await tokensale.softCapReached()).should.be.equal(false);
            await assertRevert(tokensale.withdraw({from: owner}));
        });


        it("should allow multiple withdrawals after softCapReached", async() => {
            // reach the soft cap == stages[0].cap
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await increaseTimeTo(startTime);

            // Stage 1
            let buyIn = stages[0].cap;
            await tokensale.buyTokens(client, {from: client, value: buyIn});
            (await tokensale.softCapReached()).should.be.equal(true);
            let balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            let balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.should.be.bignumber.equal(balanceWalletPre.plus(buyIn));

            // Stage 2
            await tokensale.activateNextStage({from: owner});

            buyIn = ether(100);
            await tokensale.buyTokens(client, {from: client, value: buyIn});
            balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.should.be.bignumber.equal(balanceWalletPre.plus(buyIn));

            // With partial buys
            let buyInOverCap = stages[1].cap.minus(stages[0].cap);
            let buyInPartial = buyInOverCap.minus(buyIn);
            await tokensale.buyTokens(client, {from: client, value: buyInOverCap});
            balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.should.be.bignumber.equal(balanceWalletPre.plus(buyInPartial));

            await increaseTime(duration.weeks(1));
            // Stage 3
            await tokensale.activateNextStage({from: owner});
            await tokensale.buyTokens(client, {from: client, value: stages[2].cap.minus(stages[1].cap), gasPrice: 0});

            // Stage 4
            await tokensale.activateNextStage({from: owner});
            await tokensale.buyTokens(client, {from: client, value: stages[3].cap.minus(stages[2].cap), gasPrice: 0});

            balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.should.be.bignumber.equal(balanceWalletPre.plus(stages[3].cap.minus(stages[1].cap)));

            // Stage 5
            await tokensale.activateNextStage({from: owner});
            await tokensale.buyTokens(client, {from: client, value: maxEthInvestment});

            await increaseTimeTo(afterEndTime);

            await tokensale.finishCrowdsale({from: owner});
            balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.should.be.bignumber.equal(balanceWalletPre.plus(stages[4].cap.minus(stages[3].cap)));
        });


        it("should let owner pause the sale", async() =>{
            await increaseTimeTo(startTime);
            (await tokensale.paused()).should.be.equal(false);

            await tokensale.pause({from: owner});
            (await tokensale.paused()).should.be.equal(true);
        });

        it("should let owner unpause the sale", async() =>{
            await increaseTimeTo(startTime);
            (await tokensale.paused()).should.be.equal(false);

            await tokensale.pause({from: owner});
            (await tokensale.paused()).should.be.equal(true);

            await increaseTime(duration.weeks(1));
            await tokensale.unpause({from: owner});
            (await tokensale.paused()).should.be.equal(false);
        });

        it("should NOT let client pause the sale", async() =>{
            (await tokensale.paused()).should.be.equal(false);
            await assertRevert(tokensale.pause({from: client}));
        });

        it("should reject buying if sale is paused", async() =>{
            let ethBuyIn = ether(2);

            await tokensale.addWhitelist(client, ethBuyIn, {from: owner});
            await increaseTimeTo(startTime);

            await tokensale.pause({from: owner});
            (await tokensale.paused()).should.be.equal(true);
            await assertRevert(tokensale.buyTokens(client, { from: client, value: ethBuyIn }));
        });
    });

    describe('#after sale tests', async ()=>{
        it('should allow finalizing crowdsale if endTime reached', async () => {
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({from: owner});
            assert.equal(await tokensale.hasEnded(), true);
            assert.equal(await token.mintingFinished(), true);
        });

        it('should allow finalizing crowdsale if hardCap reached', async () => {
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            // Stage 1 fill
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            // Stage 2 fill
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            // Stage 3 fill
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            // Stage 4 fill
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            // Stage 5 fill
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});

            await tokensale.finishCrowdsale({from: owner});
            assert.equal(await tokensale.hasEnded(), true);
            assert.equal(await token.mintingFinished(), true);
        });

        it("should NOT allow finalizing the crowdsale before endTime", async() => {
            await increaseTimeTo(startTime);

            await tokensale.addWhitelist(client, ether(10), {from: owner});
            (await tokensale.canContribute(client, ether(10))).should.be.equal(true);

            await tokensale.buyTokens(client, { from: client, value: ether(10) });
            await shouldHaveException(async () => {
                await tokensale.finishCrowdsale({from: owner});
            }, 'Not allowing finishCrowdsale');
        });

        it("cannot donate after endTime", async () => {
            await increaseTimeTo(afterEndTime);
            await tokensale.addWhitelist(client, ether(10), {from: owner});
            await assertRevert(tokensale.buyTokens(client, { from: client, value: ether(10) }));
        });

        it("should refund eth to backers if softCap not reached after sale", async() => {
            let lessThanGoal = ether(10);
            await increaseTimeTo(startTime);

            await tokensale.addWhitelist(client, lessThanGoal, {from: owner});
            (await tokensale.canContribute(client, lessThanGoal)).should.be.equal(true);
            await tokensale.buyTokens(client, { from: client, value: lessThanGoal });

            await increaseTimeTo(afterEndTime);
            (await tokensale.hasEnded()).should.be.equal(true);
            (await tokensale.softCapReached()).should.be.equal(false);

            await tokensale.finishCrowdsale({ from: owner });
            await increaseTime(duration.weeks(1));

            const pre = web3.eth.getBalance(client);
            await tokensale.refund({from: client, gasPrice: 0}).should.be.fulfilled;
            const post = web3.eth.getBalance(client);
            post.minus(pre).should.be.bignumber.equal(lessThanGoal);
        });

        it("should NOT refund eth to backers if softCap reached after sale", async() => {
            await increaseTimeTo(startTime);
            let reachSoftCap = softCap;

            await tokensale.addWhitelist(client, reachSoftCap, {from: owner});
            (await tokensale.canContribute(client, reachSoftCap)).should.be.equal(true);

            await tokensale.buyTokens(client, { from: client, value: reachSoftCap});
            (await tokensale.softCapReached()).should.be.equal(true);

            await increaseTimeTo(afterEndTime);
            (await tokensale.hasEnded()).should.be.equal(true);

            await tokensale.finishCrowdsale({ from: owner });
            await shouldHaveException(async () => {
                await tokensale.refund({from: client});
            });
        });

        it("should create Bounty and Platform tokens if softcap reached", async() =>{
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            // soft cap reached
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);

            // All tokens currently existing sold in crowdsale
            let tokensMinted = (await token.totalSupply());
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);

            await tokensale.finishCrowdsale({ from: owner });

            let crowdsalePart = await tokensale.crowdsaleAllocation(); // Platform 60%
            let bountyPart = await tokensale.varTokenAllocation(0); // Bounty 5%
            let platformPart = await tokensale.varTokenAllocation(2); // Platform 10%

            let bountyAllocation = tokensMinted.times(bountyPart).dividedBy(crowdsalePart);
            let platformAllocation = tokensMinted.times(platformPart).dividedBy(crowdsalePart);

            (await tokensale.balanceOf(wallet)).should.be.bignumber.equal(bountyAllocation.plus(platformAllocation));
        });

        it("should create Advisor and TeamTokens and lock them ALL if softcap reached", async() =>{
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            // soft cap reached
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);

            // All tokens currently existing sold in crowdsale
            let tokensMinted = (await token.totalSupply());
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);

            await tokensale.finishCrowdsale({ from: owner });

            let crowdsalePart = await tokensale.crowdsaleAllocation(); // Platform 60%
            let advisorPart = await tokensale.varTokenAllocation(1); // Advisor 5%
            let teamPart = new BigNumber(0);
            let vestedTeamTotal = new BigNumber(0);
            for(let i = 0; i < 4; i++) {
                teamPart = teamPart.plus(await tokensale.teamTokenAllocation(i));
                vestedTeamTotal = vestedTeamTotal.plus(await tokensale.vestedTeam(i));
            }

            let advisorAllocation = tokensMinted.times(advisorPart).dividedBy(crowdsalePart);
            let teamAllocation = tokensMinted.times(teamPart).dividedBy(crowdsalePart);

            (await tokensale.vestedAdvisors()).should.be.bignumber.equal(advisorAllocation);
            vestedTeamTotal.should.be.bignumber.equal(teamAllocation);

            (await tokensale.balanceOf(tokensale.address)).should.be.bignumber.equal(advisorAllocation.plus(teamAllocation));

            await assertRevert(token.transfer(client, 1, { from: walletCoreTeam }));
        });

        it("should unlock coreTeam tokens 360 days after start", async() =>{
            // soft cap reached and finish
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({ from: owner });

            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(0);

            await increaseTimeTo(startTime + duration.days(361));

            let vestedTeamAlloc_1 = await tokensale.vestedTeam(0);
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamAlloc_1);

            // Can't withdraw more
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamAlloc_1);
        });

        it("should unlock coreTeam tokens 480 days after start", async() =>{
            // soft cap reached and finish
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({ from: owner });

            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(0);

            await increaseTimeTo(startTime + duration.days(481));

            let vestedTeamAlloc_1 = await tokensale.vestedTeam(0);
            let vestedTeamAlloc_2 = await tokensale.vestedTeam(1);
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamAlloc_1.plus(vestedTeamAlloc_2));

            // Can't withdraw more
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamAlloc_1.plus(vestedTeamAlloc_2));
        });

        it("should unlock coreTeam tokens 600 days after start", async() =>{
            // soft cap reached and finish
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({ from: owner });

            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(0);

            await increaseTimeTo(startTime + duration.days(601));

            let vestedTeamAlloc_1 = await tokensale.vestedTeam(0);
            let vestedTeamAlloc_2 = await tokensale.vestedTeam(1);
            let vestedTeamAlloc_3 = await tokensale.vestedTeam(2);
            let vestedTeamTotal = vestedTeamAlloc_1.plus(vestedTeamAlloc_2).plus(vestedTeamAlloc_3);
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamTotal);

            // Can't withdraw more
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamTotal);
        });

        it("should unlock coreTeam tokens 720 days after start", async() =>{
            // soft cap reached and finish
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({ from: owner });

            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(0);

            await increaseTimeTo(startTime + duration.days(721));

            let vestedTeamAlloc_1 = await tokensale.vestedTeam(0);
            let vestedTeamAlloc_2 = await tokensale.vestedTeam(1);
            let vestedTeamAlloc_3 = await tokensale.vestedTeam(2);
            let vestedTeamAlloc_4 = await tokensale.vestedTeam(3);
            let vestedTeamTotal = vestedTeamAlloc_1.plus(vestedTeamAlloc_2).plus(vestedTeamAlloc_3).plus(vestedTeamAlloc_4);
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamTotal);

            // Can't withdraw more
            await tokensale.withdrawCoreTeamTokens({ from: owner });
            (await token.balanceOf(walletCoreTeam)).should.be.bignumber.equal(vestedTeamTotal);
        });

        it("should unlock advisor tokens 180 days after start", async() =>{
            // soft cap reached and finish
            await increaseTimeTo(startTime);
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await tokensale.buyTokens(client, { from: client, value: maxEthInvestment});
            await tokensale.activateNextStage({ from: owner});
            await tokensale.buyTokens(client, { from: client, value: ether(100)});
            await increaseTimeTo(afterEndTime);
            await tokensale.finishCrowdsale({ from: owner });

            let walletPreWithdraw = await token.balanceOf(wallet);

            await tokensale.withdrawAdvisorTokens({ from: owner });
            (await token.balanceOf(wallet)).should.be.bignumber.equal(walletPreWithdraw);

            await increaseTimeTo(startTime + duration.days(181));

            let vestedAdvisorAlloc = await tokensale.vestedAdvisors();
            await tokensale.withdrawAdvisorTokens({ from: owner });
            (await token.balanceOf(wallet)).should.be.bignumber.equal(walletPreWithdraw.plus(vestedAdvisorAlloc));

            // Can't withdraw more
            await tokensale.withdrawAdvisorTokens({ from: owner });
            (await token.balanceOf(wallet)).should.be.bignumber.equal(walletPreWithdraw.plus(vestedAdvisorAlloc));
        });
    });

    describe('#sale simulation', async ()=> {
        it("should pass sale process simulation if caps filled during presale", async() => {
            let currentStage = stages[0];
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await increaseTimeTo(startTime);

            // Stage 1 - Presale Group 1 - reach cap
            let buyInCap = currentStage.cap;
            let tokensToBuy = buyInCap.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, {from: client, value: buyInCap});
            let tokensMinted = tokensToBuy;
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Wait until presale period 2, enforced by current Stage cap being filled
            await increaseTime(duration.days(4));

            await assertRevert(tokensale.buyTokens(client, {from: client, value: buyInCap}));

            // Stages 2-5 - Presale Group 1 + 2 - reach caps, wait time enforced by Stage cap being filled
            for(let i = 1; i < stages.length; i++) {
                await tokensale.activateNextStage({from: owner});
                currentStage = stages[i];

                buyInCap = currentStage.cap.minus(stages[i-1].cap);
                tokensToBuy = buyInCap.times(currentStage.tokensPerWei);
                await tokensale.buyTokens(client, {from: client, value: buyInCap});
                tokensMinted = tokensMinted.plus(tokensToBuy);
                (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
                (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);
            }

            await increaseTimeTo(afterEndTime);

            await tokensale.finishCrowdsale({from: owner});
            let balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            let balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.minus(balanceWalletPre).should.be.bignumber.equal(hardCap);
        });

        it("should pass sale process simulation if caps NOT filled during presale by using pause", async() => {
            let currentStage = stages[0];
            await tokensale.addWhitelist(client, 2 * hardCap, {from: owner});
            await increaseTimeTo(startTime);

            // Stage 1 - Presale Group 1
            let buyIn = ether(100);
            let tokensToBuy = buyIn.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, {from: client, value: buyIn});
            let tokensMinted = tokensToBuy;
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // 2 day (presale group 1) +
            await increaseTime(duration.days(2));
            await tokensale.pause({from: owner});

            // 2 day (technical) break enforced by the Stage system, due to cap fill
            await increaseTime(duration.days(2));
            await tokensale.unpause({from: owner});

            // Stage 1 - Presale Group 1 + 2
            let buyInCap = currentStage.cap;
            tokensToBuy = buyInCap.minus(buyIn).times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, {from: client, value: buyInCap});
            tokensMinted = tokensMinted.plus(tokensToBuy);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Stage 2
            await tokensale.activateNextStage({from: owner});
            currentStage = stages[1];

            buyIn = ether(100);
            tokensToBuy = buyIn.times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, {from: client, value: buyIn});
            tokensMinted = tokensMinted.plus(tokensToBuy);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // End of Presale, Stage 2 cap has not been reached
            await increaseTime(duration.days(5));
            await tokensale.pause({from: owner});

            await assertRevert(tokensale.buyTokens(client, {from: client, value: buyInCap}));

            // Technical break, start mainsale
            await increaseTime(duration.days(2));
            await tokensale.unpause({from: owner});

            buyInCap = currentStage.cap.minus(stages[0].cap);
            tokensToBuy = buyInCap.minus(buyIn).times(currentStage.tokensPerWei);
            await tokensale.buyTokens(client, {from: client, value: buyInCap});
            tokensMinted = tokensMinted.plus(tokensToBuy);
            (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
            (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);

            // Stages 3-5
            for(let i = 2; i < stages.length; i++) {
                await tokensale.activateNextStage({from: owner});
                currentStage = stages[i];

                buyInCap = currentStage.cap.minus(stages[i-1].cap);
                tokensToBuy = buyInCap.times(currentStage.tokensPerWei);
                await tokensale.buyTokens(client, {from: client, value: buyInCap});
                tokensMinted = tokensMinted.plus(tokensToBuy);
                (await tokensale.balanceOf(client)).should.be.bignumber.equal(tokensMinted);
                (await token.totalSupply()).should.be.bignumber.equal(tokensMinted);
            }

            await increaseTimeTo(afterEndTime);

            await tokensale.finishCrowdsale({from: owner});
            let balanceWalletPre = await web3.eth.getBalance(wallet);
            await tokensale.withdraw({from: owner});
            let balanceWalletPost = await web3.eth.getBalance(wallet);
            balanceWalletPost.minus(balanceWalletPre).should.be.bignumber.equal(hardCap);
        });
    });
});