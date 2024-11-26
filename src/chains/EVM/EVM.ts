import { ethers, keccak256 } from 'ethers'
import { fetchEVMFeeProperties } from './utils'
import {
  type MPCPayloads,
  type ChainSignatureContracts,
  type NearNetworkIds,
} from '../types'
import { type EVMTransaction } from './types'
import { type KeyDerivationPath } from '../../kdf/types'
import { toRSV } from '../../signature/utils'
import { type RSVSignature, type MPCSignature } from '../../signature/types'
import { ChainSignaturesContract } from '../../signature'
import { najToPubKey } from '../../kdf/kdf'
import { type Chain } from '../Chain'

export class EVM implements Chain<ethers.TransactionLike, EVMTransaction> {
  private readonly provider: ethers.JsonRpcProvider
  private readonly contract: ChainSignatureContracts
  private readonly nearNetworkId: NearNetworkIds

  constructor(config: {
    providerUrl: string
    contract: ChainSignatureContracts
    nearNetworkId: NearNetworkIds
  }) {
    this.provider = new ethers.JsonRpcProvider(config.providerUrl)
    this.contract = config.contract
    this.nearNetworkId = config.nearNetworkId
  }

  private async attachGasAndNonce(
    transaction: EVMTransaction
  ): Promise<ethers.TransactionLike> {
    const fees = await fetchEVMFeeProperties(
      this.provider._getConnection().url,
      transaction
    )
    const nonce = await this.provider.getTransactionCount(
      transaction.from,
      'latest'
    )

    const { from, ...rest } = transaction

    return {
      ...fees,
      chainId: this.provider._network.chainId,
      nonce,
      type: 2,
      ...rest,
    }
  }

  private parseSignature(signature: RSVSignature): ethers.SignatureLike {
    return ethers.Signature.from({
      r: `0x${signature.r}`,
      s: `0x${signature.s}`,
      v: signature.v,
    })
  }

  // TODO: Should accept a derivedPubKeyNAJ as an argument so we can remove the contract dependency
  async deriveAddressAndPublicKey(
    signerId: string,
    path: KeyDerivationPath
  ): Promise<{
    address: string
    publicKey: string
  }> {
    const derivedPubKeyNAJ = await ChainSignaturesContract.getDerivedPublicKey({
      networkId: this.nearNetworkId,
      contract: this.contract,
      args: { path, predecessor: signerId },
    })

    if (!derivedPubKeyNAJ) {
      throw new Error('Failed to get derived public key')
    }

    const childPublicKey = najToPubKey(derivedPubKeyNAJ, { compress: false })

    const publicKeyNoPrefix = childPublicKey.startsWith('04')
      ? childPublicKey.substring(2)
      : childPublicKey

    const hash = ethers.keccak256(Buffer.from(publicKeyNoPrefix, 'hex'))

    return {
      address: `0x${hash.substring(hash.length - 40)}`,
      publicKey: childPublicKey,
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

  setTransaction(
    transaction: ethers.TransactionLike,
    storageKey: string
  ): void {
    const serializedTransaction = JSON.stringify(transaction, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
    window.localStorage.setItem(storageKey, serializedTransaction)
  }

  getTransaction(
    storageKey: string,
    options?: {
      remove?: boolean
    }
  ): EVMTransaction | undefined {
    const txSerialized = window.localStorage.getItem(storageKey)
    if (options?.remove) {
      window.localStorage.removeItem(storageKey)
    }
    return txSerialized ? JSON.parse(txSerialized) : undefined
  }

  async getMPCPayloadAndTransaction(
    transactionRequest: EVMTransaction
  ): Promise<{
    transaction: ethers.TransactionLike
    mpcPayloads: MPCPayloads
  }> {
    const transaction = await this.attachGasAndNonce(transactionRequest)
    const txSerialized = ethers.Transaction.from(transaction).unsignedSerialized
    const transactionHash = keccak256(txSerialized)
    const txHash = new Uint8Array(ethers.getBytes(transactionHash))

    return {
      transaction,
      mpcPayloads: [
        {
          index: 0,
          payload: txHash,
        },
      ],
    }
  }

  async addSignatureAndBroadcast({
    transaction,
    mpcSignatures,
  }: {
    transaction: ethers.TransactionLike
    mpcSignatures: MPCSignature[]
  }): Promise<string> {
    try {
      const txSerialized = ethers.Transaction.from({
        ...transaction,
        signature: this.parseSignature(toRSV(mpcSignatures[0])),
      }).serialized
      const txResponse = await this.provider.broadcastTransaction(txSerialized)

      return txResponse.hash
    } catch (error) {
      console.error('Transaction execution failed:', error)
      throw new Error('Failed to send signed transaction.')
    }
  }
}
