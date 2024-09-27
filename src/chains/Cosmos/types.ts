// types.ts

import { type KeyDerivationPath } from '../../kdf/types'
import { type ChainSignatureContracts } from '../types'
import { type Registry, type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string // e.g., 'cosmoshub', 'osmosis', etc.

export interface CosmosTransaction {
  messages: EncodeObject[] // Array of messages (EncodeObject)
  memo?: string
  gas?: number
}

export interface CosmosPublicKeyAndAddressRequest {
  signerId: string
  path: KeyDerivationPath
  nearNetworkId: string
  multichainContractId: ChainSignatureContracts
  prefix: string
}

export interface CosmosChainInfo {
  chainId?: string
  rpcUrl: string
  restUrl: string
  denom: string
  prefix: string
  gasPrice: string // e.g., '0.025uatom'
  registry?: Registry
}
