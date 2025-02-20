import { type Account, Contract } from '@near-js/accounts'
import { actionCreators } from '@near-js/transactions'

import BN from 'bn.js'
import { ethers } from 'ethers'

import {
  type MPCSignature,
  type KeyDerivationPath,
} from '../../signature/types'
import {
  type NearNetworkIds,
  type ChainSignatureContracts,
  type NearAuthentication,
} from '../../chains/types'
import { parseSignedDelegateForRelayer } from '../../relayer'
import { type KeyPair } from '@near-js/crypto'
import { NEAR_MAX_GAS } from '../../signature/utils'
import { getNearAccount } from '../utils'
import { transactionBuilder } from '../..'

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
  derived_public_key: (args: {
    path: string
    predecessor: string
  }) => Promise<string>
}

export const ChainSignaturesContract = {
  getContract: ({
    account,
    contract,
  }: {
    account: Account
    contract: ChainSignatureContracts
  }): MultiChainContract => {
    return new Contract(account, contract, {
      viewMethods: [
        'public_key',
        'experimental_signature_deposit',
        'derived_public_key',
      ],
      changeMethods: ['sign'],
      useLocalViewExecution: false,
    }) as unknown as MultiChainContract
  },

  getPublicKey: async ({
    networkId,
    contract,
  }: {
    networkId: NearNetworkIds
    contract: ChainSignatureContracts
  }): Promise<string | undefined> => {
    const nearAccount = await getNearAccount({ networkId })
    const chainSignaturesContract = ChainSignaturesContract.getContract({
      account: nearAccount,
      contract,
    })
    return await chainSignaturesContract.public_key()
  },

  getCurrentFee: async ({
    networkId,
    contract,
  }: {
    networkId: NearNetworkIds
    contract: ChainSignatureContracts
  }): Promise<BN | undefined> => {
    const nearAccount = await getNearAccount({ networkId })
    const chainSignaturesContract = ChainSignaturesContract.getContract({
      account: nearAccount,
      contract,
    })
    return new BN(
      (
        await chainSignaturesContract.experimental_signature_deposit()
      ).toLocaleString('fullwide', { useGrouping: false })
    )
  },

  getDerivedPublicKey: async ({
    networkId,
    contract,
    args,
  }: {
    networkId: NearNetworkIds
    contract: ChainSignatureContracts
    args: { path: string; predecessor: string }
  }): Promise<string | undefined> => {
    const nearAccount = await getNearAccount({ networkId })
    const chainSignaturesContract = ChainSignaturesContract.getContract({
      account: nearAccount,
      contract,
    })
    return await chainSignaturesContract.derived_public_key(args)
  },

  sign: async ({
    hashedTx,
    path,
    nearAuthentication,
    contract,
    relayerUrl,
    keypair,
    proposedDeposit,
  }: {
    hashedTx: Uint8Array
    path: KeyDerivationPath
    nearAuthentication: NearAuthentication
    contract: ChainSignatureContracts
    relayerUrl?: string
    keypair: KeyPair
    proposedDeposit?: BN
  }): Promise<MPCSignature> => {
    const account = await getNearAccount({
      networkId: nearAuthentication.networkId,
      accountId: nearAuthentication.accountId,
      keypair,
    })

    const mpcPayload = {
      payload: Array.from(ethers.getBytes(hashedTx)),
      path,
      key_version: 0,
    }

    const deposit =
      proposedDeposit ??
      (await ChainSignaturesContract.getCurrentFee({
        networkId: nearAuthentication.networkId,
        contract,
      })) ??
      new BN(1)

    try {
      return relayerUrl
        ? await signWithRelayer({
            account,
            contract,
            signArgs: mpcPayload,
            deposit,
            relayerUrl,
          })
        : await signDirect({
            account,
            contract,
            signArgs: mpcPayload,
            deposit,
          })
    } catch (e) {
      console.error(e)
      throw new Error('Signature error, please retry')
    }
  },
}

const signDirect = async ({
  account,
  contract,
  signArgs,
  deposit,
}: {
  account: Account
  contract: ChainSignatureContracts
  signArgs: SignArgs
  deposit: BN
}): Promise<MPCSignature> => {
  const chainSignaturesContract = ChainSignaturesContract.getContract({
    account,
    contract,
  })

  const signature = await chainSignaturesContract.sign({
    args: { request: signArgs },
    gas: NEAR_MAX_GAS,
    amount: deposit,
  })

  return signature
}

const signWithRelayer = async ({
  account,
  contract,
  signArgs,
  deposit,
  relayerUrl,
}: {
  account: Account
  contract: ChainSignatureContracts
  signArgs: SignArgs
  deposit: BN
  relayerUrl: string
}): Promise<MPCSignature> => {
  const functionCall = actionCreators.functionCall(
    'sign',
    { request: signArgs },
    BigInt(NEAR_MAX_GAS.toString()),
    BigInt(deposit.toString())
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

  const res = await fetch(`${relayerUrl}/send_meta_tx_async`, {
    method: 'POST',
    mode: 'cors',
    body: JSON.stringify(parseSignedDelegateForRelayer(signedDelegate)),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })

  const txHash = await res.text()
  const txStatus = await account.connection.provider.txStatus(
    txHash,
    account.accountId,
    'FINAL'
  )

  const signature = transactionBuilder.near.responseToMpcSignature({
    response: txStatus,
  })

  if (!signature) {
    throw new Error('Signature error, please retry')
  }

  return signature
}
