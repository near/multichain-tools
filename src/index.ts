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

    // Retry to up to 3 times to handle nonce issue
    for (let i = 0; i < 3; i++) {
      const res = await evm.handleTransaction(
        req.transaction,
        req.nearAuthentication,
        req.derivationPath
      )

      if (res?.hash) {
        return {
          transactionHash: res.hash,
          success: true,
        }
      }
    }
  } catch (e: unknown) {
    return {
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }

  return {
    success: false,
    errorMessage: 'Transaction failed',
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
      req.derivationPath
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
  fetchBTCFeeProperties,
  fetchDerivedBTCAddressAndPublicKey,
} from './chains/Bitcoin/utils'

export {
  fetchDerivedEVMAddress,
  fetchEVMFeeProperties,
} from './chains/EVM/utils'

export type { FetchEVMAddressRequest } from './chains/EVM/types'
export type { BitcoinPublicKeyAndAddressRequest } from './chains/Bitcoin/types'

export type { NearNetworkIds, ChainSignatureContracts } from './chains/types'

export { type BTCNetworkIds } from './chains/Bitcoin/types'

export { type EVMRequest } from './chains/EVM/types'
export { type BitcoinRequest } from './chains/Bitcoin/types'

export type { SLIP044ChainId, KeyDerivationPath } from './kdf/types'
export type { BTCChainConfigWithProviders } from './chains/Bitcoin/types'
export type { EVMChainConfigWithProviders } from './chains/EVM/types'
