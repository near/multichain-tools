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

export type BTCTransaction =
  | (Omit<BaseTransaction, 'to' | 'value'> & BtcInputsAndOutputs)
  | (BaseTransaction & {
      inputs?: never
      outputs?: never
    })

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
