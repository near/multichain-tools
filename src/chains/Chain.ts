import { type MPCSignature } from '../signature/types'
import { type KeyDerivationPath } from '../kdf/types'

export interface Chain<Transaction, TransactionRequest> {
  /**
   * Gets the balance for a given address
   */
  getBalance: (address: string) => Promise<string>

  /**
   * Derives an address and public key from a signer ID and derivation path
   */
  deriveAddressAndPublicKey: (
    signerId: string,
    path: KeyDerivationPath
  ) => Promise<{
    address: string
    publicKey: string
  }>

  /**
   * Stores a transaction in local storage
   */
  setTransaction: (transaction: Transaction, storageKey: string) => void

  /**
   * Retrieves a transaction from local storage
   */
  getTransaction: (storageKey: string) => Transaction | undefined

  /**
   * Gets the MPC payload and transaction for signing
   */
  getMPCPayloadAndTransaction: (
    transactionRequest: TransactionRequest
  ) => Promise<{
    transaction: Transaction
    mpcPayloads: Array<{
      index: number
      payload: Uint8Array
    }>
  }>

  /**
   * Adds signatures to transaction and broadcasts it
   */
  addSignatureAndBroadcast: (params: {
    transaction: Transaction
    mpcSignatures: MPCSignature[]
    publicKey: string
  }) => Promise<string>
}
