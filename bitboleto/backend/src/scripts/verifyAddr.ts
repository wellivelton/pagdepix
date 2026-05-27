import '../loadEnv';
import { deriveLiquidAddress } from '../services/liquidHdWallet.service';

const TARGET = 'lq1qqgnscwzqtdcm8h5xv20ct3lgtnl4zw30lsj43ze8483ugm0tv4u9yqhxasf8ugdwzjy7emtzgq4ajfn5uleaxypg9tz25pxux';
const xpub     = process.env.LIQUID_XPUB || '';
const blindKey = process.env.LIQUID_MASTER_BLINDING_KEY || '';

if (!xpub || !blindKey) { console.error('LIQUID_XPUB ou LIQUID_MASTER_BLINDING_KEY nao configurados'); process.exit(1); }

for (let i = 0; i <= 50; i++) {
  const addr = deriveLiquidAddress(xpub, blindKey, i);
  if (addr === TARGET) {
    console.log(`MATCH: indice=${i}   ${addr}`);
    process.exit(0);
  }
}
console.log('NAO ENCONTRADO no range 0-50');
