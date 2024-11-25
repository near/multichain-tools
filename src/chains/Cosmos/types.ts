// types.ts

import { type KeyDerivationPath } from '../../kdf/types'
import {
  type NearNetworkIds,
  type ChainSignatureContracts,
  type NearAuthentication,
} from '../types'
import { type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string

export interface CosmosTransaction {
  address: string
  publicKey: string
  messages: EncodeObject[] // Array of messages (EncodeObject)
  memo?: string
  gas?: number
}

export interface CosmosPublicKeyAndAddressRequest {
  signerId: string
  path: KeyDerivationPath
  nearNetworkId: NearNetworkIds
  multichainContractId: ChainSignatureContracts
  prefix: string
}

export interface CosmosChainConfig {
  contract: ChainSignatureContracts
  chainId: CosmosNetworkIds
}

export interface CosmosRequest {
  chainConfig: CosmosChainConfig
  transaction: CosmosTransaction
  nearAuthentication: NearAuthentication
  derivationPath: KeyDerivationPath
  fastAuthRelayerUrl?: string
}
