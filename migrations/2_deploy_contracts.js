const moment = require('moment')

const AuthenticIDCrowdsale = artifacts.require('AuthenticIDCrowdsale')

module.exports = function (deployer) {
  const athauCentRate = 15
  const etherUSDRate = 300

  // startTime: timestamp for public sale start
  const startTime = moment().add(3, 'minute').unix()

  // endTime: timestamp for public sale end
  const endTime = moment().add(1, 'month').unix()

  // rate: number of ATHAU tokens sold for 1 ether
  const rate = Math.round(etherUSDRate * 100 / athauCentRate)

  // walletAddress: address of the wallet where ether sent with public sale
  //                buys will be forwarded
  const walletAddress = '0xa5f471b71baaf9cd9044c1ea8cfc4dab97e3040a'

  // authenticIDAddress: address where 35% (350 million) ATHAU token grant
  //                     for Authentic ID will be allocated
  const authenticIDAddress = '0x70b34d655564918d2bfb21c136e30faf2c6bb2c5'

  // adoptionRewardsAddress: address where 35% (350 million) ATHAU token
  //                         grant for adoption rewards will be allocated
  const adoptionRewardsAddress = '0xf705fb71b53cf701ac2034d6dbf00aee2a101d55'

  // ownerAddress: address that will own the deployed contract. This address
  //               will be the only address with the ability to allocate
  //               tokens and create bounty grants
  const ownerAddress = '0xe2b3204f29ab45d5fd074ff02ade098fbc381d42'

  deployer.deploy(
    AuthenticIDCrowdsale,
    startTime,
    endTime,
    rate,
    walletAddress,
    authenticIDAddress,
    adoptionRewardsAddress
  ).then(() => {
    AuthenticIDCrowdsale.at(AuthenticIDCrowdsale.address).transferOwnership(ownerAddress)
  })
}
