import { type MPCSignature, type KeyDerivationPath } from '../signature/types'

export interface Chain<TransactionRequest, UnsignedTransaction> {
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
  setTransaction: (transaction: UnsignedTransaction, storageKey: string) => void

  /**
   * Retrieves a transaction from local storage
   */
  getTransaction: (
    storageKey: string,
    options?: {
      remove?: boolean
    }
  ) => UnsignedTransaction | undefined

  /**
   * Gets the MPC payload and transaction for signing
   */
  getMPCPayloadAndTransaction: (
    transactionRequest: TransactionRequest
  ) => Promise<{
    transaction: UnsignedTransaction
    mpcPayloads: Array<{
      index: number
      payload: Uint8Array
    }>
  }>

  /**
   * Adds signatures to transaction and broadcasts it
   */
  addSignatureAndBroadcast: (params: {
    transaction: UnsignedTransaction
    mpcSignatures: MPCSignature[]
    publicKey: string
  }) => Promise<string>
}
