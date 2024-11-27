import type * as ethers from 'ethers'
import {
  type ChainSignatureContracts,
  type NearNetworkIds,
  type ChainProvider,
  type NearAuthentication,
} from '../types'
import { type KeyDerivationPath } from '../../signature'

export type EVMUnsignedTransaction = ethers.TransactionLike

export type EVMTransactionRequest = Omit<ethers.TransactionLike, 'from'> & {
  from: string
}

export type EVMChainConfigWithProviders = ChainProvider

export interface EVMRequest {
  transaction: EVMTransactionRequest
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
