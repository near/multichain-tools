import { base_decode } from 'near-api-js/lib/utils/serialize'

export const najToPubKey = (
  najPubKey: string,
  options: {
    compress: boolean
  }
): string => {
  const uncompressedPubKey = `04${Buffer.from(base_decode(najPubKey.split(':')[1])).toString('hex')}`

  if (!options.compress) {
    return uncompressedPubKey
  }

  const pubKeyHex = uncompressedPubKey.startsWith('04')
    ? uncompressedPubKey.slice(2)
    : uncompressedPubKey

  if (pubKeyHex.length !== 128) {
    throw new Error('Invalid uncompressed public key length')
  }

  const x = pubKeyHex.slice(0, 64)
  const y = pubKeyHex.slice(64)

  const isEven = parseInt(y.slice(-1), 16) % 2 === 0
  const prefix = isEven ? '02' : '03'

  return prefix + x
}
