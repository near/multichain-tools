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
import { type KeyDerivationPath } from '../kdf/types'
import { getCanonicalizedDerivationPath } from '../kdf/utils'

const NEAR_MAX_GAS = new BN('300000000000000')

const toRVS = (signature: [string, string]): RSVSignature => {
  return {
    r: signature[0].slice(2),
    s: signature[1],
  }
}

type MultiChainContract = Contract & {
  public_key: () => Promise<string>
  sign: (args: {
    args: {
      payload: number[]
      path: string
      key_version: number
    }
    gas: BN
  }) => Promise<[string, string]>
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
  path: KeyDerivationPath
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

  const payload = Array.from(ethers.getBytes(transactionHash)).slice().reverse()

  const contractFunctionCallArgs = {
    payload,
    path: getCanonicalizedDerivationPath(path),
    key_version: 0,
  }

  if (!relayerUrl) {
    const multichainContractAcc = getMultichainContract(account, contract)

    const [R, s] = await multichainContractAcc.sign({
      args: contractFunctionCallArgs,
      gas: NEAR_MAX_GAS,
    })

    return toRVS([R, s])
  }

  // Retry at most 3 times on nonce error
  for (let i = 0; i < 3; i++) {
    try {
      const functionCall = actionCreators.functionCall(
        'sign',
        contractFunctionCallArgs,
        NEAR_MAX_GAS,
        new BN(0)
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
        const parsedJSONSignature = JSON.parse(signature) as [string, string]
        return toRVS(parsedJSONSignature)
      }
    } catch (e) {
      console.error(e)
    }
  }

  throw new Error('Signature error, please retry')
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
