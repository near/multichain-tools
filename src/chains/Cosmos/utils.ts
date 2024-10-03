import { fromHex } from '@cosmjs/encoding'
import { Secp256k1, sha256, ripemd160 } from '@cosmjs/crypto'
import { bech32 } from 'bech32'

import { ChainSignaturesContract } from '../../signature'
import { generateCompressedPublicKey } from '../../kdf/kdf'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'
import { type CosmosPublicKeyAndAddressRequest } from './types'
import { chains } from 'chain-registry'
import { StargateClient } from '@cosmjs/stargate'

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
    const client = await StargateClient.connect(restUrl)

    const balance = await client.getBalance(address, denom)

    return balance.amount
  } catch (error) {
    console.error('Failed to fetch Cosmos balance:', error)
    throw new Error('Failed to fetch Cosmos balance')
  }
}
