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
import { KeyPair } from 'near-api-js'

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
  experimental_signature_deposit: () => Promise<number>
}

const getMultichainContract = (
  account: Account,
  contract: ChainSignatureContracts
): MultiChainContract => {
  return new Contract(account, contract, {
    viewMethods: ['public_key', 'experimental_signature_deposit'],
    changeMethods: ['sign'],
    useLocalViewExecution: false,
  }) as MultiChainContract
}

const setConnection = async (
  networkId: string,
  accountId: string,
  keypair: KeyPair
): Promise<Account> => {
  const keyStore = new InMemoryKeyStore()
  await keyStore.setKey(networkId, accountId, keypair)

  const connection = Connection.fromConfig({
    networkId,
    provider: {
      type: 'JsonRpcProvider',
      args: {
        url: {
          testnet: 'https://rpc.testnet.near.org',
          mainnet: 'https://rpc.mainnet.near.org',
        }[networkId],
      },
    },
    signer: { type: 'InMemorySigner', keyStore },
  })

  return new Account(connection, accountId)
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
  const account = await setConnection(
    nearAuthentication.networkId,
    nearAuthentication.accountId,
    nearAuthentication.keypair
  )

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
        (await getExperimentalSignatureDeposit(
          contract,
          nearAuthentication.networkId
        )) || '1'
      )
    )

  if (!relayerUrl) {
    const multichainContractAcc = getMultichainContract(account, contract)

    const signature = await multichainContractAcc.sign({
      args: { request: signArgs },
      gas: NEAR_MAX_GAS,
      amount: deposit,
    })

    return toRVS(signature)
  }
  try {
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
  } catch (e) {
    console.error(e)
  }

  throw new Error('Signature error, please retry')
}

export async function getRootPublicKey(
  contract: ChainSignatureContracts,
  nearNetworkId: string
): Promise<string | undefined> {
  const nearAccount = await setConnection(
    nearNetworkId,
    'dontcare',
    KeyPair.fromRandom('ed25519')
  )
  const multichainContractAcc = getMultichainContract(nearAccount, contract)

  return await multichainContractAcc.public_key()
}

export async function getExperimentalSignatureDeposit(
  contract: ChainSignatureContracts,
  nearNetworkId: string
): Promise<string | undefined> {
  const nearAccount = await setConnection(
    nearNetworkId,
    'dontcare',
    KeyPair.fromRandom('ed25519')
  )
  const multichainContractAcc = getMultichainContract(nearAccount, contract)

  return (
    await multichainContractAcc.experimental_signature_deposit()
  ).toLocaleString('fullwide', { useGrouping: false })
}
