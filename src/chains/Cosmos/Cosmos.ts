// cosmos.ts

import { GasPrice, type StdFee } from '@cosmjs/stargate'
import {
  Registry,
  makeAuthInfoBytes,
  makeSignDoc,
  makeSignDocBytes,
  encodePubkey,
} from '@cosmjs/proto-signing'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import { toBase64, fromHex } from '@cosmjs/encoding'
import axios from 'axios'

import { fetchDerivedCosmosAddressAndPublicKey } from './utils'
import { ChainSignaturesContract } from '../../signature'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type KeyDerivationPath } from '../../kdf/types'
import { type CosmosTransaction, type CosmosChainInfo } from './types'

export class Cosmos {
  private readonly relayerUrl?: string
  private readonly contract: ChainSignatureContracts

  constructor(config: {
    relayerUrl?: string
    contract: ChainSignatureContracts
  }) {
    this.relayerUrl = config.relayerUrl
    this.contract = config.contract
  }

  /**
   * Broadcasts a signed transaction to the Cosmos network.
   *
   * @param {Uint8Array} signedTx - The signed transaction bytes.
   * @param {string} restUrl - The REST API URL for the chain.
   * @returns {Promise<string>} A promise that resolves with the transaction hash once the transaction is successfully broadcasted.
   */
  async sendTransaction(
    signedTx: Uint8Array,
    restUrl: string
  ): Promise<string> {
    const url = `${restUrl}/cosmos/tx/v1beta1/txs`
    const txBytesBase64 = toBase64(signedTx)
    const body = {
      tx_bytes: txBytesBase64,
      mode: 'BROADCAST_MODE_SYNC', // Or 'BROADCAST_MODE_BLOCK' for immediate inclusion
    }

    const response = await axios.post(url, body)
    if (response.data.tx_response.code !== 0) {
      throw new Error(
        `Failed to broadcast transaction: ${response.data.tx_response.raw_log}`
      )
    }
    return response.data.tx_response.txhash
  }

  /**
   * Handles the process of creating and broadcasting a Cosmos transaction.
   *
   * @param {CosmosTransaction} data - The transaction data.
   * @param {NearAuthentication} nearAuthentication - The object containing the user's authentication information.
   * @param {KeyDerivationPath} path - The key derivation path for the account.
   * @param {CosmosChainInfo} chainInfo - Information about the target chain.
   * @returns {Promise<string>} A promise that resolves to the transaction hash once the transaction is successfully broadcasted.
   */
  async handleTransaction(
    data: CosmosTransaction,
    nearAuthentication: NearAuthentication,
    path: KeyDerivationPath,
    chainInfo: CosmosChainInfo
  ): Promise<string> {
    const {
      restUrl,
      denom,
      prefix,
      gasPrice,
      registry,
      chainId: expectedChainId,
    } = chainInfo

    // Use the chain-specific registry if provided, otherwise create a new one
    const registryToUse = registry || new Registry()

    // Fetch derived address and public key
    const { address, publicKey } = await fetchDerivedCosmosAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
      prefix,
    })

    // Fetch account info
    const { accountNumber, sequence, chainId } = await this.fetchAccountInfo(
      address,
      restUrl
    )

    // Verify chain ID
    if (expectedChainId && chainId !== expectedChainId) {
      throw new Error(
        `Chain ID mismatch. Expected: ${expectedChainId}, Got: ${chainId}`
      )
    }

    // Calculate fee
    const gasLimit = data.gas || 200_000
    const gasPriceObj = GasPrice.fromString(gasPrice) // e.g., '0.025uatom'
    const feeAmount = gasPriceObj.amount.multiply(gasLimit)
    const fee: StdFee = {
      amount: [
        {
          denom,
          amount: feeAmount.toString(),
        },
      ],
      gas: gasLimit.toString(),
    }

    // Update messages with sender's address if necessary
    const updatedMessages = data.messages.map((msg) => {
      // If the message value has 'fromAddress', set it to the derived address
      if ('fromAddress' in msg.value && !msg.value.fromAddress) {
        const value = { ...msg.value, fromAddress: address }
        return { typeUrl: msg.typeUrl, value }
      }
      // Handle other message types similarly if needed
      return msg
    })

    // Create TxBody
    const txBody = {
      typeUrl: '/cosmos.tx.v1beta1.TxBody',
      value: {
        messages: updatedMessages,
        memo: data.memo || '',
      },
    }

    const txBodyBytes = registryToUse.encode(txBody)

    // Create AuthInfo
    const pubKeyProto = encodePubkey({
      type: 'tendermint/PubKeySecp256k1',
      value: toBase64(publicKey),
    })

    const authInfoBytes = makeAuthInfoBytes(
      [{ pubkey: pubKeyProto, sequence }],
      fee.amount,
      Number(gasLimit)
    )

    // Create SignDoc
    const signDoc = makeSignDoc(
      txBodyBytes,
      authInfoBytes,
      chainId,
      accountNumber
    )

    // Get sign bytes
    const signBytes = makeSignDocBytes(signDoc)

    // Sign the transaction hash using ChainSignaturesContract
    const signatureResponse = await ChainSignaturesContract.sign({
      transactionHash: signBytes,
      path,
      nearAuthentication,
      contract: this.contract,
      relayerUrl: this.relayerUrl,
    })

    if (!signatureResponse?.signature) {
      throw new Error('Failed to sign transaction')
    }

    const signatureBytes = fromHex(signatureResponse.signature)

    // Assemble the signed transaction
    const txRaw = TxRaw.fromPartial({
      bodyBytes: txBodyBytes,
      authInfoBytes,
      signatures: [signatureBytes],
    })

    // Encode the signed transaction
    const txBytes = TxRaw.encode(txRaw).finish()

    // Broadcast the transaction
    const txHashResult = await this.sendTransaction(txBytes, restUrl)
    return txHashResult
  }

  /**
   * Fetches account information for a given address.
   *
   * @param {string} address - The Cosmos address.
   * @param {string} restUrl - The REST API URL for the chain.
   * @returns {Promise<{ accountNumber: number; sequence: number; chainId: string }>} The account information.
   */
  private async fetchAccountInfo(
    address: string,
    restUrl: string
  ): Promise<{
    accountNumber: number
    sequence: number
    chainId: string
  }> {
    const accountUrl = `${restUrl}/cosmos/auth/v1beta1/accounts/${address}`
    const nodeInfoUrl = `${restUrl}/cosmos/base/tendermint/v1beta1/node_info`

    const [accountResponse, nodeInfoResponse] = await Promise.all([
      axios.get(accountUrl),
      axios.get(nodeInfoUrl),
    ])

    const accountData = accountResponse.data.account

    const chainId = nodeInfoResponse.data.default_node_info.network

    let accountNumber: number
    let sequence: number

    if (accountData['@type'] === '/cosmos.auth.v1beta1.BaseAccount') {
      accountNumber = parseInt(accountData.account_number, 10)
      sequence = parseInt(accountData.sequence, 10)
    } else if (accountData.base_account) {
      accountNumber = parseInt(accountData.base_account.account_number, 10)
      sequence = parseInt(accountData.base_account.sequence, 10)
    } else {
      throw new Error('Unsupported account type')
    }

    return {
      accountNumber,
      sequence,
      chainId,
    }
  }
}
