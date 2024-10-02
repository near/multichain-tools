import { ethers } from 'ethers'

import { ChainSignaturesContract } from '../../signature'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'
import { type FetchEVMAddressRequest } from './types'
import {
  najPublicKeyStrToUncompressedHexPoint,
  deriveChildPublicKey,
} from '../../kdf/kdf'

export async function fetchEVMFeeProperties(
  providerUrl: string,
  transaction: ethers.TransactionLike
): Promise<{
  gasLimit: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  maxFee: bigint
}> {
  const provider = new ethers.JsonRpcProvider(providerUrl)
  const gasLimit = await provider.estimateGas(transaction)
  const feeData = await provider.getFeeData()

  const maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits('10', 'gwei')
  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas ?? ethers.parseUnits('10', 'gwei')

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    maxFee: maxFeePerGas * gasLimit,
  }
}

export async function fetchDerivedEVMAddress({
  signerId,
  path,
  nearNetworkId,
  multichainContractId,
}: FetchEVMAddressRequest): Promise<string> {
  const contractRootPublicKey = await ChainSignaturesContract.getPublicKey({
    networkId: nearNetworkId,
    contract: multichainContractId,
  })

  if (!contractRootPublicKey) {
    throw new Error('Failed to fetch root public key')
  }

  const uncompressedHexPoint = najPublicKeyStrToUncompressedHexPoint(
    contractRootPublicKey
  )
  const childPublicKey = await deriveChildPublicKey(
    uncompressedHexPoint,
    signerId,
    getCanonicalizedDerivationPath(path)
  )

  const publicKeyNoPrefix = childPublicKey.startsWith('04')
    ? childPublicKey.substring(2)
    : childPublicKey

  const hash = ethers.keccak256(Buffer.from(publicKeyNoPrefix, 'hex'))

  return `0x${hash.substring(hash.length - 40)}`
}
