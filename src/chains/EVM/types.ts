import type * as ethers from 'ethers'
import {
  type ChainSignatureContracts,
  type NearNetworkIds,
  type ChainProvider,
  type NearAuthentication,
} from '../types'
import { type KeyDerivationPath } from '../../kdf/types'

export type EVMTransaction = ethers.TransactionLike

export type EVMChainConfigWithProviders = ChainProvider

export interface EVMRequest {
  transaction: EVMTransaction
  chainConfig: EVMChainConfigWithProviders
  nearAuthentication: NearAuthentication
  fastAuthRelayerUrl?: string
  derivationPath: KeyDerivationPath
}
export interface FetchEVMAddressRequest {
  signerId: string
  path: KeyDerivationPath
  nearNetworkId: NearNetworkIds
  multichainContractId: ChainSignatureContracts
}
