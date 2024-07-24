import { ethers, keccak256 } from 'ethers'

import { sign } from '../../signature'
import { fetchDerivedEVMAddress, fetchEVMFeeProperties } from './utils'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type EVMTransaction } from './types'
import { type KeyDerivationPath } from '../../kdf/types'

class EVM {
  private readonly provider: ethers.JsonRpcProvider

  private readonly relayerUrl?: string

  private readonly contract: ChainSignatureContracts

  /**
   * Constructs an instance of the EVM class with specified configuration.
   *
   * @param {Object} config - The configuration object for the EVM instance.
   * @param {string} config.providerUrl - The URL of the Ethereum JSON RPC provider.
   * @param {string} config.relayerUrl - The URL of the relayer service.
   * @param {ChainSignatureContracts} config.contract - The contract identifier for chain signature operations.
   */
  constructor(config: {
    providerUrl: string
    relayerUrl?: string
    contract: ChainSignatureContracts
  }) {
    this.provider = new ethers.JsonRpcProvider(config.providerUrl)
    this.relayerUrl = config.relayerUrl
    this.contract = config.contract
  }

  /**
   * Prepares a transaction object for signature by serializing and hashing it.
   *
   * @param {object} transaction - The transaction object to prepare.
   * @returns {string} The hashed transaction ready for signature.
   */
  static prepareTransactionForSignature(
    transaction: ethers.TransactionLike
  ): string {
    const serializedTransaction =
      ethers.Transaction.from(transaction).unsignedSerialized
    const transactionHash = keccak256(serializedTransaction)

    return transactionHash
  }

  /**
   * Sends a signed transaction to the network for execution.
   *
   * @param {ethers.TransactionLike} transaction - The transaction object to be sent.
   * @param {ethers.SignatureLike} signature - The signature object associated with the transaction.
   * @returns {Promise<ethers.TransactionResponse>} A promise that resolves to the response of the executed transaction.
   */
  async sendSignedTransaction(
    transaction: ethers.TransactionLike,
    signature: ethers.SignatureLike
  ): Promise<ethers.TransactionResponse> {
    try {
      const serializedTransaction = ethers.Transaction.from({
        ...transaction,
        signature,
      }).serialized
      return await this.provider.broadcastTransaction(serializedTransaction)
    } catch (error) {
      console.error('Transaction execution failed:', error)
      throw new Error('Failed to send signed transaction.')
    }
  }

  /**
   * Enhances a transaction with current gas price, estimated gas limit, chain ID, and nonce.
   *
   * This method fetches the current gas price, estimates the gas limit required for the transaction, and retrieves the nonce for the transaction sender's address.
   * It then returns a new transaction object that includes the original transaction details along with the fetched gas price, estimated gas limit, the chain ID of the EVM object, and the nonce.
   *
   * @param {ethers.providers.TransactionRequest} transaction - The initial transaction object without gas details or nonce.
   * @returns {Promise<ethers.providers.TransactionRequest>} A new transaction object augmented with gas price, gas limit, chain ID, and nonce.
   */
  async attachGasAndNonce(
    transaction: Omit<EVMTransaction, 'from'> & { from: string }
  ): Promise<ethers.TransactionLike> {
    const hasUserProvidedGas =
      transaction.gasLimit &&
      transaction.maxFeePerGas &&
      transaction.maxPriorityFeePerGas

    const { gasLimit, maxFeePerGas, maxPriorityFeePerGas } = hasUserProvidedGas
      ? transaction
      : await fetchEVMFeeProperties(
          this.provider._getConnection().url,
          transaction
        )

    const nonce = await this.provider.getTransactionCount(
      transaction.from,
      'latest'
    )

    const { from, ...rest } = transaction

    return {
      ...rest,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      chainId: this.provider._network.chainId,
      nonce,
      type: 2,
    }
  }

  /**
   * Fetches the balance of the given EVM address.
   *
   * This method uses the current provider to query the balance of the specified address.
   * The balance is returned in ethers as a string.
   *
   * @param {string} address - The EVM address to fetch the balance for.
   * @returns {Promise<string>} The balance of the address in ethers.
   */
  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch (error) {
      console.error(`Failed to fetch balance for address ${address}:`, error)
      throw new Error('Failed to fetch balance.')
    }
  }

  /**
   * Manages the lifecycle of an EVM transaction, encompassing preparation, signing, and broadcasting. This method calculates gas and nonce, digitally signs the transaction using on-chain mechanisms, and broadcasts it for execution.
   *
   * The digital signing process is detailed in @signature.ts, involving the signing of a transaction hash with the derivation path.
   *
   * @param {Transaction} data - Contains the transaction details such as the recipient's address and the amount to be transferred.
   * @param {NearAuthentication} nearAuthentication - The NEAR accountId, keypair and networkId used for signing the transaction.
   * @param {string} path - The derivation path utilized for the signing of the transaction.
   * @returns {Promise<ethers.TransactionResponse | undefined>} A promise that resolves to the response of the executed transaction, or undefined if the transaction fails to execute.
   */
  async handleTransaction(
    data: EVMTransaction,
    nearAuthentication: NearAuthentication,
    path: KeyDerivationPath
  ): Promise<ethers.TransactionResponse | undefined> {
    const from = await fetchDerivedEVMAddress({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
    })

    const transaction = await this.attachGasAndNonce({
      ...data,
      from,
    })

    const transactionHash = EVM.prepareTransactionForSignature(transaction)

    const signature = await sign({
      transactionHash,
      path,
      nearAuthentication,
      contract: this.contract,
      relayerUrl: this.relayerUrl,
    })

    if (signature) {
      const r = `0x${signature.r}`
      const s = `0x${signature.s}`
      const v = signature.v

      const transactionResponse = await this.sendSignedTransaction(
        transaction,
        ethers.Signature.from({ r, s, v })
      )
      return transactionResponse
    }

    return undefined
  }
}

export default EVM
