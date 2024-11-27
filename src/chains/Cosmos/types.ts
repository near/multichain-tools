// types.ts

import { type StdFee } from '@cosmjs/stargate'
import { type KeyDerivationPath } from '../../signature'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string

export interface CosmosUnsignedTransaction {
  address: string
  publicKey: string
  messages: EncodeObject[]
  memo?: string
  fee: StdFee
}

export interface CosmosTransactionRequest {
  address: string
  publicKey: string
  messages: EncodeObject[] // Array of messages (EncodeObject)
  memo?: string
  gas?: number
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
