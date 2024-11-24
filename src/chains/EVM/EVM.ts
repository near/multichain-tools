import { ethers, keccak256 } from 'ethers'

import { fetchDerivedEVMAddress, fetchEVMFeeProperties } from './utils'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type EVMTransaction } from './types'
import { type KeyDerivationPath } from '../../kdf/types'
import { toRSV } from '../../signature/utils'
import { type MPCSignature, type RSVSignature } from '../../signature/types'

export class EVM {
  private readonly provider: ethers.JsonRpcProvider
  private readonly contract: ChainSignatureContracts

  constructor(config: {
    providerUrl: string
    contract: ChainSignatureContracts
  }) {
    this.provider = new ethers.JsonRpcProvider(config.providerUrl)
    this.contract = config.contract
  }

  static prepareTransactionForSignature(
    transaction: ethers.TransactionLike
  ): Uint8Array {
    const serializedTransaction =
      ethers.Transaction.from(transaction).unsignedSerialized
    const transactionHash = keccak256(serializedTransaction)

    return new Uint8Array(ethers.getBytes(transactionHash))
  }

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
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      chainId: this.provider._network.chainId,
      nonce,
      type: 2,
      ...rest,
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch (error) {
      console.error(`Failed to fetch balance for address ${address}:`, error)
      throw new Error('Failed to fetch balance.')
    }
  }

  parseRSVSignature(rsvSignature: RSVSignature): ethers.Signature {
    const r = `0x${rsvSignature.r}`
    const s = `0x${rsvSignature.s}`
    const v = rsvSignature.v

    return ethers.Signature.from({ r, s, v })
  }

  async reconstructSignature({
    transactionSerialized,
    signature,
    options,
  }: {
    transactionSerialized: string
    signature: MPCSignature
    options?: {
      storageKey?: string
    }
  }): Promise<ethers.TransactionResponse> {
    const transactionData =
      transactionSerialized ??
      (options?.storageKey
        ? window.localStorage.getItem(options.storageKey)
        : null)

    if (!transactionData) {
      throw new Error('No transaction data provided and none found in storage')
    }

    const transaction: ethers.TransactionLike = JSON.parse(transactionData)

    const transactionResponse = await this.sendSignedTransaction(
      transaction,
      this.parseRSVSignature(toRSV(signature))
    )

    return transactionResponse
  }

  async getSerializedTransactionAndPayloadToSign({
    data,
    nearAuthentication,
    path,
    options,
  }: {
    data: EVMTransaction
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    options?: {
      storageKey?: string
    }
  }): Promise<{
    transaction: string
    txHash: Uint8Array
  }> {
    console.log('v3 test')
    const derivedFrom = await fetchDerivedEVMAddress({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
    })

    if (data.from && data.from.toLowerCase() !== derivedFrom.toLowerCase()) {
      throw new Error(
        'Provided "from" address does not match the derived address'
      )
    }

    const from = data.from || derivedFrom

    const transaction = await this.attachGasAndNonce({
      ...data,
      from,
    })

    const txHash = EVM.prepareTransactionForSignature(transaction)

    const serializedTransaction = JSON.stringify(transaction, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )

    if (options?.storageKey) {
      window.localStorage.setItem(options.storageKey, serializedTransaction)
    }

    return {
      transaction: serializedTransaction,
      txHash,
    }
  }
}
