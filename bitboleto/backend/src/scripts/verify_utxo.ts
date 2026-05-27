import '../loadEnv';
import * as liquid from 'liquidjs-lib';

async function main() {
  const { default: initZkp } = await import('@vulpemventures/secp256k1-zkp');
  const zkp = await initZkp();
  const conf = new liquid.confidential.Confidential(zkp as any);

  const ESPLORA = 'https://blockstream.info/liquid/api';
  const TXID = 'a42e8818ebaeb57db54b3e93aff4918036aae0a702330c73d2238852cd220df6';
  const VOUT = 1;

  const BLIND_KEY_HEX = process.env.LIQUID_MASTER_BLINDING_KEY!;
  const XPUB = process.env.SIDESWAP_LIQUID_XPUB!;

  // Reproduce the key derivation
  const BIP32Factory = (await import('bip32')).default;
  const ecc = await import('tiny-secp256k1');
  const crypto = await import('crypto');
  const bip32 = BIP32Factory(ecc);

  const masterBlindingKey = Buffer.from(BLIND_KEY_HEX, 'hex');
  const root = bip32.fromBase58(XPUB);
  
  // Try indices 0-20
  const txRes = await fetch(`${ESPLORA}/tx/${TXID}/hex`);
  const txHex = await txRes.text();
  const tx = liquid.Transaction.fromHex(txHex);
  const out = tx.outs[VOUT];
  
  console.log('out.asset (hex, first 10 bytes):', Buffer.from(out.asset).slice(0,10).toString('hex'));
  console.log('out.value (hex, first 10 bytes):', Buffer.from(out.value).slice(0,10).toString('hex'));
  
  // Try all indices
  for (let i = 0; i < 20; i++) {
    const child = root.derive(0).derive(i);
    const pubkey = Buffer.from(child.publicKey);
    const p2wpkh = liquid.payments.p2wpkh({ pubkey, network: liquid.networks.liquid });
    const blindingPrivKey = crypto.createHmac('sha256', masterBlindingKey).update(p2wpkh.output!).digest();
    
    try {
      const unblinded = conf.unblindOutputWithKey(out, blindingPrivKey);
      const assetDisplay = Buffer.from(unblinded.asset).reverse().toString('hex');
      const assetInternal = Buffer.from(unblinded.asset).toString('hex');
      const assetBf = Buffer.from((unblinded as any).assetBlindingFactor).toString('hex');
      const valueBf = Buffer.from((unblinded as any).valueBlindingFactor).toString('hex');
      console.log(`\n✅ Unblinded at index ${i}:`);
      console.log('  address:', liquid.address.toConfidential(p2wpkh.address!, Buffer.from(ecc.pointFromScalar(blindingPrivKey, true)!)));
      console.log('  value:', unblinded.value);
      console.log('  asset (display):', assetDisplay);
      console.log('  asset (internal):', assetInternal);
      console.log('  asset_bf:', assetBf);
      console.log('  value_bf:', valueBf);
      
      // Verify: re-blind the asset and check commitment matches on-chain
      // assetBlindingFactor is used in secp256k1_generator_generate_blinded(asset_id_internal, abf)
      // On-chain asset commitment = 0x0a || 32bytes (generator point)
      console.log('\n  On-chain asset commitment (full):', Buffer.from(out.asset).toString('hex'));
    } catch {
      // key doesn't match
    }
  }
}

main().catch(console.error);
