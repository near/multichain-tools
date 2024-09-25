import { ethers } from 'ethers'

import { generateEthereumAddress } from '../../kdf/kdf'
import { ChainSignaturesContract } from '../../signature'
import { getCanonicalizedDerivationPath } from '../../kdf/utils'
import { type FetchEVMAddressRequest } from './types'

/**
 * Estimates the amount of gas that a transaction will consume.
 *
 * This function calls the underlying JSON RPC's `estimateGas` method to
 * predict how much gas the transaction will use. This is useful for setting
 * gas limits when sending a transaction to ensure it does not run out of gas.
 *
 * @param {string} providerUrl - The providerUrl of the EVM network to query the fee properties from.
 * @param {ethers.TransactionLike} transaction - The transaction object for which to estimate gas. This function only requires the `to`, `value`, and `data` fields of the transaction object.
 * @returns {Promise<bigint>} A promise that resolves to the estimated gas amount as a bigint.
 */
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

/**
 * Derives an Ethereum address for a given signer ID and derivation path.
 *
 * This method leverages the root public key associated with the signer ID to generate an Ethereum address
 * and public key based on the specified derivation path.
 *
 * @param {string} signerId - The identifier of the signer.
 * @param {KeyDerivationPath} path - The derivation path used for generating the address.
 * @param {string} nearNetworkId - The near network id used to interact with the NEAR blockchain.
 * @param {ChainSignatureContracts} multichainContractId - The contract identifier used to get the root public key.
 * @returns {Promise<string>} A promise that resolves to the derived Ethereum address.
 */
export async function fetchDerivedEVMAddress({
  signerId,
  path,
  nearNetworkId,
  multichainContractId,
}: FetchEVMAddressRequest): Promise<string> {
  const contractRootPublicKey = await ChainSignaturesContract.getRootPublicKey(
    multichainContractId,
    nearNetworkId
  )

  if (!contractRootPublicKey) {
    throw new Error('Failed to fetch root public key')
  }

  return await generateEthereumAddress(
    signerId,
    getCanonicalizedDerivationPath(path),
    contractRootPublicKey
  )
}
