// cosmos.ts
import { chains } from 'chain-registry'
import { GasPrice, SigningStargateClient, type StdFee } from '@cosmjs/stargate'
import {
  Registry,
  makeSignBytes,
  encodePubkey,
  type OfflineDirectSigner,
  type AccountData,
  type DirectSignResponse,
} from '@cosmjs/proto-signing'
import { type SignDoc } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { toBase64, fromHex } from '@cosmjs/encoding'

import { fetchDerivedCosmosAddressAndPublicKey } from './utils'
import { ChainSignaturesContract } from '../../signature'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type KeyDerivationPath } from '../../kdf/types'
import { type CosmosTransaction, type CosmosNetworkIds } from './types'

// utils.ts
import { sha256 } from 'ethers'

export class Cosmos {
  private readonly relayerUrl?: string
  private readonly contract: ChainSignatureContracts
  private readonly chainId: CosmosNetworkIds

  constructor(config: {
    relayerUrl?: string
    contract: ChainSignatureContracts
    chainId: CosmosNetworkIds
  }) {
    this.relayerUrl = config.relayerUrl
    this.contract = config.contract
    this.chainId = config.chainId
  }

  /**
   * Fetches chain information and creates a registry for the specified Cosmos chain.
   */
  async fetchChainInfoAndCreateRegistry(): Promise<{
    chainInfo: any
    prefix: string
    denom: string
    restUrl: string
    rpcUrl: string
    expectedChainId: string
    gasPrice: number
    registry: Registry
  }> {
    const chainInfo = chains.find((chain) => chain.chain_id === this.chainId)

    if (!chainInfo) {
      throw new Error(`Chain info not found for chainId: ${this.chainId}`)
    }

    const {
      chain_name: chainName,
      bech32_prefix: prefix,
      chain_id: expectedChainId,
    } = chainInfo
    const denom = chainInfo.staking?.staking_tokens?.[0]?.denom
    const restUrl = chainInfo.apis?.rest?.[0]?.address
    const rpcUrl = chainInfo.apis?.rpc?.[0]?.address
    const gasPrice = chainInfo.fees?.fee_tokens?.[0]?.average_gas_price

    if (
      !prefix ||
      !denom ||
      !restUrl ||
      !expectedChainId ||
      gasPrice === undefined
    ) {
      throw new Error(`Missing required chain information for ${chainName}`)
    }

    const registry = new Registry()

    return {
      chainInfo,
      prefix,
      denom,
      restUrl,
      rpcUrl,
      expectedChainId,
      gasPrice,
      registry,
    }
  }

  /**
   * Handles the process of creating and broadcasting a Cosmos transaction.
   */
  async handleTransaction(
    data: CosmosTransaction,
    nearAuthentication: NearAuthentication,
    path: KeyDerivationPath
  ): Promise<string> {
    const { prefix, denom, rpcUrl, gasPrice, registry } =
      await this.fetchChainInfoAndCreateRegistry()

    // Fetch derived address and public key
    const { address, publicKey } = await fetchDerivedCosmosAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
      prefix,
    })

    // Create a custom signer
    const signer = new ChainSignaturesContractSigner({
      address,
      publicKey,
      path,
      nearAuthentication,
      contract: this.contract,
      relayerUrl: this.relayerUrl,
    })

    // Create a client
    const client = await SigningStargateClient.connectWithSigner(
      rpcUrl,
      signer,
      {
        registry,
        gasPrice: GasPrice.fromString(`${gasPrice}${denom}`),
      }
    )

    // Send transaction
    const gasLimit = data.gas || 200_000
    const feeAmount = gasPrice * gasLimit
    const fee: StdFee = {
      amount: [
        {
          denom,
          amount: feeAmount.toString(),
        },
      ],
      gas: gasLimit.toString(),
    }

    // Prepare messages
    const updatedMessages = data.messages.map((msg) => {
      if ('fromAddress' in msg.value && !msg.value.fromAddress) {
        const value = { ...msg.value, fromAddress: address }
        return { typeUrl: msg.typeUrl, value }
      }
      return msg
    })

    // Broadcast transaction
    const result = await client.signAndBroadcast(
      address,
      updatedMessages,
      fee,
      data.memo || ''
    )

    if (result.code !== 0) {
      throw new Error(`Failed to broadcast transaction: ${result.rawLog}`)
    }

    return result.transactionHash
  }
}

/**
 * Custom OfflineDirectSigner that uses ChainSignaturesContract for signing.
 */
class ChainSignaturesContractSigner implements OfflineDirectSigner {
  private readonly address: string
  private readonly publicKey: Uint8Array
  private readonly path: KeyDerivationPath
  private readonly nearAuthentication: NearAuthentication
  private readonly contract: ChainSignatureContracts
  private readonly relayerUrl?: string

  constructor(params: {
    address: string
    publicKey: Uint8Array
    path: KeyDerivationPath
    nearAuthentication: NearAuthentication
    contract: ChainSignatureContracts
    relayerUrl?: string
  }) {
    this.address = params.address
    this.publicKey = params.publicKey
    this.path = params.path
    this.nearAuthentication = params.nearAuthentication
    this.contract = params.contract
    this.relayerUrl = params.relayerUrl
  }

  async getAccounts(): Promise<readonly AccountData[]> {
    return [
      {
        address: this.address,
        algo: 'secp256k1',
        pubkey: this.publicKey,
      },
    ]
  }

  async signDirect(
    signerAddress: string,
    signDoc: SignDoc
  ): Promise<DirectSignResponse> {
    const signBytes = makeSignBytes(signDoc)

    // Use ChainSignaturesContract.sign to sign the signBytes directly
    const signatureResponse = await ChainSignaturesContract.sign({
      transactionHash: sha256(signBytes),
      path: this.path,
      nearAuthentication: this.nearAuthentication,
      contract: this.contract,
      relayerUrl: this.relayerUrl,
    })
    // Assume signatureResponse.signature is a hex string of the 64-byte signature
    const signatureBytes = new Uint8Array([
      ...fromHex(signatureResponse.r),
      ...fromHex(signatureResponse.s),
    ])
    // Build the response
    const publicKey = encodePubkey({
      type: 'tendermint/PubKeySecp256k1',
      value: toBase64(this.publicKey),
    })

    return {
      signed: signDoc,
      signature: {
        pub_key: {
          type: 'tendermint/PubKeySecp256k1',
          value: publicKey,
        },
        signature: toBase64(signatureBytes),
      },
    }
  }
}
