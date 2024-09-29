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
  private readonly signer: (txHash: Uint8Array) => Promise<MPCSignature>

  constructor({
    contract,
    chainId,
    signer,
  }: {
    contract: ChainSignatureContracts
    chainId: CosmosNetworkIds
    signer: (txHash: Uint8Array) => Promise<MPCSignature>
  }) {
    this.registry = new Registry()
    this.contract = contract
    this.chainId = chainId
    this.signer = signer
  }

  private async createSigner(
    address: string,
    publicKey: Uint8Array,
    path: KeyDerivationPath,
    nearAuthentication: NearAuthentication
  ): Promise<OfflineDirectSigner> {
    return {
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
        const mpcSignature = await this.signer(txHash)
        const signature = this.parseRSVSignature(toRSV(mpcSignature))

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

  async handleTransaction(
    data: CosmosTransaction,
    nearAuthentication: NearAuthentication,
    path: KeyDerivationPath
  ): Promise<string> {
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

    const signer = await this.createSigner(
      address,
      publicKey,
      path,
      nearAuthentication
    )

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

    const result = await client.signAndBroadcast(
      address,
      updatedMessages,
      fee,
      data.memo || ''
    )
    assertIsDeliverTxSuccess(result)

    return result.transactionHash
  }
}
