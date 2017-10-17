const moment = require('moment')

const AuthenticIDCrowdsale = artifacts.require('AuthenticIDCrowdsale')

module.exports = function (deployer) {
  const threeMinutesFromNow = moment().add(0, 'minute')
  const oneMonthFromNow = moment().add(1, 'month')
  const startTime = threeMinutesFromNow.unix()
  const endTime = oneMonthFromNow.unix()

  deployer.deploy(
    AuthenticIDCrowdsale,
    startTime,
    endTime,
    1200,
    '0x00000000000000000000000000000000000000a1',
    '0x70b34d655564918d2bfb21c136e30faf2c6bb2c5',
    '0xf705fb71b53cf701ac2034d6dbf00aee2a101d55'
  )
}
