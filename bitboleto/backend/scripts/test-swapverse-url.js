/**
 * Testa se a URL base da SwapVerse está correta e se a API responde.
 * Rodar na pasta backend: node scripts/test-swapverse-url.js
 * Usa o .env da pasta backend (SWAPVERSE_API_URL, SWAPVERSE_ACCESS_TOKEN).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const BASE = (process.env.SWAPVERSE_API_URL || '').replace(/\/$/, '');
const TOKEN = process.env.SWAPVERSE_ACCESS_TOKEN || '';

async function test(url, options = {}) {
  try {
    const res = await fetch(url, { method: options.method || 'GET', ...options });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, error: e.message, cause: e.cause?.message };
  }
}

async function main() {
  console.log('=== Teste SwapVerse URL ===\n');
  console.log('SWAPVERSE_API_URL:', BASE || '(vazio)');
  console.log('SWAPVERSE_ACCESS_TOKEN:', TOKEN ? `${TOKEN.slice(0, 8)}...` : '(vazio)');
  console.log('');

  if (!BASE) {
    console.log('❌ Defina SWAPVERSE_API_URL no .env');
    process.exit(1);
  }

  // 1) GET na base (ver se o host existe)
  console.log('1) GET', BASE);
  const r1 = await test(BASE);
  if (r1.error) {
    console.log('   ❌ Erro:', r1.error, r1.cause ? `(${r1.cause})` : '');
  } else {
    console.log('   Status:', r1.status, r1.ok ? 'OK' : '');
    if (typeof r1.body === 'string') console.log('   Body (trecho):', r1.body);
  }
  console.log('');

  // 2) POST generate-qr (endpoint que usamos)
  // Use um endereço Liquid real para teste; endereço fake pode gerar 500 na SwapVerse
  const testWallet = process.env.SWAPVERSE_TEST_WALLET || 'VJLqtBkM1HjvjWjvjWjvjWjvjWjvjWjvjWj';
  const urlQr = `${BASE}/api/v1/depix/generate-qr`;
  console.log('2) POST', urlQr);
  console.log('   (carteira de teste:', testWallet.length, 'caracteres; defina SWAPVERSE_TEST_WALLET no .env para usar endereço real)');
  const r2 = await test(urlQr, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      amount: '5.00',
      depix_wallet_address: testWallet,
      fee: '0.2',
    }),
  });
  if (r2.error) {
    console.log('   ❌ Erro de rede:', r2.error, r2.cause ? `(${r2.cause})` : '');
  } else {
    console.log('   Status:', r2.status);
    console.log('   Body:', JSON.stringify(r2.body, null, 2));
    if (r2.status === 404) console.log('   → URL do endpoint pode estar errada (ex.: usar api.swapverse.org em vez de swapverse.org)');
    if (r2.status === 401) console.log('   → Token inválido ou expirado');
    if (r2.status === 500) console.log('   → Pode ser endereço de carteira inválido no teste. Teste no app com sua carteira real ou defina SWAPVERSE_TEST_WALLET no .env.');
  }
  console.log('');

  // 3) Se quiser testar api.swapverse.org
  if (BASE.includes('swapverse.org') && !BASE.includes('api.')) {
    const altBase = 'https://api.swapverse.org';
    console.log('3) Teste alternativo GET', altBase);
    const r3 = await test(altBase);
    if (r3.error) console.log('   Erro:', r3.error);
    else console.log('   Status:', r3.status);
  }

  console.log('\n=== Fim do teste ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
