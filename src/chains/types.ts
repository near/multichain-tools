import { type KeyPair } from '@near-js/crypto'
import type BN from 'bn.js'

/** 
Available ChainSignature contracts:
  - Mainnet: v1.signer
  - Testnet: v1.signer-prod.testnet
  - Development (unstable): v1.signer-dev.testnet
*/
export type ChainSignatureContracts = string

export interface ChainProvider {
  providerUrl: string
  contract: ChainSignatureContracts
}

export interface NearAuthentication {
  networkId: NearNetworkIds
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
