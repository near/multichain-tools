import { Bitcoin } from '../chains/Bitcoin/Bitcoin'
import { type BitcoinRequest } from '../chains/Bitcoin/types'
import { type CosmosRequest } from '../chains/Cosmos/types'
import { Cosmos } from '../chains/Cosmos/Cosmos'
import { EVM } from '../chains/EVM/EVM'
import { type EVMRequest } from '../chains/EVM/types'
import { type Response } from '../chains/types'
import { ChainSignaturesContract } from '../contracts'
import { type KeyPair } from '@near-js/crypto'

export const signAndSendEVMTransaction = async (
  req: EVMRequest,
  keyPair: KeyPair
): Promise<Response> => {
  try {
    const evm = new EVM({
      providerUrl: req.chainConfig.providerUrl,
      contract: req.chainConfig.contract,
      nearNetworkId: req.nearAuthentication.networkId,
    })

    const { transaction, mpcPayloads } = await evm.getMPCPayloadAndTransaction(
      req.transaction
    )

    const signature = await ChainSignaturesContract.sign({
      hashedTx: mpcPayloads[0].payload,
      path: req.derivationPath,
      nearAuthentication: req.nearAuthentication,
      contract: req.chainConfig.contract,
      relayerUrl: req.fastAuthRelayerUrl,
      keypair: keyPair,
    })

    const txHash = await evm.addSignatureAndBroadcast({
      transaction,
      mpcSignatures: [signature],
    })

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

export const signAndSendBTCTransaction = async (
  req: BitcoinRequest,
  keyPair: KeyPair
): Promise<Response> => {
  try {
    const btc = new Bitcoin({
      providerUrl: req.chainConfig.providerUrl,
      contract: req.chainConfig.contract,
      network: req.chainConfig.network,
      nearNetworkId: req.nearAuthentication.networkId,
    })

    const { transaction, mpcPayloads } = await btc.getMPCPayloadAndTransaction(
      req.transaction
    )

    const signatures = await Promise.all(
      mpcPayloads.map(
        async ({ payload }) =>
          await ChainSignaturesContract.sign({
            hashedTx: payload,
            path: req.derivationPath,
            nearAuthentication: req.nearAuthentication,
            contract: req.chainConfig.contract,
            relayerUrl: req.fastAuthRelayerUrl,
            keypair: keyPair,
          })
      )
    )

    const txHash = await btc.addSignatureAndBroadcast({
      transaction,
      mpcSignatures: signatures,
    })

    return {
      transactionHash: txHash,
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
  req: CosmosRequest,
  keyPair: KeyPair
): Promise<Response> => {
  try {
    const cosmos = new Cosmos({
      contract: req.chainConfig.contract,
      chainId: req.chainConfig.chainId,
      nearNetworkId: req.nearAuthentication.networkId,
    })

    const { transaction, mpcPayloads } =
      await cosmos.getMPCPayloadAndTransaction(req.transaction)

    const signatures = await Promise.all(
      mpcPayloads.map(
        async ({ payload }) =>
          await ChainSignaturesContract.sign({
            hashedTx: payload,
            path: req.derivationPath,
            nearAuthentication: req.nearAuthentication,
            contract: req.chainConfig.contract,
            relayerUrl: req.fastAuthRelayerUrl,
            keypair: keyPair,
          })
      )
    )

    const txHash = await cosmos.addSignatureAndBroadcast({
      transaction,
      mpcSignatures: signatures,
    })

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
