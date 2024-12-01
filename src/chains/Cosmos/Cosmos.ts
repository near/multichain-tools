import {
  GasPrice,
  StargateClient,
  type StdFee,
  calculateFee,
} from '@cosmjs/stargate'
import {
  Registry,
  type EncodeObject,
  makeSignBytes,
  encodePubkey,
  makeAuthInfoBytes,
  makeSignDoc,
  type TxBodyEncodeObject,
} from '@cosmjs/proto-signing'
import { encodeSecp256k1Pubkey } from '@cosmjs/amino'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { fromHex } from '@cosmjs/encoding'
import { ripemd160, sha256 } from '@cosmjs/crypto'

import { fetchChainInfo } from './utils'
import {
  type MPCPayloads,
  type ChainSignatureContracts,
  type NearNetworkIds,
} from '../types'
import {
  type BalanceResponse,
  type CosmosNetworkIds,
  type CosmosTransactionRequest,
  type CosmosUnsignedTransaction,
} from './types'
import {
  type MPCSignature,
  type RSVSignature,
  type KeyDerivationPath,
} from '../../signature/types'
import { toRSV, najToPubKey } from '../../signature/utils'
import { ChainSignaturesContract } from '../../contracts'
import { type Chain } from '../Chain'
import { bech32 } from 'bech32'
import { SignMode } from 'cosmjs-types/cosmos/tx/signing/v1beta1/signing'

export class Cosmos
  implements Chain<CosmosTransactionRequest, CosmosUnsignedTransaction>
{
  private readonly nearNetworkId: NearNetworkIds
  private readonly registry: Registry
  private readonly contract: ChainSignatureContracts
  private readonly chainId: CosmosNetworkIds

  constructor({
    nearNetworkId,
    contract,
    chainId,
  }: {
    nearNetworkId: NearNetworkIds
    contract: ChainSignatureContracts
    chainId: CosmosNetworkIds
  }) {
    this.nearNetworkId = nearNetworkId
    this.registry = new Registry()
    this.contract = contract
    this.chainId = chainId
  }

  private parseRSVSignature(rsvSignature: RSVSignature): Uint8Array {
    return new Uint8Array([
      ...fromHex(rsvSignature.r),
      ...fromHex(rsvSignature.s),
    ])
  }

  async getBalance(address: string): Promise<string> {
    try {
      const { restUrl, denom, decimals } = await fetchChainInfo(this.chainId)

      const response = await fetch(
        `${restUrl}/cosmos/bank/v1beta1/balances/${address}`
      )

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = (await response.json()) as BalanceResponse
      const balance = data.balances.find((b) => b.denom === denom)
      const amount = balance?.amount ?? '0'

      const formattedBalance = (
        parseInt(amount) / Math.pow(10, decimals)
      ).toString()
      return formattedBalance
    } catch (error) {
      console.error('Failed to fetch Cosmos balance:', error)
      throw new Error('Failed to fetch Cosmos balance')
    }
  }

  async deriveAddressAndPublicKey(
    signerId: string,
    path: KeyDerivationPath
  ): Promise<{
    address: string
    publicKey: string
  }> {
    const { prefix } = await fetchChainInfo(this.chainId)
    const derivedPubKeyNAJ = await ChainSignaturesContract.getDerivedPublicKey({
      networkId: this.nearNetworkId,
      contract: this.contract,
      args: { path, predecessor: signerId },
    })

    if (!derivedPubKeyNAJ) {
      throw new Error('Failed to get derived public key')
    }

    const derivedKey = najToPubKey(derivedPubKeyNAJ, { compress: true })
    const pubKeySha256 = sha256(Buffer.from(fromHex(derivedKey)))
    const ripemd160Hash = ripemd160(pubKeySha256)
    const address = bech32.encode(prefix, bech32.toWords(ripemd160Hash))

    return { address, publicKey: derivedKey }
  }

  setTransaction(
    transaction: {
      address: string
      messages: EncodeObject[]
      memo?: string
      fee: StdFee
    },
    storageKey: string
  ): void {
    window.localStorage.setItem(storageKey, JSON.stringify(transaction))
  }

  getTransaction(
    storageKey: string,
    options?: {
      remove?: boolean
    }
  ): CosmosUnsignedTransaction | undefined {
    const serializedTransaction = window.localStorage.getItem(storageKey)
    if (options?.remove) {
      window.localStorage.removeItem(storageKey)
    }
    return serializedTransaction ? JSON.parse(serializedTransaction) : undefined
  }

  async getMPCPayloadAndTransaction(
    transactionRequest: CosmosTransactionRequest
  ): Promise<{
    transaction: CosmosUnsignedTransaction
    mpcPayloads: MPCPayloads
  }> {
    const { denom, rpcUrl, gasPrice } = await fetchChainInfo(this.chainId)
    const publicKeyBytes = fromHex(transactionRequest.publicKey)

    const gasLimit = transactionRequest.gas || 200_000
    const fee = calculateFee(
      gasLimit,
      GasPrice.fromString(`${gasPrice}${denom}`)
    )

    const updatedMessages = transactionRequest.messages.map((msg) =>
      !msg.value.fromAddress
        ? {
            ...msg,
            value: { ...msg.value, fromAddress: transactionRequest.address },
          }
        : msg
    )

    const client = await StargateClient.connect(rpcUrl)
    const accountOnChain = await client.getAccount(transactionRequest.address)
    if (!accountOnChain) {
      throw new Error(
        `Account ${transactionRequest.address} does not exist on chain`
      )
    }

    const { accountNumber, sequence } = accountOnChain

    const txBodyEncodeObject = {
      typeUrl: '/cosmos.tx.v1beta1.TxBody',
      value: {
        messages: updatedMessages,
        memo: transactionRequest.memo || '',
      },
    }

    const registry = new Registry()
    const txBodyBytes = registry.encode(txBodyEncodeObject)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const pubkey = encodePubkey(encodeSecp256k1Pubkey(publicKeyBytes))
    const signerInfo = {
      pubkey,
      sequence,
    }

    const authInfoBytes = makeAuthInfoBytes(
      [signerInfo],
      fee.amount,
      Number(fee.gas),
      undefined, // feeGranter
      undefined, // feePayer
      SignMode.SIGN_MODE_DIRECT
    )

    const signDoc = makeSignDoc(
      txBodyBytes,
      authInfoBytes,
      this.chainId,
      accountNumber
    )

    const signBytes = makeSignBytes(signDoc)
    const payload = sha256(signBytes)

    return {
      transaction: {
        address: transactionRequest.address,
        publicKey: transactionRequest.publicKey,
        messages: updatedMessages,
        memo: transactionRequest.memo,
        fee,
      },
      mpcPayloads: [
        {
          index: 0,
          payload,
        },
      ],
    }
  }

  async addSignatureAndBroadcast({
    transaction,
    mpcSignatures,
  }: {
    transaction: CosmosUnsignedTransaction
    mpcSignatures: MPCSignature[]
  }): Promise<string> {
    const { rpcUrl } = await fetchChainInfo(this.chainId)
    const publicKeyBytes: Uint8Array = fromHex(transaction.publicKey)

    const client = await StargateClient.connect(rpcUrl)
    const accountOnChain = await client.getAccount(transaction.address)
    if (!accountOnChain) {
      throw new Error(`Account ${transaction.address} does not exist on chain`)
    }

    const sequence = accountOnChain.sequence

    const txBody: TxBodyEncodeObject = {
      typeUrl: '/cosmos.tx.v1beta1.TxBody',
      value: {
        messages: transaction.messages,
        memo: transaction.memo || '',
      },
    }

    const registry = this.registry || new Registry() // Use your existing registry if available
    const txBodyBytes = registry.encode(txBody)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const pubkey = encodePubkey(encodeSecp256k1Pubkey(publicKeyBytes))
    const feeAmount = transaction.fee.amount
    const gasLimit = Number(transaction.fee.gas)

    const authInfoBytes = makeAuthInfoBytes(
      [
        {
          pubkey,
          sequence,
        },
      ],
      feeAmount,
      gasLimit,
      undefined,
      undefined
    )

    const signature = this.parseRSVSignature(toRSV(mpcSignatures[0]))

    const txRaw = TxRaw.fromPartial({
      bodyBytes: txBodyBytes,
      authInfoBytes,
      signatures: [signature],
    })

    const txBytes = TxRaw.encode(txRaw).finish()
    const broadcastResponse = await client.broadcastTx(txBytes)

    if (broadcastResponse.code !== 0) {
      throw new Error(`Broadcast error: ${broadcastResponse.rawLog}`)
    }

    return broadcastResponse.transactionHash
  }
}
