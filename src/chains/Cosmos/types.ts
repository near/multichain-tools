import { type TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { type KeyDerivationPath } from '../../signature'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string

export type CosmosUnsignedTransaction = TxRaw

export interface CosmosTransactionRequest {
  address: string
  publicKey: string
  messages: EncodeObject[]
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

export interface BalanceResponse {
  balances: Array<{
    denom: string
    amount: string
  }>
  pagination: {
    next_key: string | null
    total: string
  }
}
