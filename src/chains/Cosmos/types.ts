// types.ts

import { type StdFee } from '@cosmjs/stargate'
import { type KeyDerivationPath } from '../../signature'
import {
  type NearNetworkIds,
  type ChainSignatureContracts,
  type NearAuthentication,
} from '../types'
import { type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string

export interface CosmosUnsignedTransaction {
  address: string
  compressedPublicKey: string
  messages: EncodeObject[]
  memo?: string
  fee: StdFee
}

export interface CosmosTransactionRequest {
  address: string
  compressedPublicKey: string
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
  transaction: CosmosTransactionRequest
  nearAuthentication: NearAuthentication
  derivationPath: KeyDerivationPath
  fastAuthRelayerUrl?: string
}
