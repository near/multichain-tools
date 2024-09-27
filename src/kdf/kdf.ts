import { ec as EC } from 'elliptic'
import { sha3_256 } from 'js-sha3'
import { base_decode } from 'near-api-js/lib/utils/serialize'

export function najPublicKeyStrToUncompressedHexPoint(
  najPublicKeyStr: string
): string {
  return `04${Buffer.from(base_decode(najPublicKeyStr.split(':')[1])).toString('hex')}`
}

async function sha3Hash(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)

  return sha3_256(data)
}

export async function deriveChildPublicKey(
  parentUncompressedPublicKeyHex: string,
  signerId: string,
  path: string = ''
): Promise<string> {
  const ec = new EC('secp256k1')
  const scalar = await sha3Hash(
    `near-mpc-recovery v0.1.0 epsilon derivation:${signerId},${path}`
  )

  const x = parentUncompressedPublicKeyHex.substring(2, 66)
  const y = parentUncompressedPublicKeyHex.substring(66)

  // Create a point object from X and Y coordinates
  const oldPublicKeyPoint = ec.curve.point(x, y)

  // Multiply the scalar by the generator point G
  const scalarTimesG = ec.g.mul(scalar)

  // Add the result to the old public key point
  const newPublicKeyPoint = oldPublicKeyPoint.add(scalarTimesG)

  return `04${
    newPublicKeyPoint.getX().toString('hex').padStart(64, '0') +
    newPublicKeyPoint.getY().toString('hex').padStart(64, '0')
  }`
}

export const generateCompressedPublicKey = async (
  signerId: string,
  path: string,
  publicKey: string
): Promise<string> => {
  const ec = new EC('secp256k1')
  const uncompressedHexPoint = najPublicKeyStrToUncompressedHexPoint(publicKey)
  const derivedPublicKeyHex = await deriveChildPublicKey(
    uncompressedHexPoint,
    signerId,
    path
  )

  const publicKeyBuffer = Buffer.from(derivedPublicKeyHex, 'hex')

  // Compress the public key
  const compressedPublicKey = ec
    .keyFromPublic(publicKeyBuffer)
    .getPublic()
    .encodeCompressed()

  // Return the compressed public key as a hex string
  return Buffer.from(compressedPublicKey).toString('hex')
}
