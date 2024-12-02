export type { NearNetworkIds, ChainSignatureContracts } from './chains/types'
export type { SLIP044ChainId, KeyDerivationPath } from './signature/types'
export { ChainSignaturesContract } from './contracts'
export * as signAndSend from './sign-and-send-methods'
export * as transactionBuilder from './transaction-builder'
export type { Chain } from './chains/Chain'

// EVM
export { EVM } from './chains/EVM/EVM'

export { fetchEVMFeeProperties } from './chains/EVM/utils'

export type {
  EVMChainConfigWithProviders,
  EVMRequest,
  EVMTransactionRequest,
  EVMUnsignedTransaction,
} from './chains/EVM/types'

// Bitcoin
export { Bitcoin } from './chains/Bitcoin/Bitcoin'

export { fetchBTCFeeProperties } from './chains/Bitcoin/utils'

export type {
  BTCChainConfigWithProviders,
  BTCNetworkIds,
  BitcoinRequest,
  BTCTransactionRequest,
  BTCUnsignedTransaction,
} from './chains/Bitcoin/types'

// Cosmos
export { Cosmos } from './chains/Cosmos/Cosmos'

export type {
  CosmosChainConfig,
  CosmosNetworkIds,
  CosmosRequest,
  CosmosTransactionRequest,
  CosmosUnsignedTransaction,
} from './chains/Cosmos/types'
