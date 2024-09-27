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
  size: number
  weight: number
  fee: number
  vin: Array<{
    txid: string
    vout: number
    is_coinbase: boolean
    scriptsig: string
    scriptsig_asm: string
    inner_redeemscript_asm: string
    inner_witnessscript_asm: string
    sequence: number
    witness: string[]
    prevout: any
    is_pegin: boolean
    issuance: any
  }>
  vout: Array<{
    scriptpubkey: string
    scriptpubkey_asm: string
    scriptpubkey_type: string
    scriptpubkey_address: string
    value: number
    valuecommitment: string
    asset: string
    assetcommitment: string
    pegout: any
  }>
  status: {
    confirmed: boolean
    block_height: number | null
    block_hash: string | null
    block_time: number | null
  }
}

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
