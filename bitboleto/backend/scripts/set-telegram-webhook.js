/**
 * Configura o webhook do bot do Telegram para a URL da API.
 * Assim o backend recebe os updates (ex.: /start) e envia o código de verificação.
 *
 * Uso (na pasta backend):
 *   node scripts/set-telegram-webhook.js
 *
 * Variáveis no .env:
 *   TELEGRAM_BOT_TOKEN   - obrigatório
 *   APP_URL              - base da API (ex: https://www.pagdepix.com) para montar .../api/webhook/telegram
 *   TELEGRAM_WEBHOOK_SECRET - opcional; se definido, envia como secret_token no setWebhook
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token) {
  console.error('❌ Defina TELEGRAM_BOT_TOKEN no .env do backend.');
  process.exit(1);
}

if (!appUrl) {
  console.error('❌ Defina APP_URL no .env (ex: https://www.pagdepix.com).');
  process.exit(1);
}

const webhookUrl = `${appUrl}/api/webhook/telegram`;

async function main() {
  const url = new URL('https://api.telegram.org/bot' + token + '/setWebhook');
  url.searchParams.set('url', webhookUrl);
  if (secret) url.searchParams.set('secret_token', secret);

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json().catch(() => ({}));

  if (!data.ok) {
    console.error('❌ Erro ao configurar webhook:', data.description || res.statusText);
    process.exit(1);
  }

  console.log('✅ Webhook configurado:', webhookUrl);
  if (secret) console.log('   secret_token enviado ao Telegram.');
}

main();
