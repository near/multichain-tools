export type { NearNetworkIds, ChainSignatureContracts } from './chains/types'
export type { SLIP044ChainId, KeyDerivationPath } from './signature/types'
export { ChainSignaturesContract } from './contracts'
export * from './sign-and-send-methods/keypair'

// EVM
export { EVM } from './chains/EVM/EVM'

export { fetchEVMFeeProperties } from './chains/EVM/utils'

export type {
  FetchEVMAddressRequest,
  EVMChainConfigWithProviders,
  EVMRequest,
} from './chains/EVM/types'

// Bitcoin
export { Bitcoin } from './chains/Bitcoin/Bitcoin'

export { fetchBTCFeeProperties } from './chains/Bitcoin/utils'

export type {
  BitcoinPublicKeyAndAddressRequest,
  BTCNetworkIds,
  BitcoinRequest,
  BTCChainConfigWithProviders,
} from './chains/Bitcoin/types'

// Cosmos
export { Cosmos } from './chains/Cosmos/Cosmos'

export type {
  CosmosPublicKeyAndAddressRequest,
  CosmosNetworkIds,
  CosmosRequest,
  CosmosChainConfig,
} from './chains/Cosmos/types'
