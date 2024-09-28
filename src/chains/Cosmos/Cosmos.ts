import { chains } from 'chain-registry'
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

import { fetchDerivedCosmosAddressAndPublicKey } from './utils'
import { ChainSignaturesContract } from '../../signature'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type KeyDerivationPath } from '../../kdf/types'
import { type CosmosTransaction, type CosmosNetworkIds } from './types'

export class Cosmos {
  private readonly registry: Registry
  private readonly relayerUrl: string | undefined
  private readonly contract: ChainSignatureContracts
  private readonly chainId: CosmosNetworkIds

  constructor({
    relayerUrl,
    contract,
    chainId,
  }: {
    relayerUrl?: string | undefined
    contract: ChainSignatureContracts
    chainId: CosmosNetworkIds
  }) {
    this.registry = new Registry()
    this.relayerUrl = relayerUrl
    this.contract = contract
    this.chainId = chainId
  }

  private async fetchChainInfo(): Promise<{
    prefix: string
    denom: string
    rpcUrl: string
    expectedChainId: string
    gasPrice: number
  }> {
    const chainInfo = chains.find((chain) => chain.chain_id === this.chainId)
    if (!chainInfo) {
      throw new Error(`Chain info not found for chainId: ${this.chainId}`)
    }

    const { bech32_prefix: prefix, chain_id: expectedChainId } = chainInfo
    const denom = chainInfo.staking?.staking_tokens?.[0]?.denom
    const rpcUrl = chainInfo.apis?.rpc?.[0]?.address
    const gasPrice = chainInfo.fees?.fee_tokens?.[0]?.average_gas_price

    if (
      !prefix ||
      !denom ||
      !rpcUrl ||
      !expectedChainId ||
      gasPrice === undefined
    ) {
      throw new Error(
        `Missing required chain information for ${chainInfo.chain_name}`
      )
    }

    return { prefix, denom, rpcUrl, expectedChainId, gasPrice }
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

        const signBytes = makeSignBytes(signDoc)
        const signatureResponse = await this.signTransaction(
          signBytes,
          path,
          nearAuthentication
        )

        return {
          signed: signDoc,
          signature: {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: toBase64(publicKey),
            },
            signature: toBase64(signatureResponse),
          },
        }
      },
    }
  }

  private async signTransaction(
    signBytes: Uint8Array,
    path: KeyDerivationPath,
    nearAuthentication: NearAuthentication
  ): Promise<Uint8Array> {
    const signatureResponse = await ChainSignaturesContract.sign({
      transactionHash: sha256(signBytes),
      path,
      nearAuthentication,
      contract: this.contract,
      relayerUrl: this.relayerUrl,
    })

    return new Uint8Array([
      ...fromHex(signatureResponse.r),
      ...fromHex(signatureResponse.s),
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
      'fromAddress' in msg.value && !msg.value.fromAddress
        ? { ...msg, value: { ...msg.value, fromAddress: address } }
        : msg
    )
  }

  async handleTransaction(
    data: CosmosTransaction,
    nearAuthentication: NearAuthentication,
    path: KeyDerivationPath
  ): Promise<string> {
    const { prefix, denom, rpcUrl, gasPrice } = await this.fetchChainInfo()

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
