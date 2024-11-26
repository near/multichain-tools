import {
  GasPrice,
  SigningStargateClient,
  StargateClient,
  type StdFee,
  assertIsDeliverTxSuccess,
  calculateFee,
} from '@cosmjs/stargate'
import {
  Registry,
  type OfflineDirectSigner,
  type EncodeObject,
  makeSignBytes,
} from '@cosmjs/proto-signing'
import { type SignDoc } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { toBase64, fromHex } from '@cosmjs/encoding'
import { ripemd160, sha256 } from '@cosmjs/crypto'

import { fetchChainInfo } from './utils'
import {
  type MPCPayloads,
  type ChainSignatureContracts,
  type NearNetworkIds,
} from '../types'
import { type CosmosTransaction, type CosmosNetworkIds } from './types'
import { type MPCSignature, type RSVSignature } from '../../signature/types'
import { toRSV } from '../../signature/utils'
import { bech32 } from 'bech32'
import { najToPubKey } from '../../kdf/kdf'
import { ChainSignaturesContract } from '../../signature'
import { type Chain } from '../Chain'

export class Cosmos
  implements
    Chain<
      {
        address: string
        messages: EncodeObject[]
        memo?: string
        fee: StdFee
      },
      CosmosTransaction
    >
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
      const { restUrl, denom } = await fetchChainInfo(this.chainId)
      const client = await StargateClient.connect(restUrl)

      const balance = await client.getBalance(address, denom)

      return balance.amount
    } catch (error) {
      console.error('Failed to fetch Cosmos balance:', error)
      throw new Error('Failed to fetch Cosmos balance')
    }
  }

  async deriveAddressAndPublicKey(
    signerId: string,
    path: string
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
  ):
    | {
        address: string
        messages: EncodeObject[]
        memo?: string
        fee: StdFee
      }
    | undefined {
    const serializedTransaction = window.localStorage.getItem(storageKey)
    if (options?.remove) {
      window.localStorage.removeItem(storageKey)
    }
    return serializedTransaction ? JSON.parse(serializedTransaction) : undefined
  }

  async getMPCPayloadAndTransaction(
    transactionRequest: CosmosTransaction
  ): Promise<{
    transaction: {
      address: string
      messages: EncodeObject[]
      fee: StdFee
      memo?: string
    }
    mpcPayloads: MPCPayloads
  }> {
    const { denom, rpcUrl, gasPrice } = await fetchChainInfo(this.chainId)
    const publicKeyBuffer = Buffer.from(transactionRequest.publicKey, 'hex')

    // Mock signer to get the payloads as the library doesn't expose a methods with such functionality
    const payloads: Uint8Array[] = []
    const signer: OfflineDirectSigner = {
      getAccounts: async () => [
        {
          address: transactionRequest.address,
          algo: 'secp256k1',
          pubkey: publicKeyBuffer,
        },
      ],
      signDirect: async (signerAddress: string, signDoc: SignDoc) => {
        if (signerAddress !== transactionRequest.address) {
          throw new Error(`Address ${signerAddress} not found in wallet`)
        }

        const txHash = sha256(makeSignBytes(signDoc))
        payloads.push(txHash)

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: toBase64(publicKeyBuffer),
            },
            // The return it's intentionally wrong as this is a mock signer
            signature: toBase64(txHash),
          },
        }
      },
    }

    const client = await SigningStargateClient.connectWithSigner(
      rpcUrl,
      signer,
      {
        registry: this.registry,
        gasPrice: GasPrice.fromString(`${gasPrice}${denom}`),
      }
    )

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

    await client.sign(
      transactionRequest.address,
      updatedMessages,
      fee,
      transactionRequest.memo || ''
    )

    return {
      transaction: {
        address: transactionRequest.address,
        messages: updatedMessages,
        fee,
        memo: transactionRequest.memo,
      },
      mpcPayloads: payloads.map((payload, index) => ({
        index,
        payload,
      })),
    }
  }

  async addSignatureAndBroadcast({
    transaction,
    mpcSignatures,
    publicKey,
  }: {
    transaction: {
      address: string
      messages: EncodeObject[]
      memo?: string
      fee: StdFee
    }
    mpcSignatures: MPCSignature[]
    publicKey: string
  }): Promise<string> {
    const { denom, rpcUrl, gasPrice } = await fetchChainInfo(this.chainId)
    const publicKeyBuffer = Buffer.from(publicKey, 'hex')

    const signer: OfflineDirectSigner = {
      getAccounts: async () => [
        {
          address: transaction.address,
          algo: 'secp256k1',
          pubkey: publicKeyBuffer,
        },
      ],
      signDirect: async (signerAddress: string, signDoc: SignDoc) => {
        if (signerAddress !== transaction.address) {
          throw new Error(`Address ${signerAddress} not found in wallet`)
        }

        // TODO: Should handle multiple signatures
        const signature = this.parseRSVSignature(toRSV(mpcSignatures[0]))

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: toBase64(publicKeyBuffer),
            },
            signature: toBase64(signature),
          },
        }
      },
    }

    const client = await SigningStargateClient.connectWithSigner(
      rpcUrl,
      signer,
      {
        registry: this.registry,
        gasPrice: GasPrice.fromString(`${gasPrice}${denom}`),
      }
    )

    const result = await client.signAndBroadcast(
      transaction.address,
      transaction.messages,
      transaction.fee,
      transaction.memo || ''
    )
    assertIsDeliverTxSuccess(result)

    return result.transactionHash
  }
}
