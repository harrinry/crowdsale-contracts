import truffleContract from 'truffle-contract'
import truffleExt from 'truffle-ext'
import { web3, web3Provider } from './w3'
import AuthenticIDCrowdsaleJSON from '../../build/contracts/AuthenticIDCrowdsale.json'
import AuthenticIDTokenJSON from '../../build/contracts/AuthenticIDToken.json'
import TokenTimelockJSON from '../../build/contracts/TokenTimelock.json'

export const AuthenticIDCrowdsale = getContract(AuthenticIDCrowdsaleJSON)
export const AuthenticIDToken = getContract(AuthenticIDTokenJSON)
export const TokenTimelock = getContract(TokenTimelockJSON)

function getContract (contractAbi) {
  const { requireContract } = truffleExt(web3)
  return requireContract(getTruffleContract(contractAbi))
}

function getTruffleContract (contractAbi) {
  const contract = truffleContract(contractAbi)
  contract.setProvider(web3Provider)
  contract.defaults({
    from: web3.eth.accounts[0],
    gas: 4712388
  })
  return contract
}
