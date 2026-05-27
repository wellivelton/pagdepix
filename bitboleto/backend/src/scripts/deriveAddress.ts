// Run: npx ts-node src/scripts/deriveAddress.ts
// Prints: confidential Liquid address at m/84'/1776'/0'/0/0 + new XPUB at m/84'/1776'/0'
// Does NOT print the mnemonic.

import '../loadEnv';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as liquid from 'liquidjs-lib';
import * as crypto from 'crypto';

const bip32 = BIP32Factory(ecc);
const NETWORK = liquid.networks.liquid;

const MNEMONIC     = process.env.LIQUID_MNEMONIC || '';
const BLIND_KEY_HEX = process.env.LIQUID_MASTER_BLINDING_KEY || '';

if (!MNEMONIC)      { console.error('LIQUID_MNEMONIC not set'); process.exit(1); }
if (!BLIND_KEY_HEX) { console.error('LIQUID_MASTER_BLINDING_KEY not set'); process.exit(1); }

const seed = bip39.mnemonicToSeedSync(MNEMONIC);
const root = bip32.fromSeed(seed, NETWORK as any);

// Account node m/84'/1776'/0'
const account = root.derivePath("m/84'/1776'/0'");

// XPUB at account level (what goes in LIQUID_XPUB)
const xpub = account.neutered().toBase58();

// Address at m/84'/1776'/0'/0/0
const child = account.derive(0).derive(0);
const pubkey = Buffer.from(child.publicKey);
const p2wpkh = liquid.payments.p2wpkh({ pubkey, network: NETWORK });

// SLIP77: HMAC-SHA256(masterBlindingKey, scriptPubKey)
const masterBlindingKey = Buffer.from(BLIND_KEY_HEX, 'hex');
const blindingPrivKey   = crypto.createHmac('sha256', masterBlindingKey).update(p2wpkh.output!).digest();
const blindingPubKey    = Buffer.from(ecc.pointFromScalar(blindingPrivKey, true)!);
const address           = liquid.address.toConfidential(p2wpkh.address!, blindingPubKey);

console.log(address);
console.log('');
console.log('XPUB (update LIQUID_XPUB in .env if mnemonic changed):');
console.log(xpub);
