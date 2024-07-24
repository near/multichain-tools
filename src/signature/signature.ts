import { Account, Connection, Contract } from '@near-js/accounts'
import { InMemoryKeyStore } from '@near-js/keystores'
import { actionCreators } from '@near-js/transactions'
import BN from 'bn.js'
import { ethers } from 'ethers'

import { type RSVSignature } from './types'
import {
  type ChainSignatureContracts,
  type NearAuthentication,
} from '../chains/types'
import { parseSignedDelegateForRelayer } from '../relayer'
import { type ExecutionOutcomeWithId } from 'near-api-js/lib/providers'

const NEAR_MAX_GAS = new BN('300000000000000')

const toRVS = (signature: MPCSignature): RSVSignature => {
  return {
    r: signature.big_r.affine_point.substring(2),
    s: signature.s.scalar,
    v: signature.recovery_id,
  }
}

interface SignArgs {
  payload: number[]
  path: string
  key_version: number
}
interface MPCSignature {
  big_r: {
    affine_point: string
  }
  s: {
    scalar: string
  }
  recovery_id: number
}

type MultiChainContract = Contract & {
  public_key: () => Promise<string>
  sign: (args: {
    args: { request: SignArgs }
    gas: BN
    amount: BN
  }) => Promise<MPCSignature>
}

const getMultichainContract = (
  account: Account,
  contract: ChainSignatureContracts
): MultiChainContract => {
  return new Contract(account, contract, {
    viewMethods: ['public_key'],
    changeMethods: ['sign'],
    useLocalViewExecution: false,
  }) as MultiChainContract
}

interface SignParams {
  transactionHash: string | ethers.BytesLike
  path: string
  nearAuthentication: NearAuthentication
  contract: ChainSignatureContracts
  relayerUrl?: string
}

/**
 * Signs a transaction hash using a specified account and path, then sends the signed transaction
 * to a relayer service for execution. It attempts to fetch the signature from the transaction
 * receipt up to 3 times with a delay of 10 seconds between each attempt.
 *
 * @param {SignParams} params - The parameters object.
 * @param {string | ethers.BytesLike} params.transactionHash - The hash of the transaction to be signed.
 * @param {string} params.path - The derivation path used for signing the transaction.
 * @param {NearAuthentication} params.nearAuthentication - The NEAR accountId, keypair, and networkId used for signing the transaction.
 * @param {ChainSignatureContracts} params.contract - The contract identifier for chain signature operations.
 * @param {string} [params.relayerUrl] - The URL of the relayer service to which the signed transaction is sent.
 * @returns {Promise<RSVSignature>} A promise that resolves to the RSV signature of the signed transaction.
 * @throws {Error} Throws an error if the signature cannot be fetched after 3 attempts.
 */
export const sign = async ({
  transactionHash,
  path,
  nearAuthentication,
  contract,
  relayerUrl,
}: SignParams): Promise<RSVSignature> => {
  const keyStore = new InMemoryKeyStore()
  await keyStore.setKey(
    nearAuthentication.networkId,
    nearAuthentication.accountId,
    nearAuthentication.keypair
  )

  const connection = Connection.fromConfig({
    networkId: nearAuthentication.networkId,
    provider: {
      type: 'JsonRpcProvider',
      args: {
        url: {
          testnet: 'https://rpc.testnet.near.org',
          mainnet: 'https://rpc.mainnet.near.org',
        }[nearAuthentication.networkId],
      },
    },
    signer: { type: 'InMemorySigner', keyStore },
  })

  const account = new Account(connection, nearAuthentication.accountId)

  const payload = Array.from(ethers.getBytes(transactionHash))

  const signArgs = {
    payload,
    path,
    key_version: 0,
  }

  if (!relayerUrl) {
    const multichainContractAcc = getMultichainContract(account, contract)

    const signature = await multichainContractAcc.sign({
      args: { request: signArgs },
      gas: NEAR_MAX_GAS,
      amount: new BN(1),
    })

    return toRVS(signature)
  }

  const functionCall = actionCreators.functionCall(
    'sign',
    { request: signArgs },
    NEAR_MAX_GAS,
    new BN(0)
  )

  const signedDelegate = await account.signedDelegate({
    receiverId: contract,
    actions: [functionCall],
    blockHeightTtl: 60,
  })

  // TODO: add support for creating the signed delegate using the mpc recovery service with an oidc_token

  const res = await fetch(`${relayerUrl}/send_meta_tx_async`, {
    method: 'POST',
    mode: 'cors',
    body: JSON.stringify(parseSignedDelegateForRelayer(signedDelegate)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })

  const txHash = await res.text()

  // TODO: check if we really need to retry here
  let attempts = 0
  const getSignature = async (): Promise<RSVSignature> => {
    if (attempts >= 3) {
      throw new Error('Signature error, please retry')
    }

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
      const parsedJSONSignature = JSON.parse(signature) as MPCSignature
      return toRVS(parsedJSONSignature)
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10000)
    })
    attempts += 1
    return await getSignature()
  }

  return await getSignature()
}

export async function getRootPublicKey(
  contract: ChainSignatureContracts,
  nearNetworkId: string
): Promise<string | undefined> {
  const nearConnection = Connection.fromConfig({
    networkId: nearNetworkId,
    provider: {
      type: 'JsonRpcProvider',
      args: {
        url: {
          testnet: 'https://rpc.testnet.near.org',
          mainnet: 'https://rpc.mainnet.near.org',
        }[nearNetworkId],
      },
    },
    signer: { type: 'InMemorySigner', keyStore: new InMemoryKeyStore() },
  })

  const nearAccount = new Account(nearConnection, 'dontcare')
  const multichainContractAcc = getMultichainContract(nearAccount, contract)

  return await multichainContractAcc.public_key()
}
