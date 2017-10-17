pragma solidity ^0.4.15;

import './AuthenticIDToken.sol';
import 'zeppelin-solidity/contracts/crowdsale/FinalizableCrowdsale.sol';
import 'zeppelin-solidity/contracts/token/TokenTimelock.sol';

/// @title AuthenticIDCrowdsale
/// @dev Contract for the AuthenticID crowdsale.
///
///      This contract creates an AuthenticIDToken, which is a MintableToken that it owns.
///
///      This contract controls all minting of AuthenticIDToken, and caps the total supply
///      at 1 billion * 10^18. The rules for minting are as follows:
///
///         * 350 million * 10^18 minted for AuthenticID on contract creation
///         * 350 million * 10^18 minted for Adoption Rewards on contract creation
///         * Up to 50 million * 10^18 minted for bounty rewards recipients
///         * Up to 250 million * 10^18 minted for buyers. This includes tokens allocated by contract
///           owner to private buyers through allocateTokens(), and tokens minted for direct purchases
///           through buyToken().
///
///      Token minting and allocation by owner, and issuing of bounty grants by owner is allowed from
///      the creation of the contract until 30 days after the end of the public sale.
contract AuthenticIDCrowdsale is FinalizableCrowdsale {

  /// @dev Event for logging the allocation of tokens to buyers
  /// @param beneficiary The address of the buyer who is the beneficiary of the allocation
  /// @param amount The amount of tokens being allocated to the beneficiary
  event TokenAllocation(address beneficiary, uint256 amount);

  /// event for TokenTimelock contract creation
  /// @param timelockAddress Address of the TokenTimelock contract
  /// @param amount Amount of tokens allocated to the timelock
  /// @param beneficiary The beneficiary of the future token release, after timelock period ends
  /// @param releaseTime The time when tokens become available to the beneficiary
  event TimelockCreated(address timelockAddress, uint256 amount, address beneficiary, uint256 releaseTime);

  /// event for creation of a bounty token grant
  /// @param beneficiary The beneficiary of the future token releases
  /// @param amount The amount of tokens granted
  /// @param totalBountyGrantAmount The total amount of all bounty tokens granted
  event BountyTokenGrantCreated(address beneficiary, uint256 amount, uint256 totalBountyGrantAmount);

  /// event for logging token bonuses that were granted as part of a purchase
  /// @param purchaser Address that paid for the tokens
  /// @param beneficiary Address that the token bonus was minted for
  /// @param bonusAmount The amount of bonus tokens minted
  event TokenBonus(address purchaser, address beneficiary, uint256 bonusAmount);

  // ATHAU token unit, uses same decimal value as ETH
  uint256 public constant TOKEN_UNIT = 10 ** 18;

  // Maximum amount of tokens in circulation: 1 billion * 10^18
  uint256 public constant MAX_TOKENS = 10 ** 9 * TOKEN_UNIT;

  // Maximum amount of tokens that can be allocated to bounty grants (5% of MAX_TOKENS)
  uint256 public constant MAX_BOUNTY_GRANT_TOKENS = MAX_TOKENS * 5 / 100;

  // Maximum amount of tokens that can be sold (25% of MAX_TOKENS). This includes tokens
  // allocated by the contract owner via allocateTokens() and tokens purchased directly
  // from the crowdsale contract via buyTokens()
  uint256 public constant MAX_SALE_TOKENS = MAX_TOKENS * 25 / 100;

  // Maximum and minimum amount of tokens that can be bought in a transaction to buyTokens()
  uint256 public constant MAX_TOKEN_BUY = 66665 * TOKEN_UNIT;
  uint256 public constant MIN_TOKEN_BUY = 1000 * TOKEN_UNIT;

  // address for 35% allocation of tokens retained by AuthenticID
  address public authenticIDAddress;

  // address for 35% allocation of tokens for adoption rewards
  address public adoptionRewardsAddress;

  // mapping for bounty token allocation timelocks (6, 9, and 12 month)
  mapping (address => TokenTimelock[3]) bountyTimelocks;

  // mapping of addresses that have received bounty grants
  mapping (address => bool) bountyGrantAddresses;

  // total amount of tokens that have been allocated to bounty grants
  uint256 bountyGrantsTotalAmount;

  // total amount of tokens allocated to buyers by the contract owner
  uint256 tokensAllocatedTotal;

  // total amount of tokens purchased directly from the crowdsale contract
  uint256 tokensPurchasedTotal;

  // token grant release times for timelocks
  uint256 sixMonthReleaseTime;
  uint256 nineMonthReleaseTime;
  uint256 twelveMonthReleaseTime;
  uint256 twentyFourMonthReleaseTime;

  // end time for the allocation period. after this time, allocations for buyers
  // and bounties are locked
  uint256 allocationPeriodEndTime;

  // set to true after initial token grant to authenticIDAddress
  bool authenticIDTokensGranted;

  // set to true after initial token grant to adoptionRewardsAddress
  bool adoptionRewardsTokensGranted;

  // Array of AuthenticID token allocation timelocks (6 and 12 month)
  TokenTimelock[2] authenticIDTimelocks;

  // modifier to require the allocation period to be open
  modifier allocationPeriodOpen() {
    require(allocationPeriodEndTime > now);
    _;
  }

  // modifier to require that crowdsale is not finalized
  modifier notFinalized() {
    require(!isFinalized);
    _;
  }

  /// @dev The AuthenticIDCrowdsale constructor executes Crowdsale constructor to set start time and end
  ///      time for public sale, rate for public sale, and wallet address to hold funds raised from public
  ///      sale. Crowdsale constructor also calls createTokenContract() to created the AuthenticIDToken 
  ///      contract.
  /// @param _startTime Start time for the public sale
  /// @param _endTime End time for the public sale
  /// @param _rate Rate of ATHAU token per Ether for public sale
  /// @param _wallet Address where proceeds from the sale are forwarded
  /// @param _authenticIDAddress Address for 35% allocation of ATHAU token for AuthenticID
  /// @param _adoptionRewardsAddress Address for 35% allocation of ATHAU token for Adoption Rewards
  function AuthenticIDCrowdsale(uint256 _startTime, uint256 _endTime, uint256 _rate, address _wallet, address _authenticIDAddress, address _adoptionRewardsAddress)
    Crowdsale(_startTime, _endTime, _rate, _wallet)
    public
  {
    authenticIDAddress = _authenticIDAddress;
    adoptionRewardsAddress = _adoptionRewardsAddress;

    sixMonthReleaseTime = _endTime + 4380 hours;
    nineMonthReleaseTime = _endTime + 6570 hours;
    twelveMonthReleaseTime = _endTime + 8760 hours;
    twentyFourMonthReleaseTime = _endTime + 17520 hours;

    // allocation period ends 30 days after sale end time
    allocationPeriodEndTime = _endTime + 720 hours;

    initAuthenticIDTokenGrant();
    initAdoptionRewardsGrant();
  }

  // @dev Returns array of timelocks for AuthenticID
  function getAuthenticIDTimelocks() public constant returns (TokenTimelock[2]) {
    return authenticIDTimelocks;
  }

  /// @dev Returns array of timelocks from a bounty allocation
  /// @param _beneficiary Address that the timelocked tokens will be released to
  function getBountyTimelocks(address _beneficiary) public constant returns (TokenTimelock[3]) {
    return bountyTimelocks[_beneficiary];
  }

  /// @dev allocate tokens for a buyer
  /// @param _beneficiary Address that tokens are minted for
  /// @param _amount Ammount of tokens being allocated to the beneficiary
  function allocateTokens(address _beneficiary, uint256 _amount) onlyOwner allocationPeriodOpen notFinalized public {
    require(_beneficiary != 0x0);
    require(validAllocation(_amount));
    token.mint(_beneficiary, _amount);
    tokensAllocatedTotal = tokensAllocatedTotal.add(_amount);
    TokenAllocation(_beneficiary, _amount);
  }

  /// @dev Creates timelocked token grants for bounty allocations. Will not allow
  /// more than MAX_BOUNTY_GRANT_TOKENS (5% of total token supply) to be created.
  /// @param _beneficiary Address that the timelocked tokens will be released to
  /// @param _amount Amount of tokens to include in the grant
  function createBountyTokenGrant(address _beneficiary, uint256 _amount) onlyOwner allocationPeriodOpen notFinalized public {
    require(_beneficiary != 0x0);
    require(_amount > 0);
    require(bountyGrantsTotalAmount.add(_amount) <= MAX_BOUNTY_GRANT_TOKENS);
    require(!bountyGrantAddresses[_beneficiary]);
    uint256 _tl1Amount = _amount.mul(50).div(100);
    uint256 _tl2Amount = _amount.mul(25).div(100);
    uint256 _tl3Amount = _amount.mul(25).div(100);
    TokenTimelock _tl1 = createTimelock(_tl1Amount, _beneficiary, sixMonthReleaseTime);
    TokenTimelock _tl2 = createTimelock(_tl2Amount, _beneficiary, nineMonthReleaseTime);
    TokenTimelock _tl3 = createTimelock(_tl3Amount, _beneficiary, twelveMonthReleaseTime);
    bountyTimelocks[_beneficiary] = [_tl1, _tl2, _tl3];
    bountyGrantAddresses[_beneficiary] = true;
    bountyGrantsTotalAmount = bountyGrantsTotalAmount.add(_amount);
    BountyTokenGrantCreated(_beneficiary, _amount, bountyGrantsTotalAmount);
  }

  // creates the token to be sold.
  function createTokenContract() internal returns (MintableToken) {
    return new AuthenticIDToken();
  }

  // @dev Initialize 35% token allocation for AuthenticID. Creates two timelocked
  // grants, each with 17.5% of MAX_TOKENS. These are locked for 6 months and 12 months
  // after token sale end, respectively.
  function initAuthenticIDTokenGrant() private {
    require(!authenticIDTokensGranted);
    uint256 _authIdGrantAmount = MAX_TOKENS.mul(35).div(100);
    uint256 _timelockAmount = _authIdGrantAmount.div(2);
    TokenTimelock _tl1 = createTimelock(_timelockAmount, authenticIDAddress, twelveMonthReleaseTime);
    TokenTimelock _tl2 = createTimelock(_timelockAmount, authenticIDAddress, twentyFourMonthReleaseTime);
    authenticIDTimelocks = [_tl1, _tl2];
    authenticIDTokensGranted = true;
  }

  // @dev Initialize 35% token allocation for Adoption Rewards. Directly minted without timelock.
  function initAdoptionRewardsGrant() private {
    require(!adoptionRewardsTokensGranted);
    uint256 _adoptionRewardsGrantAmount = MAX_TOKENS.mul(35).div(100);
    token.mint(adoptionRewardsAddress, _adoptionRewardsGrantAmount);
    adoptionRewardsTokensGranted = true;
  }

  // @dev Creates a new timelock for AuthenticIDToken
  // @param _amount Amount of tokens allocated to the timelock
  // @param beneficiary The Beneficiary of the future token release, after timelock period ends
  // @param releaseTime The time when tokens become available to the beneficiary
  function createTimelock(uint256 _amount, address _beneficiary, uint256 _releaseTime) private returns (TokenTimelock) {
    TokenTimelock tokenTimelock = new TokenTimelock(token, _beneficiary, uint64(_releaseTime));
    token.mint(tokenTimelock, _amount);
    TimelockCreated(tokenTimelock, _amount, _beneficiary, _releaseTime);
    return tokenTimelock;
  }

  // low level token purchase function from Crowdsale.sol,
  // overriding to add bonus token minting
  function buyTokens(address _beneficiary) public payable {
    require(_beneficiary != 0x0);
    require(validPurchase());

    uint256 _tokenBonusAmount = tokenBonusAmount();

    if (_tokenBonusAmount > 0) {
      token.mint(_beneficiary, _tokenBonusAmount);
      tokensPurchasedTotal = tokensPurchasedTotal.add(_tokenBonusAmount);
      TokenBonus(msg.sender, _beneficiary, _tokenBonusAmount);
    }

    Crowdsale.buyTokens(_beneficiary);

    uint256 _tokenBuyAmount = tokenBuyAmount();
    tokensPurchasedTotal = tokensPurchasedTotal.add(_tokenBuyAmount);
  }

   /// @dev Returns the percentage of the purchase amount to mint for the buyer as a bonus
   ///      This is based on the following schedule:
   ///      Week 1: 15% bonus
   ///      Week 2: 10% bonus
   ///      Week 3: 5% bonus
   ///      Week 4: no bonus
  function bonusPercentage() constant returns (uint256) {
    if (now - startTime < 168 hours) { // week 1 of crowdsale
      return 15;
    } else if (now - startTime < 336 hours) { // week 2 of crowdsale
      return 10;
    } else if (now - startTime < 504 hours) { // week 3 of crowdsale
      return 5;
    } else { // after week 3
      return 0;
    }
  }

  // @dev used to check if an allocation amount is valid
  // @param _amount The amount of tokens to be allocated
  // @return true if the transaction can buy tokens
  function validAllocation(uint256 _amount) internal constant returns (bool) {
    bool _amountAboveZero = _amount > 0;
    bool _saleCapExceeded = tokensSoldTotal().add(_amount) > MAX_SALE_TOKENS;
    return _amountAboveZero && !_saleCapExceeded;
  }

  // @dev extends validPurchase() from Crowdsale to include a check to see if the max sale cap
  //      was exceeded. This is cap check is inclusive of the bonus amount. Also checks that
  //      the amount of tokens bought is within the min and max bounds.
  // @returns true if the purchase is valid
  function validPurchase() internal constant returns (bool) {
    uint256 _tokenBuyAmount = tokenBuyAmount();
    uint256 _tokenBonusAmount = tokenBonusAmount();
    bool _saleCapExceeded = tokensSoldTotal().add(_tokenBuyAmount).add(_tokenBonusAmount) > MAX_SALE_TOKENS;
    bool _maxBuyExceeded = _tokenBuyAmount > MAX_TOKEN_BUY;
    bool _minBuyMet = _tokenBuyAmount >= MIN_TOKEN_BUY;
    return !_saleCapExceeded && !_maxBuyExceeded && _minBuyMet && Crowdsale.validPurchase();
  }

  // @returns the amount of tokens purchased in this transaction, not including any bonus
  function tokenBuyAmount() internal constant returns (uint256) {
    return msg.value.mul(rate);
  }

  // @returns the amount of tokens given as bonus in this transaction
  function tokenBonusAmount() internal constant returns (uint256) {
    uint256 _tokenBuyAmount = tokenBuyAmount();
    uint256 _bonusPercentage = bonusPercentage();
    if (_bonusPercentage > 0) {
      return _tokenBuyAmount.mul(_bonusPercentage).div(100);
    } else {
      return 0;
    }
  }

  // @returns total amount of tokens sold, which includes tokens purchased directly from
  //          the contract, and tokens allocated by the contract owner
  function tokensSoldTotal() internal constant returns (uint256) {
    return tokensPurchasedTotal.add(tokensAllocatedTotal);
  }

}
