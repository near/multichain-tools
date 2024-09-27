// types.ts

import { type KeyDerivationPath } from '../../kdf/types'
import { type ChainSignatureContracts } from '../types'
import { type EncodeObject } from '@cosmjs/proto-signing'

export type CosmosNetworkIds = string

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
