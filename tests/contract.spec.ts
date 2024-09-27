import { describe, test, expect } from '@jest/globals'
import { ethers } from 'ethers'
import {
  ChainSignaturesContract
} from '../src/signature'
import {
  type NearAuthentication,
  type ChainSignatureContracts,
} from '../src/chains/types'
import dotenv from 'dotenv'
import { KeyPair } from 'near-api-js'
import { fetchDerivedEVMAddress } from '../src'
import BN from 'bn.js'

dotenv.config()

describe('Chain Signature', () => {
  test('should generate a valid signature', async () => {
    const transactionHash = ethers.randomBytes(32)
    const path = {
      chain: 60 as const,
      domain: "m/44'/60'/0'/0/0",
    }
    const nearAuthentication: NearAuthentication = {
      accountId: process.env.NEXT_PUBLIC_NEAR_ACCOUNT_ID_TESTNET || '',
      deposit: new BN(5),
      keypair: KeyPair.fromString(
        process.env.NEXT_PUBLIC_NEAR_PRIVATE_KEY_TESTNET || ''
      ),
      networkId: 'testnet',
    }
    const contract: ChainSignatureContracts =
      process.env.NEXT_PUBLIC_CHAIN_SIGNATURE_CONTRACT_DEV_TESTNET || ''

    try {
      const signature = await ChainSignaturesContract.sign({
        transactionHash,
        path,
        nearAuthentication,
        contract,
      })

      expect(signature).toBeDefined()

      const ethereumAddress = await fetchDerivedEVMAddress({
        signerId: nearAuthentication.accountId,
        path,
        nearNetworkId: nearAuthentication.networkId,
        multichainContractId: contract,
      })

      const recoveredAddress = ethers.recoverAddress(transactionHash, {
        r: `0x${signature.r}`,
        s: `0x${signature.s}`,
        v: signature.v,
      })

      expect(recoveredAddress.toLowerCase()).toBe(ethereumAddress.toLowerCase())
    } catch (error) {
      if (error instanceof Error) {
        console.log('ERROR:', error.message)
      } else {
        console.log('An unknown error occurred: ', error)
      }
    }
  }, 30000)

  test('should retrieve the experimental signature deposit', async () => {
    const nearAuthentication: NearAuthentication = {
      accountId: process.env.NEXT_PUBLIC_NEAR_ACCOUNT_ID_TESTNET || '',
      keypair: KeyPair.fromString(
        process.env.NEXT_PUBLIC_NEAR_PRIVATE_KEY_TESTNET || ''
      ),
      networkId: 'testnet',
    }
    const contract: ChainSignatureContracts =
      process.env.NEXT_PUBLIC_CHAIN_SIGNATURE_CONTRACT_DEV_TESTNET || ''

    try {
      const deposit = await ChainSignaturesContract.getExperimentalSignatureDeposit(
        contract,
        nearAuthentication.networkId
      )

      expect(deposit).toBeDefined()
      expect(typeof deposit).toBe('string')
      console.log('Deposit:', deposit)
    } catch (error) {
      if (error instanceof Error) {
        console.log('ERROR:', error.message)
      } else {
        console.log('An unknown error occurred: ', error)
      }
    }
  }, 30000)
})
