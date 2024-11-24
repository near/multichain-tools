import {
  GasPrice,
  SigningStargateClient,
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
import { sha256 } from '@cosmjs/crypto'

import { fetchChainInfo, fetchDerivedCosmosAddressAndPublicKey } from './utils'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type KeyDerivationPath } from '../../kdf/types'
import { type CosmosTransaction, type CosmosNetworkIds } from './types'
import { type MPCSignature, type RSVSignature } from '../../signature/types'
import { toRSV } from '../../signature/utils'

export class Cosmos {
  private readonly registry: Registry
  private readonly contract: ChainSignatureContracts
  private readonly chainId: CosmosNetworkIds
  // TODO: should include providerUrl, so the user can choose rpc

  constructor({
    contract,
    chainId,
  }: {
    contract: ChainSignatureContracts
    chainId: CosmosNetworkIds
  }) {
    this.registry = new Registry()
    this.contract = contract
    this.chainId = chainId
  }

  parseRSVSignature(rsvSignature: RSVSignature): Uint8Array {
    return new Uint8Array([
      ...fromHex(rsvSignature.r),
      ...fromHex(rsvSignature.s),
    ])
  }

  private createFee(denom: string, gasPrice: number, gas?: number): StdFee {
    const gasLimit = gas || 200_000
    return calculateFee(gasLimit, GasPrice.fromString(`${gasPrice}${denom}`))
  }

  private updateMessages(
    messages: EncodeObject[],
    address: string
  ): EncodeObject[] {
    return messages.map((msg) =>
      !msg.value.fromAddress
        ? { ...msg, value: { ...msg.value, fromAddress: address } }
        : msg
    )
  }

  async handleTransaction({
    data,
    nearAuthentication,
    path,
    serializedTransaction,
    mpcSignatures,
    options,
  }: {
    data: CosmosTransaction
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    serializedTransaction?: string
    mpcSignatures: MPCSignature[]
    options?: {
      storageKey?: string
    }
  }): Promise<string> {
    const { prefix, denom, rpcUrl, gasPrice } = await fetchChainInfo(
      this.chainId
    )

    const { publicKey } = await fetchDerivedCosmosAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
      prefix,
    })

    let transaction: string | undefined
    if (serializedTransaction) {
      transaction = serializedTransaction
    } else if (options?.storageKey) {
      const storageTransaction = window.localStorage.getItem(options.storageKey)
      if (!storageTransaction) {
        throw new Error('No transaction found in storage')
      }
      transaction = storageTransaction
    }

    if (!transaction) {
      throw new Error('No transaction found')
    }

    const {
      address,
      messages: updatedMessages,
      memo,
      fee,
    }: {
      address: string
      messages: EncodeObject[]
      memo?: string
      fee: StdFee
    } = JSON.parse(transaction)

    const signer: OfflineDirectSigner = {
      getAccounts: async () => [
        {
          address,
          algo: 'secp256k1',
          pubkey: publicKey,
        },
      ],
      signDirect: async (signerAddress: string, signDoc: SignDoc) => {
        if (signerAddress !== address) {
          throw new Error(`Address ${signerAddress} not found in wallet`)
        }

        const signature = this.parseRSVSignature(toRSV(mpcSignatures[0]))

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: toBase64(publicKey),
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
      address,
      updatedMessages,
      fee,
      memo || ''
    )
    assertIsDeliverTxSuccess(result)

    return result.transactionHash
  }

  async getSerializedTransactionAndPayloads({
    data,
    nearAuthentication,
    path,
    options,
  }: {
    data: CosmosTransaction
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    options?: {
      storageKey?: string
    }
  }): Promise<{
    transaction: string
    payloads: Uint8Array[]
  }> {
    const { prefix, denom, rpcUrl, gasPrice } = await fetchChainInfo(
      this.chainId
    )

    const { address, publicKey } = await fetchDerivedCosmosAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
      prefix,
    })

    const payloads: Uint8Array[] = []
    const signer: OfflineDirectSigner = {
      getAccounts: async () => [
        {
          address,
          algo: 'secp256k1',
          pubkey: publicKey,
        },
      ],
      signDirect: async (signerAddress: string, signDoc: SignDoc) => {
        if (signerAddress !== address) {
          throw new Error(`Address ${signerAddress} not found in wallet`)
        }

        const txHash = sha256(makeSignBytes(signDoc))
        payloads.push(txHash)

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: toBase64(publicKey),
            },
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

    const fee = this.createFee(denom, gasPrice, data.gas)
    const updatedMessages = this.updateMessages(data.messages, address)

    await client.sign(address, updatedMessages, fee, data.memo || '')

    const serializedTransaction = JSON.stringify({
      address,
      messages: updatedMessages,
      fee,
      memo: data.memo,
    })

    if (options?.storageKey) {
      window.localStorage.setItem(options.storageKey, serializedTransaction)
    }

    return {
      transaction: serializedTransaction,
      payloads,
    }
  }
}
