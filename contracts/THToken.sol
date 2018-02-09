pragma solidity ^0.4.18;

import './zeppelin-solidity/token/ERC20/MintableToken.sol';

contract THToken is MintableToken {

    string public constant name = 'Tradershub Token';
    string public constant symbol = 'THT';
    uint8 public constant decimals = 18;

    bool public transferAllowed = false;

    event TransferAllowed(bool transferIsAllowed);

    modifier canTransfer() {
        require(mintingFinished && transferAllowed);
        _;
    }

    function transferFrom(address from, address to, uint256 value) canTransfer public returns (bool) {
        return super.transferFrom(from, to, value);
    }

    function transfer(address to, uint256 value) canTransfer public returns (bool) {
        return super.transfer(to, value);
    }

    function mint(address contributor, uint256 amount) public returns (bool) {
        return super.mint(contributor, amount);
    }

    function endMinting(bool _transferAllowed) public returns (bool) {
        transferAllowed = _transferAllowed;
        TransferAllowed(_transferAllowed);
        return super.finishMinting();
    }
}
