// utils.ts

import { fromHex } from '@cosmjs/encoding'
import { Secp256k1, sha256, ripemd160 } from '@cosmjs/crypto'
import { bech32 } from 'bech32'

import { ChainSignaturesContract } from '../../signature'
import { generateCompressedPublicKey } from '../../kdf/kdf'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'

import { type CosmosPublicKeyAndAddressRequest } from './types'

/**
 * Fetches the derived Cosmos address and public key for a given signer ID and derivation path.
 *
 * @param {CosmosPublicKeyAndAddressRequest} params - The parameters for the request.
 * @returns {Promise<{ address: string; publicKey: Uint8Array }>} The derived address and public key.
 */
export async function fetchDerivedCosmosAddressAndPublicKey({
  signerId,
  path,
  nearNetworkId,
  multichainContractId,
  prefix,
}: CosmosPublicKeyAndAddressRequest): Promise<{
  address: string
  publicKey: Uint8Array
}> {
  const contractRootPublicKey = await ChainSignaturesContract.getRootPublicKey(
    multichainContractId,
    nearNetworkId
  )

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

  return { address, publicKey }
}

/**
 * Converts a public key to a Cosmos address.
 *
 * @param {Uint8Array} pubkey - The public key.
 * @param {string} prefix - The Bech32 prefix for the network.
 * @returns {string} The Cosmos address.
 */
function pubkeyToAddress(pubkey: Uint8Array, prefix: string): string {
  const pubkeyRaw =
    pubkey.length === 33 ? pubkey : Secp256k1.compressPubkey(pubkey)
  const sha256Hash = sha256(pubkeyRaw)
  const ripemd160Hash = ripemd160(sha256Hash)
  const address = bech32.encode(prefix, bech32.toWords(ripemd160Hash))
  return address
}
