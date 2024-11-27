import { ethers } from 'ethers'

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
