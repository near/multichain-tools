// import dotenv from 'dotenv';
// dotenv.config();
require("dotenv").config()

import express, { Request, Response } from 'express';
import { ethers } from 'ethers';
import { sign } from './src/signature/signature';
import { NearAuthentication, ChainSignatureContracts } from './src/chains/types';
import { KeyPair } from 'near-api-js';
import { fetchDerivedEVMAddress } from './src';


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post('/ping', async (req, res) => {
  const transactionHash = ethers.randomBytes(32);
  const path = "m/44'/60'/0'/0/0";
  const nearAuthentication: NearAuthentication = {
    accountId: process.env.NEXT_PUBLIC_NEAR_ACCOUNT_ID || '',
    keypair: KeyPair.fromString(
      process.env.NEXT_PUBLIC_NEAR_PRIVATE_KEY || ''
    ),
    networkId: 'testnet',
  };
  const contract: ChainSignatureContracts =
    process.env.NEXT_PUBLIC_CHAIN_SIGNATURE_CONTRACT_DEV_TESTNET || '';

  try {
    const signature = await sign({
      transactionHash,
      path,
      nearAuthentication,
      contract,
    });

    const ethereumAddress = await fetchDerivedEVMAddress(
      nearAuthentication.accountId,
      path,
      nearAuthentication.networkId,
      contract
    );

    const recoveredAddress = ethers.recoverAddress(transactionHash, {
      r: `0x${signature.r}`,
      s: `0x${signature.s}`,
      v: signature.v,
    });

    if (recoveredAddress.toLowerCase() === ethereumAddress.toLowerCase()) {
      res.json({ signature, recoveredAddress, ethereumAddress });
    } else {
      res.status(500).json({ error: 'Recovered address does not match' });
    }
  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An unknown error occurred' });
    }
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
