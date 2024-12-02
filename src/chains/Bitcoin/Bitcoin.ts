import axios from 'axios'
import * as bitcoin from 'bitcoinjs-lib'

import { fetchBTCFeeProperties, parseBTCNetwork } from './utils'
import {
  type MPCPayloads,
  type ChainSignatureContracts,
  type NearNetworkIds,
} from '../types'
import {
  type BTCNetworkIds,
  type UTXO,
  type BTCOutput,
  type Transaction,
  type BTCAddressInfo,
  type BTCTransactionRequest,
  type BTCUnsignedTransaction,
} from './types'
import { toRSV, najToPubKey } from '../../signature/utils'
import {
  type RSVSignature,
  type MPCSignature,
  type KeyDerivationPath,
} from '../../signature/types'
import { ChainSignaturesContract } from '../../contracts'
import { type Chain } from '../Chain'

export class Bitcoin
  implements Chain<BTCTransactionRequest, BTCUnsignedTransaction>
{
  private static readonly SATOSHIS_PER_BTC = 100_000_000

  private readonly nearNetworkId: NearNetworkIds
  private readonly network: BTCNetworkIds
  private readonly providerUrl: string
  private readonly contract: ChainSignatureContracts

  constructor(config: {
    nearNetworkId: NearNetworkIds
    network: BTCNetworkIds
    providerUrl: string
    contract: ChainSignatureContracts
  }) {
    this.nearNetworkId = config.nearNetworkId
    this.network = config.network
    this.providerUrl = config.providerUrl
    this.contract = config.contract
  }

  static toBTC(satoshis: number): number {
    return satoshis / Bitcoin.SATOSHIS_PER_BTC
  }

  static toSatoshi(btc: number): number {
    return Math.round(btc * Bitcoin.SATOSHIS_PER_BTC)
  }

  private async fetchTransaction(
    transactionId: string
  ): Promise<bitcoin.Transaction> {
    const { data } = await axios.get<Transaction>(
      `${this.providerUrl}/tx/${transactionId}`
    )
    const tx = new bitcoin.Transaction()

    tx.version = data.version
    tx.locktime = data.locktime

    data.vin.forEach((vin) => {
      const txHash = Buffer.from(vin.txid, 'hex').reverse()
      const { vout, sequence } = vin
      const scriptSig = vin.scriptsig
        ? Buffer.from(vin.scriptsig, 'hex')
        : undefined
      tx.addInput(txHash, vout, sequence, scriptSig)
    })

    data.vout.forEach((vout) => {
      const { value } = vout
      const scriptPubKey = Buffer.from(vout.scriptpubkey, 'hex')
      tx.addOutput(scriptPubKey, value)
    })

    data.vin.forEach((vin, index) => {
      if (vin.witness && vin.witness.length > 0) {
        const witness = vin.witness.map((w) => Buffer.from(w, 'hex'))
        tx.setWitness(index, witness)
      }
    })

    return tx
  }

  private static parseRSVSignature(signature: RSVSignature): Buffer {
    const r = signature.r.padStart(64, '0')
    const s = signature.s.padStart(64, '0')

    const rawSignature = Buffer.from(r + s, 'hex')

    if (rawSignature.length !== 64) {
      throw new Error('Invalid signature length.')
    }

    return rawSignature
  }

  private async createPSBT({
    address,
    data,
  }: {
    address: string
    data: BTCTransactionRequest
  }): Promise<bitcoin.Psbt> {
    const { inputs, outputs } =
      data.inputs && data.outputs
        ? data
        : await fetchBTCFeeProperties(this.providerUrl, address, [
            {
              address: data.to,
              value: parseFloat(data.value),
            },
          ])

    const psbt = new bitcoin.Psbt({ network: parseBTCNetwork(this.network) })

    // Since the sender address is always P2WPKH, we can assume all inputs are P2WPKH
    await Promise.all(
      inputs.map(async (utxo: UTXO) => {
        const transaction = await this.fetchTransaction(utxo.txid)
        const prevOut = transaction.outs[utxo.vout]
        const value = utxo.value

        // Prepare the input as P2WPKH
        const inputOptions = {
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: prevOut.script,
            value,
          },
        }

        psbt.addInput(inputOptions)
      })
    )

    outputs.forEach((out: BTCOutput) => {
      if ('script' in out && out.script) {
        psbt.addOutput({
          script: out.script,
          value: out.value,
        })
      } else if ('address' in out && out.address) {
        psbt.addOutput({
          address: out.address,
          value: out.value,
        })
      } else {
        psbt.addOutput({
          address,
          value: out.value,
        })
      }
    })

    return psbt
  }

  async getBalance(address: string): Promise<string> {
    const { data } = await axios.get<BTCAddressInfo>(
      `${this.providerUrl}/address/${address}`
    )
    return Bitcoin.toBTC(
      data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
    ).toString()
  }

  async deriveAddressAndPublicKey(
    signerId: string,
    path: KeyDerivationPath
  ): Promise<{ address: string; publicKey: string }> {
    const derivedPubKeyNAJ = await ChainSignaturesContract.getDerivedPublicKey({
      networkId: this.nearNetworkId,
      contract: this.contract,
      args: { path, predecessor: signerId },
    })

    if (!derivedPubKeyNAJ) {
      throw new Error('Failed to get derived public key')
    }

    const derivedKey = najToPubKey(derivedPubKeyNAJ, { compress: true })
    const publicKeyBuffer = Buffer.from(derivedKey, 'hex')
    const network = parseBTCNetwork(this.network)

    // Use P2WPKH (Bech32) address type
    const payment = bitcoin.payments.p2wpkh({
      pubkey: publicKeyBuffer,
      network,
    })

    const { address } = payment

    if (!address) {
      throw new Error('Failed to generate Bitcoin address')
    }

    return { address, publicKey: derivedKey }
  }

  setTransaction(
    transaction: BTCUnsignedTransaction,
    storageKey: string
  ): void {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        psbt: transaction.psbt.toHex(),
        publicKey: transaction.publicKey,
      })
    )
  }

  getTransaction(
    storageKey: string,
    options?: {
      remove?: boolean
    }
  ): BTCUnsignedTransaction | undefined {
    const txSerialized = window.localStorage.getItem(storageKey)
    if (!txSerialized) return undefined

    if (options?.remove) {
      window.localStorage.removeItem(storageKey)
    }

    const transactionJSON = JSON.parse(txSerialized)
    return {
      psbt: bitcoin.Psbt.fromHex(transactionJSON.psbt as string),
      publicKey: transactionJSON.publicKey,
    }
  }

  async getMPCPayloadAndTransaction(
    transactionRequest: BTCTransactionRequest
  ): Promise<{
    transaction: BTCUnsignedTransaction
    mpcPayloads: MPCPayloads
  }> {
    const publicKeyBuffer = Buffer.from(transactionRequest.publicKey, 'hex')
    const psbt = await this.createPSBT({
      address: transactionRequest.from,
      data: transactionRequest,
    })

    // We can't double sign a PSBT, therefore we serialize the payload before to return it
    const psbtHex = psbt.toHex()

    const mpcPayloads: MPCPayloads = []

    const mockKeyPair = (index: number): bitcoin.Signer => ({
      publicKey: publicKeyBuffer,
      sign: (hash: Buffer): Buffer => {
        mpcPayloads.push({
          index,
          payload: new Uint8Array(hash),
        })
        // Return dummy signature to satisfy the interface
        return Buffer.alloc(64)
      },
    })

    for (let index = 0; index < psbt.inputCount; index++) {
      psbt.signInput(index, mockKeyPair(index))
    }

    return {
      transaction: {
        psbt: bitcoin.Psbt.fromHex(psbtHex),
        publicKey: transactionRequest.publicKey,
      },
      mpcPayloads: mpcPayloads.sort((a, b) => a.index - b.index),
    }
  }

  async addSignatureAndBroadcast({
    transaction: { psbt, publicKey },
    mpcSignatures,
  }: {
    transaction: BTCUnsignedTransaction
    mpcSignatures: MPCSignature[]
  }): Promise<string> {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex')

    const keyPair = (index: number): bitcoin.Signer => ({
      publicKey: publicKeyBuffer,
      sign: () => {
        const mpcSignature = mpcSignatures[index]
        return Bitcoin.parseRSVSignature(toRSV(mpcSignature))
      },
    })

    for (let index = 0; index < psbt.inputCount; index++) {
      psbt.signInput(index, keyPair(index))
    }

    psbt.finalizeAllInputs()

    const response = await axios.post<string>(
      `${this.providerUrl}/tx`,
      psbt.extractTransaction().toHex()
    )

    if (response.status === 200 && response.data) {
      return response.data
    }

    throw new Error(`Failed to broadcast transaction: ${response.data}`)
  }
}
