import { ec as EC } from 'elliptic'
import { ethers } from 'ethers'
import { sha3_256 } from 'js-sha3'
import { base_decode } from 'near-api-js/lib/utils/serialize'

function najPublicKeyStrToUncompressedHexPoint(
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

export const generateEthereumAddress = async (
  signerId: string,
  path: string,
  publicKey: string
): Promise<string> => {
  const uncompressedHexPoint = najPublicKeyStrToUncompressedHexPoint(publicKey)
  const childPublicKey = await deriveChildPublicKey(
    uncompressedHexPoint,
    signerId,
    path
  )
  const publicKeyNoPrefix = childPublicKey.startsWith('04')
    ? childPublicKey.substring(2)
    : childPublicKey
  const hash = ethers.keccak256(Buffer.from(publicKeyNoPrefix, 'hex'))

  return `0x${hash.substring(hash.length - 40)}`
}

export const generateBTCAddress = async (
  signerId: string,
  path: string,
  publicKey: string
): Promise<string> => {
  const uncompressedHexPoint = najPublicKeyStrToUncompressedHexPoint(publicKey)
  return await deriveChildPublicKey(uncompressedHexPoint, signerId, path)
}
