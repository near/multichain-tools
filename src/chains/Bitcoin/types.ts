import { type KeyDerivationPath } from '../../kdf/types'
import {
  type ChainSignatureContracts,
  type NearNetworkIds,
  type ChainProvider,
  type NearAuthentication,
} from '../types'

export interface UTXO {
  txid: string
  vout: number
  value: number
  script: string
}

export type BTCOutput =
  | {
      address: string
      value: number
    }
  | {
      script: Buffer
      value: number
    }

interface BtcInputsAndOutputs {
  inputs: UTXO[]
  outputs: BTCOutput[]
}

export type BTCTransaction = {
  to: string
  value: string
} & (
  | BtcInputsAndOutputs
  | {
      inputs?: never
      outputs?: never
    }
)

export type BTCChainConfigWithProviders = ChainProvider & {
  network: BTCNetworkIds
}

export interface BitcoinRequest {
  transaction: BTCTransaction
  chainConfig: BTCChainConfigWithProviders
  nearAuthentication: NearAuthentication
  fastAuthRelayerUrl?: string
  derivationPath: KeyDerivationPath
}

export type BTCNetworkIds = 'mainnet' | 'testnet' | 'regtest'

export interface BitcoinPublicKeyAndAddressRequest {
  signerId: string
  path: KeyDerivationPath
  btcNetworkId: BTCNetworkIds
  nearNetworkId: NearNetworkIds
  multichainContractId: ChainSignatureContracts
}
