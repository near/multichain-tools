import { fromHex } from '@cosmjs/encoding'
import { Secp256k1, sha256, ripemd160 } from '@cosmjs/crypto'
import { bech32 } from 'bech32'

import { ChainSignaturesContract } from '../../signature'
import { generateCompressedPublicKey } from '../../kdf/kdf'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'

import { type CosmosPublicKeyAndAddressRequest } from './types'
import axios from 'axios'
import { chains } from 'chain-registry'

export async function fetchDerivedCosmosAddressAndPublicKey({
  signerId,
  path,
  nearNetworkId,
  multichainContractId,
  prefix,
}: CosmosPublicKeyAndAddressRequest): Promise<{
  address: string
  publicKey: Buffer
}> {
  const contractRootPublicKey = await ChainSignaturesContract.getPublicKey({
    networkId: nearNetworkId,
    contract: multichainContractId,
  })

  if (!contractRootPublicKey) {
    throw new Error('Failed to fetch root public key')
  }

  const derivedKeyHex = await generateCompressedPublicKey(
    signerId,
    getCanonicalizedDerivationPath(path),
    contractRootPublicKey
  )

  const publicKey = fromHex(derivedKeyHex)

  const address = pubkeyToAddress(publicKey, prefix)

  return { address, publicKey: Buffer.from(publicKey) }
}

function pubkeyToAddress(pubkey: Uint8Array, prefix: string): string {
  const pubkeyRaw =
    pubkey.length === 33 ? pubkey : Secp256k1.compressPubkey(pubkey)
  const sha256Hash = sha256(pubkeyRaw)
  const ripemd160Hash = ripemd160(sha256Hash)
  const address = bech32.encode(prefix, bech32.toWords(ripemd160Hash))
  return address
}

export const fetchChainInfo = async (
  chainId: string
): Promise<{
  prefix: string
  denom: string
  rpcUrl: string
  restUrl: string
  expectedChainId: string
  gasPrice: number
}> => {
  const chainInfo = chains.find((chain) => chain.chain_id === chainId)
  if (!chainInfo) {
    throw new Error(`Chain info not found for chainId: ${chainId}`)
  }

  const { bech32_prefix: prefix, chain_id: expectedChainId } = chainInfo
  const denom = chainInfo.staking?.staking_tokens?.[0]?.denom
  const rpcUrl = chainInfo.apis?.rpc?.[0]?.address
  const restUrl = chainInfo.apis?.rest?.[0]?.address
  const gasPrice = chainInfo.fees?.fee_tokens?.[0]?.average_gas_price

  if (
    !prefix ||
    !denom ||
    !rpcUrl ||
    !restUrl ||
    !expectedChainId ||
    gasPrice === undefined
  ) {
    throw new Error(
      `Missing required chain information for ${chainInfo.chain_name}`
    )
  }

  return { prefix, denom, rpcUrl, restUrl, expectedChainId, gasPrice }
}

export async function fetchCosmosBalance(
  address: string,
  chainId: string
): Promise<string> {
  try {
    const { restUrl, denom } = await fetchChainInfo(chainId)
    const balanceUrl = `${restUrl}/cosmos/bank/v1beta1/balances/${address}`
    const response = await axios.get(balanceUrl)

    const balances = response.data.balances
    const balance = balances.find((b: any) => b.denom === denom)

    if (balance) {
      return balance.amount
    } else {
      return '0'
    }
  } catch (error) {
    console.error('Failed to fetch Cosmos balance:', error)
    throw new Error('Failed to fetch Cosmos balance')
  }
}
