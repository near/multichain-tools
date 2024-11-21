import axios from 'axios'
import * as bitcoin from 'bitcoinjs-lib'

// There is no types for coinselect
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import coinselect from 'coinselect'

import {
  type BTCOutput,
  type BitcoinPublicKeyAndAddressRequest,
  type UTXO,
} from './types'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'
import { ChainSignaturesContract } from '../../signature/chain-signatures-contract'
import { najToPubKey } from '../../kdf/kdf'

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
      }
    })
    return utxos
  } catch (error) {
    console.error('Failed to fetch UTXOs:', error)
    return []
  }
}

export async function fetchBTCFeeProperties(
  providerUrl: string,
  from: string,
  targets: BTCOutput[],
  confirmationTarget = 6
): Promise<{
  inputs: UTXO[]
  outputs: BTCOutput[]
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
  const derivedPubKeyNAJ = await ChainSignaturesContract.getDerivedPublicKey({
    networkId: nearNetworkId,
    contract: multichainContractId,
    args: { path: getCanonicalizedDerivationPath(path), predecessor: signerId },
  })

  if (!derivedPubKeyNAJ) {
    throw new Error('Failed to get derived public key')
  }

  const derivedKey = najToPubKey(derivedPubKeyNAJ, { compress: true })
  const publicKeyBuffer = Buffer.from(derivedKey, 'hex')
  const network = parseBTCNetwork(btcNetworkId)

  // Use P2WPKH (Bech32) address type
  const payment = bitcoin.payments.p2wpkh({
    pubkey: publicKeyBuffer,
    network,
  })

  const { address } = payment

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
