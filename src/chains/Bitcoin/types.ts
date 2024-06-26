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

interface BtcInputsAndOutputs {
  inputs: UTXO[]
  outputs: Array<{ address: string; value: number }>
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
