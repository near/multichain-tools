import { describe, test, expect } from '@jest/globals';
import * as bitcoin from 'bitcoinjs-lib';
import { ec as EC } from 'elliptic'

describe.skip('Bitcoin Address Generation for Testnet', () => {
  const testnet = bitcoin.networks.testnet;
  const ec = new EC('secp256k1')
  const compressedPublicKey = ec.genKeyPair().getPublic().encodeCompressed()
  const publicKey = Buffer.from(compressedPublicKey)

  test('Generate P2PKH (Legacy) address', () => {
    const { address: addressP2PKH } = bitcoin.payments.p2pkh({ 
      pubkey: publicKey,
      network: testnet 
    });
    expect(addressP2PKH).toBeDefined();
    expect(addressP2PKH?.startsWith('m') || addressP2PKH?.startsWith('n')).toBeTruthy();
    console.log('P2PKH Address:', addressP2PKH);
  });

  test('Generate P2WPKH (SegWit Bech32) address', () => {
    const { address: addressP2WPKH } = bitcoin.payments.p2wpkh({ 
      pubkey: publicKey,
      network: testnet 
    });
    expect(addressP2WPKH).toBeDefined();
    expect(addressP2WPKH?.startsWith('tb1')).toBeTruthy();
    console.log('P2WPKH Address:', addressP2WPKH);
  });
});

