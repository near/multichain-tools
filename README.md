# MultiChain Tools

MultiChain Tools is a TypeScript package that provides a set of utilities and functions for interacting with various blockchain networks, including Ethereum (EVM-based chains) and Bitcoin. It offers an easy way to sign and send transactions, fetch derived addresses, and estimate transaction fees.

## Installation

To install MultiChain Tools, use npm:

    npm install multichain-tools

## Usage

To use MultiChain Tools in your project, import the required functions and classes:

```typescript
import {
  signAndSendEVMTransaction,
  signAndSendBTCTransaction,
  fetchDerivedEVMAddress,
  fetchBTCFeeProperties,
  fetchDerivedBTCAddress,
  fetchEstimatedEVMFee,
  fetchEVMFeeProperties,
  fetchDerivedBTCAddressAndPublicKey,
} from 'multichain-tools'
```

## Examples

Signing and Sending an EVM Transaction

```typescript
const evmRequest: EVMRequest = {
  chainConfig: {
    providerUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
    contract: '0x1234567890123456789012345678901234567890',
  },
  transaction: {
    to: '0x0987654321098765432109876543210987654321',
    value: '1000000000000000000', // 1 ETH
    derivedPath: "m/44'/60'/0'/0/0",
  },
  nearAuthentication: {
    networkId: 'mainnet',
    keypair: nearKeypair,
    accountId: 'example.near',
  },
  fastAuthRelayerUrl: 'https://fastauth.example.com',
}

const response: Response = await signAndSendEVMTransaction(evmRequest)
```

Signing and Sending a Bitcoin Transaction

```typescript
typescriptCopy codeconst btcRequest: BitcoinRequest = {
  chainConfig: {
    providerUrl: 'https://btc.example.com/api/',
    contract: 'example.near',
  },
  transaction: {
    to: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    value: '1000000', // 0.01 BTC
    derivedPath: "m/44'/0'/0'/0/0",
  },
  nearAuthentication: {
    networkId: 'mainnet',
    keypair: nearKeypair,
    accountId: 'example.near',
  },
  fastAuthRelayerUrl: 'https://fastauth.example.com',
};

const response: Response = await signAndSendBTCTransaction(btcRequest);
```

Fetching Derived Addresses

```typescript
const evmAddress: string = await fetchDerivedEVMAddress(
  'example.near',
  "m/44'/60'/0'/0/0",
  'mainnet',
  'example.near'
)

const { address: btcAddress, publicKey: btcPublicKey } =
  await fetchDerivedBTCAddressAndPublicKey(
    'example.near',
    "m/44'/0'/0'/0/0",
    bitcoin.networks.mainnet,
    'mainnet',
    'example.near'
  )
```

Fetching Transaction Fee Properties

```typescript
const evmFeeProperties = await fetchEVMFeeProperties(
  'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
  {
    to: '0x0987654321098765432109876543210987654321',
    value: ethers.parseEther('1'),
    data: '0x',
  }
)

const btcFeeProperties = await fetchBTCFeeProperties(
  'https://btc.example.com/api/',
  '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', value: 1000000 }]
)
```
