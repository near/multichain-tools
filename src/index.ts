export type { NearNetworkIds, ChainSignatureContracts } from './chains/types'
export type { SLIP044ChainId, KeyDerivationPath } from './kdf/types'
export { ChainSignaturesContract } from './signature/chain-signatures-contract'
export * from './signAndSendMethods'

// EVM
export {
  fetchDerivedEVMAddress,
  fetchEVMFeeProperties,
} from './chains/EVM/utils'

export type {
  FetchEVMAddressRequest,
  EVMChainConfigWithProviders,
  EVMRequest,
} from './chains/EVM/types'

// Bitcoin
export {
  fetchBTCFeeProperties,
  fetchDerivedBTCAddressAndPublicKey,
} from './chains/Bitcoin/utils'

export type {
  BitcoinPublicKeyAndAddressRequest,
  BTCNetworkIds,
  BitcoinRequest,
  BTCChainConfigWithProviders,
} from './chains/Bitcoin/types'

// Cosmos
export {
  fetchDerivedCosmosAddressAndPublicKey,
  fetchCosmosBalance,
} from './chains/Cosmos/utils'

export type {
  CosmosPublicKeyAndAddressRequest,
  CosmosNetworkIds,
  CosmosRequest,
  CosmosChainConfig,
} from './chains/Cosmos/types'
