import { type KeyPair } from '@near-js/crypto'
import type BN from 'bn.js'

export type ChainSignatureContracts = string

export interface BaseTransaction {
  to: string
  value: string
  derivedPath: string
}

export interface ChainProvider {
  providerUrl: string
  contract: ChainSignatureContracts
}

export interface NearAuthentication {
  networkId: 'testnet' | 'mainnet'
  keypair: KeyPair
  accountId: string
  deposit?: BN
}

interface SuccessResponse {
  transactionHash: string
  success: true
}

interface FailureResponse {
  success: false
  errorMessage: string
}

export type Response = SuccessResponse | FailureResponse

export type NearNetworkIds = 'mainnet' | 'testnet'
export type BTCNetworkIds = 'mainnet' | 'testnet'
