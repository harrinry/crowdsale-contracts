# crowdsale-contracts

Contracts for AuthenticID crowdsale and token.

### Setup
```
$ yarn install
```

### Compile
Recompile contracts and build artifacts.
```
$ yarn compile
```

### Test
Run `yarn compile` before first test run, and after any changes to the `.sol` files
```
$ yarn test
```

### Deployment Setup

Add `secrets.json` to the project root

```
// secrets.json
{
  "mnemonic": "<some mnemonic>",
  "infura_apikey": "<your infura key>"
}
```

Go to https://iancoleman.github.io/bip39/, click "Generate". Add `BIP39 Mnemonic` to `"mnemonic"` value in `secrets.json`

Add address from the BIP39 page to MetaMask. Send it some rinkeby Ether, or get it from the faucet on https://www.rinkeby.io

Go to https://infura.io/register.html to register for Infura. Paste your API key into `"infura_apikey"` value in `secrets.json`

### Deploy
To deploy locally:
  * `yarn testrpc` to run local testrpc on port `8546`
  * `yarn deploy` to deploy to local testrpc

Run `yarn deploy-rinkeby` to deploy to rinkeby
