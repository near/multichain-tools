import axios from 'axios'
import * as bitcoin from 'bitcoinjs-lib'

import {
  fetchBTCFeeProperties,
  fetchDerivedBTCAddressAndPublicKey,
  parseBTCNetwork,
} from './utils'
import { type ChainSignatureContracts, type NearAuthentication } from '../types'
import { type KeyDerivationPath } from '../../kdf/types'
import {
  type BTCNetworkIds,
  type BTCTransaction,
  type UTXO,
  type BTCOutput,
  type Transaction,
  type BTCAddressInfo,
} from './types'
import { toRSV } from '../../signature/utils'
import { type RSVSignature, type MPCSignature } from '../../signature/types'

export class Bitcoin {
  private readonly network: BTCNetworkIds
  private readonly providerUrl: string
  private readonly contract: ChainSignatureContracts

  constructor(config: {
    network: BTCNetworkIds
    providerUrl: string
    contract: ChainSignatureContracts
  }) {
    this.network = config.network
    this.providerUrl = config.providerUrl
    this.contract = config.contract
  }

  static toBTC(satoshis: number): number {
    return satoshis / 100000000
  }

  static toSatoshi(btc: number): number {
    return Math.round(btc * 100000000)
  }

  async fetchBalance(address: string): Promise<string> {
    const { data } = await axios.get<BTCAddressInfo>(
      `${this.providerUrl}/address/${address}`
    )
    return Bitcoin.toBTC(
      data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum
    ).toString()
  }

  async fetchTransaction(transactionId: string): Promise<bitcoin.Transaction> {
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

  static parseRSVSignature(signature: RSVSignature): Buffer {
    const r = signature.r.padStart(64, '0')
    const s = signature.s.padStart(64, '0')

    const rawSignature = Buffer.from(r + s, 'hex')

    if (rawSignature.length !== 64) {
      throw new Error('Invalid signature length.')
    }

    return rawSignature
  }

  async sendTransaction(txHex: string): Promise<string | undefined> {
    try {
      const response = await axios.post<string>(`${this.providerUrl}/tx`, txHex)

      if (response.status === 200) {
        return response.data
      }
      throw new Error(`Failed to broadcast transaction: ${response.data}`)
    } catch (error: unknown) {
      console.error(error)
      throw new Error(`Error broadcasting transaction`)
    }
  }

  async populatePSBT({
    address,
    data,
  }: {
    address: string
    data: BTCTransaction
  }): Promise<bitcoin.Psbt> {
    const { inputs, outputs } =
      data.inputs && data.outputs
        ? data
        : await fetchBTCFeeProperties(this.providerUrl, address, [
            {
              address: data.to,
              value: Bitcoin.toSatoshi(parseFloat(data.value)),
            },
          ])

    const psbt = new bitcoin.Psbt({
      network: parseBTCNetwork(this.network),
    })

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
      if ('script' in out) {
        psbt.addOutput({
          script: out.script,
          value: out.value,
        })
      } else {
        psbt.addOutput({
          address: out.address || address,
          value: out.value,
        })
      }
    })

    return psbt
  }

  async reconstructSignature({
    nearAuthentication,
    path,
    signatures,
    psbtHex,
    options,
  }: {
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    signatures: MPCSignature[]
    psbtHex?: string
    options?: {
      storageKey?: string
    }
  }): Promise<string> {
    const { publicKey } = await fetchDerivedBTCAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      btcNetworkId: this.network,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
    })

    let psbt: bitcoin.Psbt | undefined
    if (psbtHex) {
      psbt = bitcoin.Psbt.fromHex(psbtHex)
    } else if (options?.storageKey) {
      const psbtHex = window.localStorage.getItem(options.storageKey)
      if (psbtHex) {
        psbt = bitcoin.Psbt.fromHex(psbtHex)
      }
    }

    if (!psbt) {
      throw new Error('No PSBT provided or stored in localStorage')
    }

    const keyPair = (index: number): bitcoin.Signer => ({
      publicKey,
      sign: () => {
        const mpcSignature = signatures[index]
        return Bitcoin.parseRSVSignature(toRSV(mpcSignature))
      },
    })
    for (let index = 0; index < psbt.txInputs.length; index += 1) {
      psbt.signInput(index, keyPair(index))
    }

    psbt.finalizeAllInputs()
    const txid = await this.sendTransaction(psbt.extractTransaction().toHex())

    if (txid) {
      return txid
    }
    throw new Error('Failed to broadcast transaction')
  }

  async getSerializedTransactionAndPayloadToSign({
    data,
    nearAuthentication,
    path,
    options,
  }: {
    data: BTCTransaction
    nearAuthentication: NearAuthentication
    path: KeyDerivationPath
    options?: {
      storageKey?: string
    }
  }): Promise<{
    hexTransaction: string
    payloads: Array<{ index: number; payload: Uint8Array }>
  }> {
    const { address, publicKey } = await fetchDerivedBTCAddressAndPublicKey({
      signerId: nearAuthentication.accountId,
      path,
      btcNetworkId: this.network,
      nearNetworkId: nearAuthentication.networkId,
      multichainContractId: this.contract,
    })

    const psbt = await this.populatePSBT({ address, data })
    const psbtHex = psbt.toHex()

    const payloads: Array<{ index: number; payload: Uint8Array }> = []

    // Mock signer to get the payloads as the library doesn't expose a methods with such functionality
    const keyPair = (index: number): bitcoin.Signer => ({
      publicKey,
      sign: (hash) => {
        payloads.push({
          index,
          payload: hash,
        })
        // The return it's intentionally wrong as this is a mock signer
        return hash
      },
    })
    for (let index = 0; index < psbt.txInputs.length; index += 1) {
      psbt.signInput(index, keyPair(index))
    }

    if (options?.storageKey) {
      window.localStorage.setItem(options.storageKey, psbt.toHex())
    }

    return {
      hexTransaction: psbtHex,
      payloads,
    }
  }
}
