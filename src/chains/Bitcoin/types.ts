import { type KeyDerivationPath } from '../../kdf/types'
import {
  type ChainSignatureContracts,
  type NearNetworkIds,
  type ChainProvider,
  type NearAuthentication,
} from '../types'

export interface Transaction {
  txid: string
  version: number
  locktime: number
  vin: Array<{
    txid: string
    vout: number
    prevout: {
      scriptpubkey: string
      scriptpubkey_asm: string
      scriptpubkey_type: string
      scriptpubkey_address: string
      value: number
    }
    scriptsig: string
    scriptsig_asm: string
    witness: string[]
    is_coinbase: boolean
    sequence: number
  }>
  vout: Array<{
    scriptpubkey: string
    scriptpubkey_asm: string
    scriptpubkey_type: string
    scriptpubkey_address: string
    value: number
  }>
  size: number
  weight: number
  sigops?: number
  fee: number
  status: {
    confirmed: boolean
    block_height: number
    block_hash: string
    block_time: number
  }
}

export interface UTXO {
  txid: string
  vout: number
  status: {
    confirmed: boolean
    block_height: number
    block_hash: string
    block_time: number
  }
  value: number
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

export interface BTCFeeRecommendation {
  fastestFee: number
  halfHourFee: number
  hourFee: number
  economyFee: number
  minimumFee: number
}

interface BTCAddressStats {
  funded_txo_count: number
  funded_txo_sum: number
  spent_txo_count: number
  spent_txo_sum: number
  tx_count: number
}

export interface BTCAddressInfo {
  address: string
  chain_stats: BTCAddressStats
  mempool_stats: BTCAddressStats
}
