/**
 * Cliente Swapverse para o bot — porta direta do backend TypeScript.
 */
const SWAPVERSE_API_URL = (process.env.SWAPVERSE_API_URL || '').replace(/\/$/, '');
const SWAPVERSE_ACCESS_TOKEN = process.env.SWAPVERSE_ACCESS_TOKEN || '';

async function generateDepixQr({ amount, depixWalletAddress, feePercent = '2.0', delayHours = 24, webhookUrl }) {
  if (!SWAPVERSE_ACCESS_TOKEN || !SWAPVERSE_API_URL) {
    return { success: false, error: 'Integração Swapverse não configurada.' };
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum < 5) {
    return { success: false, error: 'Valor mínimo é R$ 5,00.' };
  }

  const wallet = (depixWalletAddress || '').trim();
  if (!wallet || wallet.length < 20) {
    return { success: false, error: 'Endereço de carteira Liquid inválido.' };
  }

  const body = {
    amount: amountNum.toFixed(2),
    depix_wallet_address: wallet,
    fee: String(feePercent),
    delay_hours: delayHours,
  };
  if (webhookUrl) body.webhook_url = webhookUrl;

  try {
    const res = await fetch(`${SWAPVERSE_API_URL}/api/v1/depix/generate-qr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SWAPVERSE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const raw = data?.message || data?.error || `SwapVerse retornou ${res.status}`;
      const msg = (res.status === 500 && raw?.includes('Server Error'))
        ? 'Erro na API Swapverse. Verifique o endereço da carteira Liquid e tente novamente.'
        : raw;
      console.error('[Swapverse] generate-qr falhou:', res.status, raw);
      return { success: false, error: msg };
    }

    return { success: true, order: data };
  } catch (e) {
    const msg = e?.cause?.message || e?.message || 'Erro ao conectar com Swapverse.';
    console.error('[Swapverse] generate-qr error:', msg);
    return { success: false, error: msg };
  }
}

async function getDepixOrderStatus(orderId) {
  if (!SWAPVERSE_ACCESS_TOKEN || !SWAPVERSE_API_URL) {
    return { success: false, error: 'Integração Swapverse não configurada.' };
  }

  try {
    const res = await fetch(
      `${SWAPVERSE_API_URL}/api/v1/depix/${encodeURIComponent(orderId.trim())}/status`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SWAPVERSE_ACCESS_TOKEN}`,
          'Accept': 'application/json',
        },
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.message || data?.error || `Status ${res.status}` };
    }
    return { success: true, order: data };
  } catch (e) {
    console.error('[Swapverse] status error:', e?.message);
    return { success: false, error: e?.message || 'Erro ao consultar status.' };
  }
}

module.exports = { generateDepixQr, getDepixOrderStatus };
