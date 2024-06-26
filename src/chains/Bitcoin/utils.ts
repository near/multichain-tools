/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
import axios from 'axios'
import * as bitcoin from 'bitcoinjs-lib'

// There is no types for coinselect
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import coinselect from 'coinselect'

import { type BitcoinPublicKeyAndAddressRequest, type UTXO } from './types'

import { generateBTCAddress } from '../../kdf/kdf'
import { getRootPublicKey } from '../../signature'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'

/**
 * Fetches the current fee rate from the Bitcoin network.
 * This method queries the RPC endpoint for fee estimates and returns the fee rate
 * expected for a transaction to be confirmed within a certain number of blocks.
 * The confirmation target is set to 6 blocks by default, which is commonly used
 * for a balance between confirmation time and cost.
 *
 * @returns {Promise<number>} A promise that resolves to the fee rate in satoshis per byte.
 * @throws {Error} Throws an error if the fee rate data for the specified confirmation target is missing.
 */
export async function fetchBTCFeeRate(
  providerUrl: string,
  confirmationTarget = 6
): Promise<number> {
  const response = await axios.get(`${providerUrl}fee-estimates`)
  if (response.data?.[confirmationTarget]) {
    return response.data[confirmationTarget]
  }
  throw new Error(
    `Fee rate data for ${confirmationTarget} blocks confirmation target is missing in the response`
  )
}

/**
 * Fetches the Unspent Transaction Outputs (UTXOs) for a given Bitcoin address.
 *
 * @param {string} address - The Bitcoin address for which to fetch the UTXOs.
 * @returns {Promise<UTXO[]>} A promise that resolves to an array of UTXOs.
 * Each UTXO is represented as an object containing the transaction ID (`txid`), the output index within that transaction (`vout`),
 * the value of the output in satoshis (`value`) and the locking script (`script`).
 */
export async function fetchBTCUTXOs(
  providerUrl: string,
  address: string
): Promise<UTXO[]> {
  try {
    const response = await axios.get(`${providerUrl}address/${address}/utxo`)
    const utxos = response.data.map((utxo: any) => {
      return {
        txid: utxo.txid,
        vout: utxo.vout,
        value: utxo.value,
        script: utxo.script,
      }
    })
    return utxos
  } catch (error) {
    console.error('Failed to fetch UTXOs:', error)
    return []
  }
}

/**
 * Calculates the fee properties for a Bitcoin transaction.
 * This function fetches the Unspent Transaction Outputs (UTXOs) for the given address,
 * and the fee rate for the specified confirmation target. It then uses the `coinselect` algorithm
 * to select the UTXOs to be spent and calculates the fee required for the transaction.
 *
 * @param {string} providerUrl - The Bitcoin provider url to request the fee properties from
 * @param {string} from - The Bitcoin address from which the transaction is to be sent.
 * @param {Array<{address: string, value: number}>} targets - An array of target addresses and values (in satoshis) to send.
 * @param {number} [confirmationTarget=6] - The desired number of blocks in which the transaction should be confirmed.
 * @returns {Promise<{inputs: UTXO[], outputs: {address: string, value: number}[], fee: number}>} A promise that resolves to an object containing the inputs (selected UTXOs), outputs (destination addresses and values), and the transaction fee in satoshis.
 */
export async function fetchBTCFeeProperties(
  providerUrl: string,
  from: string,
  targets: Array<{
    address: string
    value: number
  }>,
  confirmationTarget = 6
): Promise<{
  inputs: UTXO[]
  outputs: Array<{ address: string; value: number }>
  fee: number
}> {
  const utxos = await fetchBTCUTXOs(providerUrl, from)
  const feeRate = await fetchBTCFeeRate(providerUrl, confirmationTarget)

  // Add a small amount to the fee rate to ensure the transaction is confirmed
  const ret = coinselect(utxos, targets, Math.ceil(feeRate + 1))

  if (!ret.inputs || !ret.outputs) {
    throw new Error(
      'Invalid transaction: coinselect failed to find a suitable set of inputs and outputs. This could be due to insufficient funds, or no inputs being available that meet the criteria.'
    )
  }

  return ret
}

/**
 * Derives a Bitcoin address and its corresponding public key for a given signer ID and derivation path.
 * This method utilizes the root public key associated with the signer ID to generate a Bitcoin address
 * and public key buffer based on the specified derivation path and network.
 *
 * @param {string} signerId - The unique identifier of the signer.
 * @param {string} path - The derivation path used to generate the address.
 * @param {bitcoin.networks.Network} network - The Bitcoin network (e.g., mainnet, testnet).
 * @param {string} nearNetworkId - The network id used to interact with the NEAR blockchain.
 * @param {ChainSignatureContracts} contract - The mpc contract's accountId on the NEAR blockchain.
 * @returns {Promise<{ address: string; publicKey: Buffer }>} An object containing the derived Bitcoin address and its corresponding public key buffer.
 */
export async function fetchDerivedBTCAddressAndPublicKey({
  signerId,
  path,
  btcNetworkId,
  nearNetworkId,
  multichainContractId,
}: BitcoinPublicKeyAndAddressRequest): Promise<{
  address: string
  publicKey: Buffer
}> {
  const contractRootPublicKey = await getRootPublicKey(
    multichainContractId,
    nearNetworkId
  )

  if (!contractRootPublicKey) {
    throw new Error('Failed to fetch root public key')
  }

  const derivedKey = await generateBTCAddress(
    signerId,
    getCanonicalizedDerivationPath(path),
    contractRootPublicKey
  )

  const publicKeyBuffer = Buffer.from(derivedKey, 'hex')

  const { address } = bitcoin.payments.p2pkh({
    pubkey: publicKeyBuffer,
    network: parseBTCNetwork(btcNetworkId),
  })

  if (!address) {
    throw new Error('Failed to generate Bitcoin address')
  }

  return { address, publicKey: publicKeyBuffer }
}

export function parseBTCNetwork(network: string): bitcoin.networks.Network {
  switch (network.toLowerCase()) {
    case 'mainnet':
      return bitcoin.networks.bitcoin
    case 'testnet':
      return bitcoin.networks.testnet
    case 'regtest':
      return bitcoin.networks.regtest
    default:
      throw new Error(`Unknown Bitcoin network: ${network}`)
  }
}
