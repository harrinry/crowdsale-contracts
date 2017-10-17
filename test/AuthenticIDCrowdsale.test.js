/* global describe test expect beforeEach */

import {
  AuthenticIDCrowdsale,
  AuthenticIDToken,
  TokenTimelock
} from 'helpers/contracts'
import moment from 'moment'
import lkTestHelpers from 'lk-test-helpers'
import { web3 } from 'helpers/w3'

const { increaseTime, latestTime } = lkTestHelpers(web3)

const { accounts } = web3.eth

const ALLOCATION_AMOUNT = 46 * (10 ** 18)

// rate calc: $300 = 1 ETH | $0.15 = 1 ATHAU | 1 ETH = 300 / 0.15 ATHAU = 2,000 ATHAU
const ETH_USD_RATE = 300
const ATHAU_USD_RATE = 0.15
const ETH_ATHAU_RATE = ETH_USD_RATE / ATHAU_USD_RATE // 2000

let MAX_TOKENS, AUTHENTIC_ID_ADDRESS, ADOPTION_REWARDS_ADDRESS, MAX_BOUNTY_GRANT_TOKENS, MAX_SALE_TOKENS
let SIX_MONTH_RELEASE_TIME, NINE_MONTH_RELEASE_TIME, TWELVE_MONTH_RELEASE_TIME, TWENTY_FOUR_MONTH_RELEASE_TIME
let MAX_TOKEN_BUY, MIN_TOKEN_BUY

describe('AuthenticIDCrowdsale', () => {
  beforeEach(async () => {
    const crowdsale = await newAuthenticIDCrowdsale()
    const endTime = await defaultEndTime()
    SIX_MONTH_RELEASE_TIME = moment(endTime).add(4380, 'hours').unix()
    NINE_MONTH_RELEASE_TIME = moment(endTime).add(6570, 'hours').unix()
    TWELVE_MONTH_RELEASE_TIME = moment(endTime).add(8760, 'hours').unix()
    TWENTY_FOUR_MONTH_RELEASE_TIME = moment(endTime).add(17520, 'hours').unix()
    MAX_TOKENS = await crowdsale.MAX_TOKENS.call()
    MAX_BOUNTY_GRANT_TOKENS = await crowdsale.MAX_BOUNTY_GRANT_TOKENS.call()
    MAX_SALE_TOKENS = await crowdsale.MAX_SALE_TOKENS.call()
    MIN_TOKEN_BUY = await crowdsale.MIN_TOKEN_BUY.call()
    MAX_TOKEN_BUY = await crowdsale.MAX_TOKEN_BUY.call()
    AUTHENTIC_ID_ADDRESS = await crowdsale.authenticIDAddress.call()
    ADOPTION_REWARDS_ADDRESS = await crowdsale.adoptionRewardsAddress.call()
  })

  test('creating with valid params should succeed', async () => {
    const crowdsale = await newAuthenticIDCrowdsale()
    expect(crowdsale.address).toBeDefined()
  })

  test('token contract is created', async () => {
    const crowdsale = await newAuthenticIDCrowdsale()
    const token = await tokenFor(crowdsale)
    expect(token).toBeDefined()
  })

  /*
   *  Test allocateTokens
   */

  describe('allocateTokens', () => {
    test('can allocate tokens', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      const token = await tokenFor(crowdsale)
      const beforeBalance = await token.balanceOf(accounts[4])
      await crowdsale.allocateTokens(accounts[4], ALLOCATION_AMOUNT)
      const afterBalance = await token.balanceOf(accounts[4])
      expect(beforeBalance.plus(ALLOCATION_AMOUNT).toNumber()).toEqual(afterBalance.toNumber())
    })

    test('allocateTokens creates TokenAllocation event', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      await expectEvent('TokenAllocation',
        crowdsale.allocateTokens(accounts[4], ALLOCATION_AMOUNT)
      )
    })

    test('allocateTokens throws if msg.sender is not owner', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[4], ALLOCATION_AMOUNT, { from: accounts[1] })
      )
    })

    test('allocateTokens throws if no beneficiary is set', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      await expectInvalidOpcode(
        crowdsale.allocateTokens('0x0', ALLOCATION_AMOUNT)
      )
    })

    test('allocateTokens throws if amount is not greater then zero', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[0], 0)
      )
    })

    test('allocateTokens throws if amount exceeds the sale cap', async () => {
      // first allocate 99% of cap, then attempt to allocate 2% of cap
      const crowdsale = await newAuthenticIDCrowdsale()
      await crowdsale.allocateTokens(accounts[4], MAX_SALE_TOKENS * 0.99)
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[5], MAX_SALE_TOKENS * 0.02)
      )
    })

    test('should throw if tokens sold plus allocated amount exceeds the sale cap', async () => {
      // first buy 30,000 tokens, then attempt an allocation that would exceed the cap
      const crowdsale = await newAuthenticIDCrowdsale()
      await increaseDays(2)
      await crowdsale.buyTokens(accounts[4], { value: 30000 / ETH_ATHAU_RATE * 10 ** 18 })
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[5], MAX_SALE_TOKENS - 20000)
      )
    })

    test('should throw if attempting to allocate after allocation period is over', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      await increaseDays(90)
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[4], 100 * 10 ** 18)
      )
    })

    test('should throw after finalization', async () => {
      const crowdsale = await newAuthenticIDCrowdsale()
      // increase to after public sale end date, but before 30 day allocation period is over
      await increaseDays(45)
      // allocate 10,000 ATHAU
      await crowdsale.allocateTokens(accounts[4], 10000 * 10 ** 18)
      // call finalize
      await crowdsale.finalize()
      // trying to allocate another 10,000 ATHAU should fail
      await expectInvalidOpcode(
        crowdsale.allocateTokens(accounts[4], 10000 * 10 ** 18)
      )
    })
  })

  /*
   *  Test grant initializations
   */

  describe('crowdsale initialization', () => {
    let _crowdsale, _timelockAddresses, _timelock1, _timelock2, _authIdToken

    beforeEach(async () => {
      _crowdsale = await newAuthenticIDCrowdsale()
      _timelockAddresses = await _crowdsale.getAuthenticIDTimelocks.call()
      _timelock1 = await TokenTimelock.at(_timelockAddresses[0])
      _timelock2 = await TokenTimelock.at(_timelockAddresses[1])
      _authIdToken = await tokenFor(_crowdsale)
    })

    describe('AUTHENTIC_ID_ADDRESS timelocks', () => {
      test('2 timelocks are created', async () => {
        expect(_timelockAddresses[0]).toBeValidAddress()
        expect(_timelockAddresses[1]).toBeValidAddress()
        expect(_timelockAddresses[2]).toBeUndefined()
      })

      test('both timelocks have 17.5% of max token supply', async () => {
        const bal1 = await _authIdToken.balanceOf.call(_timelockAddresses[0])
        const bal2 = await _authIdToken.balanceOf.call(_timelockAddresses[1])
        expect(bal1.toNumber()).toBe(MAX_TOKENS * (35 / 2) / 100)
        expect(bal2.toNumber()).toBe(MAX_TOKENS * (35 / 2) / 100)
      })

      test('both timelocks have the correct beneficiary set', async () => {
        const beneficiary1 = await _timelock1.beneficiary.call()
        const beneficiary2 = await _timelock2.beneficiary.call()
        expect(beneficiary1).toBe(AUTHENTIC_ID_ADDRESS)
        expect(beneficiary2).toBe(AUTHENTIC_ID_ADDRESS)
      })

      test('first timelock has a release date 12 months after sale end time', async () => {
        const releaseTime = await _timelock1.releaseTime.call()
        expect(releaseTime.toNumber()).toBe(TWELVE_MONTH_RELEASE_TIME)
      })

      test('second timelock has a release date 24 months after sale end time', async () => {
        const releaseTime = await _timelock2.releaseTime.call()
        expect(releaseTime.toNumber()).toBe(TWENTY_FOUR_MONTH_RELEASE_TIME)
      })
    })

    test('should mint 35% of max token supply to the ADOPTION_REWARDS_ADDRESS adddress', async () => {
      const bal = (await _authIdToken.balanceOf.call(ADOPTION_REWARDS_ADDRESS)).toNumber()
      expect(bal).toBe(MAX_TOKENS * 35 / 100)
    })
  })

  /*
   *  Test createBountyTokenGrant
   */

  describe('createBountyTokenGrant', () => {
    let _crowdsale
    const _beneficiary = '0x49b59920e22ce3e799e7e808754d4b47885bbad9'
    const _beneficiary2 = '0x5dcbd4f69af30fbb66a36eed706737f18d6c0c25'
    const _grantAmount = web3.toWei(100, 'ether')

    beforeEach(async () => {
      _crowdsale = await newAuthenticIDCrowdsale()
    })

    describe('when given valid params', () => {
      let _authIdToken, _timelockAddresses, _timelock1, _timelock2, _timelock3

      beforeEach(async () => {
        _authIdToken = await tokenFor(_crowdsale)
        await _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
        _timelockAddresses = await _crowdsale.getBountyTimelocks.call(_beneficiary)
        _timelock1 = await TokenTimelock.at(_timelockAddresses[0])
        _timelock2 = await TokenTimelock.at(_timelockAddresses[1])
        _timelock3 = await TokenTimelock.at(_timelockAddresses[2])
      })

      test('should create 3 timelock contracts for the beneficiary', async () => {
        expect(_timelockAddresses[0]).toBeValidAddress()
        expect(_timelockAddresses[1]).toBeValidAddress()
        expect(_timelockAddresses[2]).toBeValidAddress()
        expect(_timelockAddresses[3]).toBeUndefined()
      })

      test('should set the correct beneficiary for timelocks', async () => {
        const beneficiary1 = await _timelock1.beneficiary.call()
        const beneficiary2 = await _timelock2.beneficiary.call()
        const beneficiary3 = await _timelock3.beneficiary.call()
        expect(beneficiary1).toBe(_beneficiary)
        expect(beneficiary2).toBe(_beneficiary)
        expect(beneficiary3).toBe(_beneficiary)
      })

      test('should create first timelock with 50% of amount', async () => {
        const bal = (await _authIdToken.balanceOf.call(_timelockAddresses[0])).toNumber()
        expect(bal).toBe(_grantAmount * 50 / 100)
      })

      test('should create second timelock with 25% of amount', async () => {
        const bal = (await _authIdToken.balanceOf.call(_timelockAddresses[1])).toNumber()
        expect(bal).toBe(_grantAmount * 25 / 100)
      })

      test('should create third timelock with 25% of amount', async () => {
        const bal = (await _authIdToken.balanceOf.call(_timelockAddresses[2])).toNumber()
        expect(bal).toBe(_grantAmount * 25 / 100)
      })

      test('should set release time for first timelock to six months after sale end', async () => {
        const releaseTime = await _timelock1.releaseTime.call()
        expect(releaseTime.toNumber()).toBe(SIX_MONTH_RELEASE_TIME)
      })

      test('should set release time for second timelock to nine months after sale end', async () => {
        const releaseTime = await _timelock2.releaseTime.call()
        expect(releaseTime.toNumber()).toBe(NINE_MONTH_RELEASE_TIME)
      })

      test('should set release time for third timelock to twelve months after sale end', async () => {
        const releaseTime = await _timelock3.releaseTime.call()
        expect(releaseTime.toNumber()).toBe(TWELVE_MONTH_RELEASE_TIME)
      })
    })

    test('should log a BountyTokenGrantCreated event', async () => {
      await expectEvent('BountyTokenGrantCreated',
        _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
      )
    })

    test('should throw if msg.sender is not owner', async () => {
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount, { from: accounts[1] })
      )
    })

    test('should throw if beneficiary is not an address', async () => {
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(null, _grantAmount)
      )
    })

    test('should throw if amount is not greater than 0', async () => {
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(_beneficiary, 0)
      )
    })

    test('should throw if beneficiary has already received a grant', async () => {
      await _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
      )
    })

    test('should throw if the grant exceeds MAX_BOUNTY_GRANT_TOKENS', async () => {
      // first grant 75% of max bounty token grants to an address
      await _crowdsale.createBountyTokenGrant(accounts[5], MAX_BOUNTY_GRANT_TOKENS * 75 / 100)
      // then attempt to grant 30% of max bounty token grants to an address, exceeding the max
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(_beneficiary, MAX_BOUNTY_GRANT_TOKENS * 30 / 100)
      )
    })

    test('should throw if allocation period is not open', async () => {
      await increaseDays(90)
      await expectInvalidOpcode(
        _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
      )
    })

    test('should throw after finalization', async () => {
      // increase to after public sale end date, but before 30 day allocation period is over
      await increaseDays(45)
      // should succeed
      await _crowdsale.createBountyTokenGrant(_beneficiary, _grantAmount)
      // call finalize
      await _crowdsale.finalize()
      // trying to grant after finalization should fail
      await expectInvalidOpcode(
        _crowdsale.allocateTokens(_beneficiary2, _grantAmount)
      )
    })
  })

  /*
   * Test buyTokens
   */

  describe('buyTokens', () => {
    let _crowdsale, _authIdToken
    const _beneficiary = '0x49b59920e22ce3e799e7e808754d4b47885bbad9'

    beforeEach(async () => {
      _crowdsale = await newAuthenticIDCrowdsale()
      _authIdToken = await tokenFor(_crowdsale)
    })

    test('should allow token buy of exactly MAX_TOKEN_BUY', async () => {
      await increaseDays(29)
      await _crowdsale.buyTokens(_beneficiary, { value: MAX_TOKEN_BUY / ETH_ATHAU_RATE })
      const bal = (await _authIdToken.balanceOf(_beneficiary)).toNumber()
      expect(bal).toBe(MAX_TOKEN_BUY.toNumber())
    })

    test('should allow token buy of exactly MIN_TOKEN_BUY', async () => {
      await increaseDays(29)
      await _crowdsale.buyTokens(_beneficiary, { value: MIN_TOKEN_BUY / ETH_ATHAU_RATE })
      const bal = (await _authIdToken.balanceOf(_beneficiary)).toNumber()
      expect(bal).toBe(MIN_TOKEN_BUY.toNumber())
    })

    test('should still be valid if MAX_TOKEN_BUY is exceeded by bonus amount', async () => {
      // increase 1 day after start, which will give 15% bonus
      await increaseDays(2)
      await _crowdsale.buyTokens(_beneficiary, { value: MAX_TOKEN_BUY / ETH_ATHAU_RATE })
      const bal = (await _authIdToken.balanceOf(_beneficiary)).toNumber()
      expect(bal).toBe(MAX_TOKEN_BUY.toNumber() + MAX_TOKEN_BUY.toNumber() * 0.15)
    })

    test('should add 15% bonus in week 1', async () => {
      await bonusRateTest(115, 3)
    })

    test('should add 10% bonus in week 2', async () => {
      await bonusRateTest(110, 10)
    })

    test('should add 5% bonus in week 3', async () => {
      await bonusRateTest(105, 17)
    })

    test('should not add bonus in week 4', async () => {
      await bonusRateTest(100, 24)
    })

    async function bonusRateTest (expectedBonusRate, daysAfterSale) {
      const bonusRate = expectedBonusRate / 100
      const ethAmount = 1
      await increaseDays(1 + daysAfterSale)
      await _crowdsale.buyTokens(_beneficiary, { value: web3.toWei(ethAmount, 'ether') })
      const bal = (await _authIdToken.balanceOf(_beneficiary)).toNumber()
      expect(bal).toBe(parseInt(web3.toWei(ethAmount * ETH_ATHAU_RATE * bonusRate, 'ether')))
    }

    test('should throw if buy amount exceeds the sale cap', async () => {
      // increase time to 28 days after sale starts, so there's no bonus added
      await increaseDays(29)
      // first allocate enough to be 30,000 away from the cap
      await _crowdsale.allocateTokens(accounts[4], MAX_SALE_TOKENS - (30000 * 10 ** 18))
      await expectInvalidOpcode(
        // then attempt to buy more than 30,000 tokens
        _crowdsale.buyTokens(accounts[5], { value: (40000 / ETH_ATHAU_RATE) * 10 ** 18 })
      )
    })

    test('should throw if bonus amount exceeds the sale cap', async () => {
      // increase time to 1 day after sale starts, so there's a 15% bonus
      await increaseDays(2)
      // first allocate enough to be 30,000 away from the cap
      await _crowdsale.allocateTokens(accounts[4], MAX_SALE_TOKENS - (30000 * 10 ** 18))
      await expectInvalidOpcode(
        // then attempt to buy 29,000. The additional 15% bonus should cause it to exceed the cap
        _crowdsale.buyTokens(accounts[5], { value: (29000 / ETH_ATHAU_RATE) * 10 ** 18 })
      )
    })

    test('should throw if purchase amount exceeds MAX_TOKEN_BUY', async () => {
      await increaseDays(2)
      await expectInvalidOpcode(
        _crowdsale.buyTokens(accounts[5], { value: 34 * 10 ** 18 })
      )
    })

    test('should throw if purchase amount is less than MIN_TOKEN_BUY', async () => {
      await increaseDays(2)
      await expectInvalidOpcode(
        _crowdsale.buyTokens(accounts[5], { value: 0.4 * 10 ** 18 })
      )
    })
  })
})

async function newAuthenticIDCrowdsale () {
  const defaultStart = await defaultStartTime()
  const defaultEnd = await defaultEndTime()
  const crowdsale = await tryAsync(
    AuthenticIDCrowdsale.new(
      defaultStart.unix(),
      defaultEnd.unix(),
      ETH_ATHAU_RATE,
      '0x00000000000000000000000000000000000000a1',
      '0x70b34d655564918d2bfb21c136e30faf2c6bb2c5',
      '0xf705fb71b53cf701ac2034d6dbf00aee2a101d55'
    )
  )
  return crowdsale
}

// caching _latestTime so that we don't have to call latestTime() on every test run.
// This speeds the test suite up significantly.

let _latestTime // a moment() object

async function increaseDays (days) {
  const t = await increaseTestrpcTime(days * 60 * 60 * 24)
  return t
}

async function increaseTestrpcTime (duration) {
  await increaseTime(duration)
  _latestTime = await latestTime()
  return _latestTime
}

async function defaultStartTime () {
  if (!_latestTime) {
    _latestTime = await latestTime()
  }
  let blockTime = _latestTime
  return moment(blockTime).add(1, 'hours')
}

async function defaultEndTime () {
  if (!_latestTime) {
    _latestTime = await latestTime()
  }
  let blockTime = _latestTime
  return moment(blockTime).add(24 * 30 + 1, 'hours')
}

async function tokenFor (crowdsale) {
  const state = await crowdsale.state()
  const tokenAddress = state.props.token.address
  const token = await tryAsync(
    AuthenticIDToken.at(tokenAddress)
  )
  return token
}

async function tryAsync (asyncFn) {
  try {
    return await asyncFn
  } catch (err) {
    console.error(err)
  }
}

async function asyncExpectErr (asyncFn) {
  try {
    await asyncFn
  } catch (err) {
    return err
  }
}

async function expectInvalidOpcode (asyncFn) {
  const err = await asyncExpectErr(asyncFn)
  expect(err.message.search('invalid opcode')).toBeGreaterThan(-1)
}

async function expectEvent (eventName, asyncFn) {
  const { logs } = await asyncFn
  const event = logs.find(e => e.event === eventName)
  expect(event).toBeDefined()
}

function toUnits (bigNum) {
  return toBaseUnits(bigNum) / (10 ** 18)
}

function toBaseUnits (bigNum) {
  return bigNum.toNumber()
}
