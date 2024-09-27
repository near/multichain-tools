<!-- # MultiChain Tools

MultiChain Tools is a TypeScript package that provides a set of utilities and functions for interacting with various blockchain networks, including Ethereum (EVM-based chains) and Bitcoin. It offers an easy way to sign and send transactions, fetch derived addresses, and estimate transaction fees using a single NEAR account that controls the keys for the other chains.

## Supported Chains

- BTC
- EVM

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

### Derived Path

In this repository, we frequently utilize derived paths, which enable the generation of new keys using the combination of a Root Key and a String, resulting in a Child Key.

For more detailed information, please refer to the [NEAR Documentation on Chain Signatures](https://docs.near.org/concepts/abstraction/chain-signatures#derivation-paths-one-account-multiple-chains).

To ensure consistency and predictability in providing the key path, we recommend using JSON Canonical Serialization. This standardizes the format of the path, making it easier to understand and use. But, you can also provide a plain string.

Here's an example of how to provide a derived path using Canonical Serialization:

```typescript
import canonicalize from 'canonicalize'

const derivedPath = canonicalize({
  chain: 'BTC',
  domain: 'example.com',
  meta: {
    prop1: 'prop1',
  },
})
```

or

```typescript
const derivedPath = 'myderivedpath,btc'
```

In the example above:

- chain: Specifies the chain for which you are requesting the signature, such as BTC (Bitcoin), ETH (Ethereum), etc.
- domain: Represents the domain of the dApp (e.g., www.example.com).
- meta: Allows you to include any additional information you want to incorporate into the key path.

By following this approach, you can create standardized and predictable derived paths for generating child keys based on a root key and a specific string combination.

### Key Pair

In this repository, we will also utilize NEAR account key pairs, which are essentially the private and public keys of an account used to sign transactions.

To create a key pair, you can use the following code:

```typescript
import { KeyPair } from 'near-api-js'

const nearAccountKeyPair = KeyPair.fromString(
  process.env.NEXT_PUBLIC_NEAR_PRIVATE_KEY
)
```

## Examples

Signing and Sending an EVM Transaction

```typescript
const evmRequest: EVMRequest = {
  transaction: {
    to: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    value: '1000000000000000000', // In wei
    derivedPath,
  },
  chainConfig: {
    providerUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
    contract: 'v2.multichain-mpc.testnet',
  },
  nearAuthentication: {
    networkId: 'testnet',
    keypair: nearAccountKeyPair,
    accountId: 'signer.near',
  },
}

const response: Response = await signAndSendEVMTransaction(evmRequest)
```

Signing and Sending a Bitcoin Transaction

```typescript
const btcRequest: BitcoinRequest = {
  chainConfig: {
    providerUrl: 'https://btc.example.com/api/',
    contract: 'v2.multichain-mpc.testnet',
    networkType: 'testnet',
  },
  transaction: {
    to: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    value: '1000000', // In satoshis
    derivedPath,
  },
  nearAuthentication: {
    networkId: 'mainnet',
    keypair: nearAccountKeyPair,
    accountId: 'signer.near',
  },
}

const response: Response = await signAndSendBTCTransaction(btcRequest)
```

Fetching Derived Addresses

```typescript
const evmAddress: string = await fetchDerivedEVMAddress(
  'signer.near',
  derivedPath,
  'testnet',
  'v2.multichain-mpc.testnet'
)

import * as bitcoinlib from 'bitcoinjs-lib'

const { address: btcAddress, publicKey: btcPublicKey } =
  await fetchDerivedBTCAddressAndPublicKey(
    'signer.near',
    derivedPath,
    bitcoinlib.networks.testnet,
    'testnet',
    'v2.multichain-mpc.testnet'
  )
```

Fetching Transaction Fee Properties

```typescript
const evmFeeProperties = await fetchEVMFeeProperties(
  'https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID',
  {
    to: '0x0987654321098765432109876543210987654321',
    value: ethers.parseEther('1'),
  }
)

const btcFeeProperties = await fetchBTCFeeProperties(
  'https://btc.example.com/api/',
  '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', value: 1000000 }]
)
``` -->
