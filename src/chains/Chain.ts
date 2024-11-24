import { type KeyDerivationPath } from '../kdf/types'
import { type NearAuthentication } from './types'
import { type MPCSignature } from '../signature/types'

export interface Chain<Transaction, TransactionResponse> {
  /**
   * Gets the balance for a given address
   */
  getBalance: (address: string) => Promise<string>

  /**
   * Gets MPC payload and serialized transaction for signing
   */
  getMPCPayloadAndTxSerialized: (params: {
    data: Transaction
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    options?: {
      storageKey?: string
    }
  }) => Promise<{
    txSerialized: string
    mpcPayloads: Array<{ index: number; payload: Uint8Array }>
  }>

  /**
   * Reconstructs and sends a signed transaction
   */
  reconstructAndSendTransaction: (params: {
    nearAuthentication?: NearAuthentication
    path?: KeyDerivationPath
    txSerialized?: string
    transactionSerialized?: string
    mpcSignatures: MPCSignature[]
    options?: {
      storageKey?: string
    }
  }) => Promise<TransactionResponse>
}
