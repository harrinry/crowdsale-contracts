pragma solidity ^0.4.15;

import 'zeppelin-solidity/contracts/token/MintableToken.sol';

contract AuthenticIDToken is MintableToken {
	string public constant NAME = "AuthenticIDToken";
	string public constant SYMBOL = "ATHAU";
	uint256 public constant DECIMAL = 18;
}
