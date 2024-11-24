import { Bitcoin } from './chains/Bitcoin/Bitcoin'
import { type BitcoinRequest } from './chains/Bitcoin/types'
import { type CosmosRequest } from './chains/Cosmos/types'
import { Cosmos } from './chains/Cosmos/Cosmos'
import { EVM } from './chains/EVM/EVM'
import { type EVMRequest } from './chains/EVM/types'
import { type Response } from './chains/types'
import { ChainSignaturesContract } from './signature/ChainSignaturesContract/ChainSignaturesContract'
import { type KeyPair } from '@near-js/crypto'

export const signAndSendEVMTransaction = async (
  req: EVMRequest,
  keyPair: KeyPair
): Promise<Response> => {
  try {
    const evm = new EVM(req.chainConfig)

    const { transaction, txHash } =
      await evm.getSerializedTransactionAndPayloadToSign({
        data: req.transaction,
        nearAuthentication: req.nearAuthentication,
        path: req.derivationPath,
      })

    const signature = await ChainSignaturesContract.sign({
      hashedTx: txHash,
      path: req.derivationPath,
      nearAuthentication: req.nearAuthentication,
      contract: req.chainConfig.contract,
      relayerUrl: req.fastAuthRelayerUrl,
      keypair: keyPair,
    })

    const res = await evm.reconstructSignature({
      transactionSerialized: transaction,
      signature,
    })

    return {
      transactionHash: res.hash,
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
    const btc = new Bitcoin(req.chainConfig)

    const { hexTransaction, payloads } =
      await btc.getSerializedTransactionAndPayloadToSign({
        data: req.transaction,
        nearAuthentication: req.nearAuthentication,
        path: req.derivationPath,
      })

    const signatures = await Promise.all(
      payloads.map(
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

    const txid = await btc.reconstructSignature({
      nearAuthentication: req.nearAuthentication,
      path: req.derivationPath,
      signatures,
      psbtHex: hexTransaction,
    })

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
  req: CosmosRequest,
  keyPair: KeyPair
): Promise<Response> => {
  try {
    const cosmos = new Cosmos(req.chainConfig)

    const { transaction, payloads } =
      await cosmos.getSerializedTransactionAndPayloads({
        data: req.transaction,
        nearAuthentication: req.nearAuthentication,
        path: req.derivationPath,
      })

    const signatures = await Promise.all(
      payloads.map(
        async (payload) =>
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

    const txHash = await cosmos.handleTransaction({
      data: req.transaction,
      nearAuthentication: req.nearAuthentication,
      path: req.derivationPath,
      serializedTransaction: transaction,
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
