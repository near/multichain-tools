import { type Account } from '@near-js/accounts'
import {
  actionCreators,
  type SignedDelegate,
  type Action,
} from '@near-js/transactions'
import { NEAR_MAX_GAS } from './utils'
import type BN from 'bn.js'

export interface NearTransactionPayload {
  receiverId: string
  actions: Array<{
    methodName: string
    args: Record<string, unknown>
    deposit?: string
    gas?: string
  }>
}

export interface NearTransactionOptions {
  receiverId: string
  actions: Action[]
  signerId?: string
}

export const prepareNearTransaction = ({
  account,
  payload,
  deposit,
}: {
  account: Account
  payload: NearTransactionPayload
  deposit?: BN
}): NearTransactionOptions => {
  const actions: Action[] = payload.actions.map((action) => {
    return actionCreators.functionCall(
      action.methodName,
      action.args,
      BigInt(action.gas || NEAR_MAX_GAS.toString()),
      BigInt(action.deposit || deposit?.toString() || '0')
    )
  })

  return {
    receiverId: payload.receiverId,
    actions,
    signerId: account.accountId,
  }
}

export const prepareSignedDelegate = async ({
  account,
  payload,
  deposit,
}: {
  account: Account
  payload: NearTransactionPayload
  deposit?: BN
}): Promise<SignedDelegate> => {
  const { receiverId, actions } = prepareNearTransaction({
    account,
    payload,
    deposit,
  })

  return await account.signedDelegate({
    receiverId,
    actions,
    blockHeightTtl: 60,
  })
}
