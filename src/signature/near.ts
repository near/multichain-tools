import type {
  Action,
  FinalExecutionOutcome,
  NetworkId,
} from '@near-wallet-selector/core'
import { type MPCPayloads, type ChainSignatureContracts } from '../chains/types'
import { type KeyDerivationPath } from '../kdf/types'
import { ChainSignaturesContract } from './ChainSignaturesContract/ChainSignaturesContract'
import { type MPCSignature } from './types'
import { type ExecutionOutcomeWithId } from 'near-api-js/lib/providers'
import { NEAR_MAX_GAS } from './utils'

export const nearWallet = {
  utils: {
    mpcPayloadsToTransaction: async ({
      networkId,
      contractId,
      mpcPayloads,
      path,
    }: {
      networkId: NetworkId
      contractId: ChainSignatureContracts
      mpcPayloads: MPCPayloads
      path: KeyDerivationPath
    }): Promise<{
      receiverId: string
      actions: Action[]
    }> => {
      const currentContractFee = await ChainSignaturesContract.getCurrentFee({
        networkId,
        contract: contractId,
      })

      return {
        receiverId: contractId,
        actions: mpcPayloads.map(({ payload }) => ({
          type: 'FunctionCall',
          params: {
            methodName: 'sign',
            args: {
              request: {
                payload: Array.from(payload),
                path,
                key_version: 0,
              },
            },
            gas: NEAR_MAX_GAS.toString(),
            deposit: currentContractFee?.toString() || '1',
          },
        })),
      }
    },
    responseToMpcSignature: ({
      response,
    }: {
      response: FinalExecutionOutcome
    }): MPCSignature | undefined => {
      const signature: string = response.receipts_outcome.reduce<string>(
        (acc: string, curr: ExecutionOutcomeWithId) => {
          if (acc) {
            return acc
          }
          const { status } = curr.outcome
          return (
            (typeof status === 'object' &&
              status.SuccessValue &&
              status.SuccessValue !== '' &&
              Buffer.from(status.SuccessValue, 'base64').toString('utf-8')) ||
            ''
          )
        },
        ''
      )

      if (signature) {
        const parsedJSONSignature = JSON.parse(signature) as {
          Ok: MPCSignature
        }

        return parsedJSONSignature.Ok
      } else {
        return undefined
      }
    },
  },
}
