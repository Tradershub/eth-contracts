pragma solidity ^0.4.18;

import "./zeppelin-solidity/math/SafeMath.sol";
import "./zeppelin-solidity/lifecycle/Pausable.sol";
import "./THToken.sol";


// Also Ownable due to Pausable
contract THTokenSale is Pausable {
    using SafeMath for uint256;

    // Sale Token
    THToken public token;

    // Total wei raised
    uint256 public fundsRaised = 0;

    // Minimal possible cap in ethers
    uint256 public constant SOFT_CAP = 3000 ether;

    // Maximum possible cap in ethers
    uint256 public constant HARD_CAP = 12000 ether;

    bool public softCapReached = false;
    bool public hardCapReached = false;
    bool public saleSuccessfullyFinished = false;

    /**
     * Stage 1: 3000 ether worth of THT available at 40% bonus
     * Stage 2: 1800 ether worth of THT available at 20% bonus
     * Stage 3: 2250 ether worth of THT available at 10% bonus
     * Stage 4: 2250 ether worth of THT available at 5% bonus
     * Stage 5: 2700 ether worth of THT available with no bonus
     */
    uint256[5] public stageCaps = [
        3000 ether,
        4800 ether,
        7050 ether,
        9300 ether,
        12000 ether
    ];
    uint256[5] public stageTokenMul = [
        5040,
        4320,
        3960,
        3780,
        3600
    ];
    uint256 public activeStage = 0;

    // Minimum investment during first 48 hours
    uint256 public constant MIN_INVESTMENT_PHASE1 = 5 ether;
    // Minimum investment
    uint256 public constant MIN_INVESTMENT = 0.1 ether;

    // refundAllowed can be set to true if SOFT_CAP is not reached
    bool public refundAllowed = false;
    // Token Allocation for Bounty(5%), Advisors (5%), Platform (10%)
    uint256[3] public varTokenAllocation = [5, 5, 10];
    // 20% vested over 4 segments for Core Team
    uint256[4] public teamTokenAllocation = [5, 5, 5, 5];
    // 60% crowdsale
    uint256 public constant CROWDSALE_ALLOCATION = 60;

    // Vested amounts of tokens, filled with proper values when finalizing
    uint256[4] public vestedTeam = [0, 0, 0, 0];
    uint256 public vestedAdvisors = 0;

    // Withdraw
    address public wallet;
    // CoreTeam Vested
    address public walletCoreTeam;
    // Platform THT
    address public walletPlatform;
    // Bounty and Advisors THT
    address public walletBountyAndAdvisors;

    // start and end timestamp when investments are allowed (both inclusive)
    uint256 public startTime;
    uint256 public endTime;

    // Whitelisted addresses and their allocations of wei available to invest
    mapping(address => uint256) public whitelist;

    // Wei received from token buyers
    mapping(address => uint256) public weiBalances;

    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);
    event Whitelisted(address indexed beneficiary, uint256 value);
    event SoftCapReached();
    event HardCapReached();
    event Finalized(bool successfullyFinished);
    event StageOpened(uint stage);
    event StageClosed(uint stage);

    /**
    * @dev Modifier to make a function callable only during the sale
    */
    modifier beforeSaleEnds() {
        // Not calling hasEnded due to lower gas usage
        require(now < endTime && fundsRaised < HARD_CAP);
        _;
    }

    function THTokenSale(
        uint256 _startTime,
        address _wallet,
        address _walletCoreTeam,
        address _walletPlatform,
        address _walletBountyAndAdvisors
    ) public {
        require(_startTime >= now);
        require(_wallet != 0x0);
        require(_walletCoreTeam != 0x0);
        require(_walletPlatform != 0x0);
        require(_walletBountyAndAdvisors != 0x0);
        require(vestedTeam.length == teamTokenAllocation.length);   // sanity checks
        require(stageCaps.length == stageTokenMul.length);   // sanity checks

        token = new THToken();
        wallet = _wallet;
        walletCoreTeam = _walletCoreTeam;
        walletPlatform = _walletPlatform;
        walletBountyAndAdvisors = _walletBountyAndAdvisors;
        startTime = _startTime;
        // Sale lasts up to 4 weeks and 4 days
        endTime = _startTime + 32 * 86400;
    }

    /*
     * @dev fallback for processing ether
     */
    function() public payable {
        buyTokens(msg.sender);
    }

    /*
     * @dev Sale is executed in stages/tranches. Each stage except the first is activated manually by the owner.
     * Only allow next stage when current stage/tranche is filled to cap.
     */
    function activateNextStage() onlyOwner public {
        uint256 stageIndex = activeStage;
        require(fundsRaised >= stageCaps[stageIndex]);
        require(stageIndex + 1 < stageCaps.length);

        activeStage = stageIndex + 1;
        StageOpened(activeStage + 1);
    }

    /*
     * @dev sell token and send to contributor address
     * @param contributor address
     */
    function buyTokens(address contributor) whenNotPaused beforeSaleEnds public payable {
        uint256 _stageIndex = activeStage;
        uint256 refund = 0;
        uint256 weiAmount = msg.value;
        uint256 _activeStageCap = stageCaps[_stageIndex];

        require(fundsRaised < _activeStageCap);
        require(validPurchase());
        require(canContribute(contributor, weiAmount));

        uint256 capDelta = _activeStageCap.sub(fundsRaised);

        if (capDelta < weiAmount) {
            // Not enough tokens available for full contribution, we will do a partial.
            weiAmount = capDelta;
            // Calculate refund for contributor.
            refund = msg.value.sub(weiAmount);
        }

        uint256 tokensToMint = weiAmount.mul(stageTokenMul[_stageIndex]);

        whitelist[contributor] = whitelist[contributor].sub(weiAmount);
        weiBalances[contributor] = weiBalances[contributor].add(weiAmount);

        fundsRaised = fundsRaised.add(weiAmount);
        token.mint(contributor, tokensToMint);

        // Refund after state changes for re-entrancy safety
        if (refund > 0) {
            msg.sender.transfer(refund);
        }
        TokenPurchase(0x0, contributor, weiAmount, tokensToMint);

        if (fundsRaised >= _activeStageCap) {
            finalizeCurrentStage();
        }
    }

    function canContribute(address contributor, uint256 weiAmount) public view returns (bool) {
        require(contributor != 0x0);
        require(weiAmount > 0);
        return (whitelist[contributor] >= weiAmount);
    }

    function addWhitelist(address contributor, uint256 weiAmount) onlyOwner public returns (bool) {
        require(contributor != 0x0);
        require(weiAmount > 0);
        // Only ever set the new amount, even if user is already whitelisted with a previous value set
        whitelist[contributor] = weiAmount;
        Whitelisted(contributor, weiAmount);
        return true;
    }

    /*
     * @dev Add participants to whitelist in bulk
     * TODO: Potentially optimize gas cost
     */
    function addWhitelistBulk(address[] contributors, uint256[] amounts) onlyOwner beforeSaleEnds public returns (bool) {
        address contributor;
        uint256 amount;
        require(contributors.length == amounts.length);

        for (uint i = 0; i < contributors.length; i++) {
            contributor = contributors[i];
            amount = amounts[i];
            require(addWhitelist(contributor, amount));
        }
        return true;
    }

    function withdraw() onlyOwner public {
        require(softCapReached);
        require(this.balance > 0);

        wallet.transfer(this.balance);
    }

    function withdrawCoreTeamTokens() onlyOwner public {
        require(saleSuccessfullyFinished);

        if (now > startTime + 720 days && vestedTeam[3] > 0) {
            token.transfer(walletCoreTeam, vestedTeam[3]);
            vestedTeam[3] = 0;
        }
        if (now > startTime + 600 days && vestedTeam[2] > 0) {
            token.transfer(walletCoreTeam, vestedTeam[2]);
            vestedTeam[2] = 0;
        }
        if (now > startTime + 480 days && vestedTeam[1] > 0) {
            token.transfer(walletCoreTeam, vestedTeam[1]);
            vestedTeam[1] = 0;
        }
        if (now > startTime + 360 days && vestedTeam[0] > 0) {
            token.transfer(walletCoreTeam, vestedTeam[0]);
            vestedTeam[0] = 0;
        }
    }

    function withdrawAdvisorTokens() onlyOwner public {
        require(saleSuccessfullyFinished);

        if (now > startTime + 180 days && vestedAdvisors > 0) {
            token.transfer(walletBountyAndAdvisors, vestedAdvisors);
            vestedAdvisors = 0;
        }
    }

    /*
     * @dev Leave token balance as is.
     * The tokens are unusable if a refund call could be successful due to transferAllowed = false upon failing to reach SOFT_CAP.
     */
    function refund() public {
        require(refundAllowed);
        require(!softCapReached);
        require(weiBalances[msg.sender] > 0);

        uint256 currentBalance = weiBalances[msg.sender];
        weiBalances[msg.sender] = 0;
        msg.sender.transfer(currentBalance);
    }

    /*
     * @dev When finishing the crowdsale we mint non-crowdsale tokens based on total tokens minted during crowdsale
     */
    function finishCrowdsale() onlyOwner public returns (bool) {
        require(now >= endTime || fundsRaised >= HARD_CAP);
        require(!saleSuccessfullyFinished && !refundAllowed);

        // Crowdsale successful
        if (softCapReached) {
            uint256 _crowdsaleAllocation = CROWDSALE_ALLOCATION; // 60% crowdsale
            uint256 crowdsaleTokens = token.totalSupply();

            uint256 tokensBounty = crowdsaleTokens.mul(varTokenAllocation[0]).div(_crowdsaleAllocation); // 5% Bounty
            uint256 tokensAdvisors = crowdsaleTokens.mul(varTokenAllocation[1]).div(_crowdsaleAllocation); // 5% Advisors
            uint256 tokensPlatform = crowdsaleTokens.mul(varTokenAllocation[2]).div(_crowdsaleAllocation); // 10% Platform

            vestedAdvisors = tokensAdvisors;

            // 20% Team
            uint256 tokensTeam = 0;
            uint len = teamTokenAllocation.length;
            uint amount = 0;
            for (uint i = 0; i < len; i++) {
                amount = crowdsaleTokens.mul(teamTokenAllocation[i]).div(_crowdsaleAllocation);
                vestedTeam[i] = amount;
                tokensTeam = tokensTeam.add(amount);
            }

            token.mint(walletBountyAndAdvisors, tokensBounty);
            token.mint(walletPlatform, tokensPlatform);

            token.mint(this, tokensAdvisors);
            token.mint(this, tokensTeam);

            token.endMinting(true);
            saleSuccessfullyFinished = true;
            Finalized(true);
            return true;
        } else {
            refundAllowed = true;
            // Token contract gets destroyed
            token.endMinting(false);
            Finalized(false);
            return false;
        }
    }

    // @return user balance
    function balanceOf(address _owner) public view returns (uint256 balance) {
        return token.balanceOf(_owner);
    }

    function hasStarted() public view returns (bool) {
        return now >= startTime;
    }

    function hasEnded() public view returns (bool) {
        return now >= endTime || fundsRaised >= HARD_CAP;
    }

    function validPurchase() internal view returns (bool) {
        // Extended from 2 * 86400 to 200.000 seconds, since there's a 48 hour pause scheduled after phase 1
        if(now <= (startTime + 200000) && msg.value < MIN_INVESTMENT_PHASE1) {
            return false;
        }
        bool withinPeriod = now >= startTime && now <= endTime;
        bool withinPurchaseLimits = msg.value >= MIN_INVESTMENT;
        return withinPeriod && withinPurchaseLimits;
    }

    function finalizeCurrentStage() internal {
        uint256 _stageIndex = activeStage;

        if (_stageIndex == 0) {
            softCapReached = true;
            SoftCapReached();
        } else if (_stageIndex == stageCaps.length - 1) {
            hardCapReached = true;
            HardCapReached();
        }

        StageClosed(_stageIndex + 1);
    }
}