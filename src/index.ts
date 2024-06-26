import { Bitcoin } from './chains/Bitcoin/Bitcoin'
import { type BitcoinRequest } from './chains/Bitcoin/types'
import EVM from './chains/EVM/EVM'
import { type EVMRequest } from './chains/EVM/types'
import { type Response } from './chains/types'

export const signAndSendEVMTransaction = async (
  req: EVMRequest
): Promise<Response> => {
  try {
    const evm = new EVM({
      ...req.chainConfig,
      relayerUrl: req.fastAuthRelayerUrl,
    })

    const res = await evm.handleTransaction(
      req.transaction,
      req.nearAuthentication,
      req.transaction.derivedPath
    )

    if (res) {
      return {
        transactionHash: res.hash,
        success: true,
      }
    } else {
      return {
        success: false,
        errorMessage: 'Transaction failed',
      }
    }
  } catch (e: unknown) {
    return {
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }
}

export const signAndSendBTCTransaction = async (
  req: BitcoinRequest
): Promise<Response> => {
  try {
    const btc = new Bitcoin({
      ...req.chainConfig,
      relayerUrl: req.fastAuthRelayerUrl,
    })

    const txid = await btc.handleTransaction(
      req.transaction,
      req.nearAuthentication,
      req.transaction.derivedPath
    )

    return {
      transactionHash: txid,
      success: true,
    }
  } catch (e: unknown) {
    return {
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }
}

export {
  fetchDerivedEVMAddress,
  fetchBTCFeeProperties,
  fetchDerivedBTCAddress,
  fetchEstimatedEVMFee,
  fetchEVMFeeProperties,
  fetchDerivedBTCAddressAndPublicKey,
} from './utils'

export type {
  NearNetworkIds,
  ChainSignatureContracts,
  BTCNetworkIds,
} from './chains/types'
