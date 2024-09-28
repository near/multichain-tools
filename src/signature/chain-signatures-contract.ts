import { type Account, Contract } from '@near-js/accounts'
import { actionCreators } from '@near-js/transactions'
import { getNearAccount, NEAR_MAX_GAS, toRVS } from './utils'
import BN from 'bn.js'
import { ethers } from 'ethers'

import { type RSVSignature, type MPCSignature } from './types'
import {
  type ChainSignatureContracts,
  type NearAuthentication,
} from '../chains/types'
import { parseSignedDelegateForRelayer } from '../relayer'
import { type ExecutionOutcomeWithId } from 'near-api-js/lib/providers'
import { type KeyDerivationPath } from '../kdf/types'
import { getCanonicalizedDerivationPath } from '../kdf/utils'

interface SignArgs {
  payload: number[]
  path: string
  key_version: number
}

type MultiChainContract = Contract & {
  public_key: () => Promise<string>
  sign: (args: {
    args: { request: SignArgs }
    gas: BN
    amount: BN
  }) => Promise<MPCSignature>
  experimental_signature_deposit: () => Promise<number>
}

interface SignParams {
  transactionHash: string | ethers.BytesLike
  path: KeyDerivationPath
  nearAuthentication: NearAuthentication
  contract: ChainSignatureContracts
  relayerUrl?: string
}

export const ChainSignaturesContract = {
  getContract: (
    account: Account,
    contract: ChainSignatureContracts
  ): MultiChainContract => {
    return new Contract(account, contract, {
      viewMethods: ['public_key', 'experimental_signature_deposit'],
      changeMethods: ['sign'],
      useLocalViewExecution: false,
    })
  },

  sign: async ({
    transactionHash,
    path,
    nearAuthentication,
    contract,
    relayerUrl,
  }: SignParams): Promise<RSVSignature> => {
    const account = await getNearAccount({
      networkId: nearAuthentication.networkId,
      accountId: nearAuthentication.accountId,
      keypair: nearAuthentication.keypair,
    })

    const payload = Array.from(ethers.getBytes(transactionHash))

    const signArgs = {
      payload,
      path: getCanonicalizedDerivationPath(path),
      key_version: 0,
    }

    const deposit =
      nearAuthentication.deposit ??
      BN.max(
        new BN(1),
        new BN(
          (await ChainSignaturesContract.getExperimentalSignatureDeposit(
            contract,
            nearAuthentication.networkId
          )) || '1'
        )
      )

    try {
      return relayerUrl
        ? await signWithRelayer(
            account,
            contract,
            signArgs,
            deposit,
            relayerUrl
          )
        : await signDirect(account, contract, signArgs, deposit)
    } catch (e) {
      console.error(e)
      throw new Error('Signature error, please retry')
    }
  },

  getRootPublicKey: async (
    contract: ChainSignatureContracts,
    nearNetworkId: string
  ): Promise<string | undefined> => {
    const nearAccount = await getNearAccount({
      networkId: nearNetworkId,
    })

    const chainSignaturesContract = ChainSignaturesContract.getContract(
      nearAccount,
      contract
    )

    return chainSignaturesContract.public_key()
  },

  getExperimentalSignatureDeposit: async (
    contract: ChainSignatureContracts,
    nearNetworkId: string
  ): Promise<string | undefined> => {
    const nearAccount = await getNearAccount({
      networkId: nearNetworkId,
    })

    const chainSignaturesContract = ChainSignaturesContract.getContract(
      nearAccount,
      contract
    )

    return (
      await chainSignaturesContract.experimental_signature_deposit()
    ).toLocaleString('fullwide', { useGrouping: false })
  },
}

const signDirect = async (
  account: Account,
  contract: ChainSignatureContracts,
  signArgs: SignArgs,
  deposit: BN
): Promise<RSVSignature> => {
  const chainSignaturesContract = ChainSignaturesContract.getContract(
    account,
    contract
  )

  const signature = (await chainSignaturesContract.sign({
    args: { request: signArgs },
    gas: NEAR_MAX_GAS,
    amount: deposit,
  })) as MPCSignature

  return toRVS(signature)
}

const signWithRelayer = async (
  account: Account,
  contract: ChainSignatureContracts,
  signArgs: SignArgs,
  deposit: BN,
  relayerUrl: string
): Promise<RSVSignature> => {
  const functionCall = actionCreators.functionCall(
    'sign',
    { request: signArgs },
    NEAR_MAX_GAS,
    deposit
  )

  const signedDelegate = await account.signedDelegate({
    receiverId: contract,
    actions: [functionCall],
    blockHeightTtl: 60,
  })
  // Remove the cached access key to prevent nonce reuse
  delete account.accessKeyByPublicKeyCache[
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    signedDelegate.delegateAction.publicKey.toString()
  ]

  // TODO: add support for creating the signed delegate using the mpc recovery service with an oidc_token

  const res = await fetch(`${relayerUrl}/send_meta_tx_async`, {
    method: 'POST',
    mode: 'cors',
    body: JSON.stringify(parseSignedDelegateForRelayer(signedDelegate)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })

  const txHash = await res.text()
  const txStatus = await account.connection.provider.txStatus(
    txHash,
    account.accountId
  )

  const signature: string = txStatus.receipts_outcome.reduce<string>(
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
    return toRVS(parsedJSONSignature.Ok)
  }
  throw new Error('Signature error, please retry')
}
