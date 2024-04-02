import {
  type BaseTransaction,
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

export type BTCTransaction = BaseTransaction &
  (
    | BtcInputsAndOutputs
    | {
        inputs?: never
        outputs?: never
      }
  )

export type BTCChainConfigWithProviders = ChainProvider & {
  networkType: 'bitcoin' | 'testnet'
}

export interface BitcoinRequest {
  transaction: BTCTransaction
  chainConfig: BTCChainConfigWithProviders
  nearAuthentication: NearAuthentication
  fastAuthRelayerUrl?: string
}

export type BTCNetworks = 'mainnet' | 'testnet'
