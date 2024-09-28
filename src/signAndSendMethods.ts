import { Bitcoin } from './chains/Bitcoin/Bitcoin'
import { type BitcoinRequest } from './chains/Bitcoin/types'
import { type CosmosRequest } from './chains/Cosmos/types'
import { Cosmos } from './chains/Cosmos/Cosmos'
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
      req.derivationPath
    )

    if (res) {
      return {
        transactionHash: res.hash,
        success: true,
      }
    } else {
      console.error(res)
      return {
        success: false,
        errorMessage: 'Transaction failed',
      }
    }
  } catch (e: unknown) {
    console.error(e)
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

export const signAndSendCosmosTransaction = async (
  req: CosmosRequest
): Promise<Response> => {
  console.log('signAndSendCosmosTransaction', req)
  try {
    const cosmos = new Cosmos({
      contract: req.chainConfig.contract,
      chainId: req.chainConfig.chainId,
      relayerUrl: req.fastAuthRelayerUrl,
    })

    const txHash = await cosmos.handleTransaction(
      req.transaction,
      req.nearAuthentication,
      req.derivationPath
    )

    return {
      transactionHash: txHash,
      success: true,
    }
  } catch (e: unknown) {
    console.error(e)
    return {
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    }
  }
}
