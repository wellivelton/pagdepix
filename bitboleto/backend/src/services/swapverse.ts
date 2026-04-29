
const SWAPVERSE_API_URL = (process.env.SWAPVERSE_API_URL || '').replace(/\/$/, '');
const SWAPVERSE_ACCESS_TOKEN = process.env.SWAPVERSE_ACCESS_TOKEN || '';
/** Taxa fixa em R$ aplicada em toda compra DePix (backend). */
export const DEPIX_FIXED_FEE = Math.max(0, parseFloat(process.env.DEPIX_FIXED_FEE || '0.99') || 0.99);
/** Taxa do PagDepix em % em cima do valor (ex: 2 = 2%). SwapVerse cobra 0,2%; o resto é margem (20% user, 20% afiliado, 60% plataforma). */
export const PAGDEPIX_FEE_PERCENT = Math.max(0, parseFloat(process.env.SWAPVERSE_PAGDEPIX_FEE_PERCENT || '0') || 0);
export const SWAPVERSE_FEE_PERCENT = 0.2;
/** Margem nossa (total - SwapVerse). Até 20% pode ir como desconto ao usuário (cupom), 20% ao afiliado. */
export const DEPIX_MARGIN_PERCENT = Math.max(0, PAGDEPIX_FEE_PERCENT - SWAPVERSE_FEE_PERCENT);

export interface SwapVerseGeneratePayload {
  amount: string;                 // >= 5.00
  depix_wallet_address: string;    // endereço Liquid do USUÁRIO onde receberá o DePix
  payer_name?: string;
  payer_tax_number?: string;
  fee?: string;                   // >= 0.2
  /** Atraso do envio do Depix em horas. Mín: 24, Máx: 720. Ex: 24 = liquidação D+1 */
  delay_hours?: number;
}

export interface SwapVerseOrder {
  id: string;
  status: string;
  deposit_id: string;
  qr_image_url: string;
  qr_copy_paste: string;
  blockchain_tx_hash: string | null;
  bank_tx_hash: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  amount?: string;
}

export type GenerateDepixQrResult =
  | { success: false; error: string }
  | { success: true; order: SwapVerseOrder; totalToPay: number; pagdepixFeePercent?: number };

export async function generateDepixQr(payload: SwapVerseGeneratePayload): Promise<GenerateDepixQrResult> {
  if (!SWAPVERSE_ACCESS_TOKEN) {
    return { success: false, error: 'Integração SwapVerse não configurada. Defina SWAPVERSE_ACCESS_TOKEN no servidor.' };
  }
  if (!SWAPVERSE_API_URL) {
    return { success: false, error: 'Integração SwapVerse não configurada. Defina SWAPVERSE_API_URL no servidor.' };
  }

  const amount = typeof payload.amount === 'string' ? payload.amount.trim() : String(payload.amount || '');
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum < 5) {
    return { success: false, error: 'Valor mínimo é R$ 5,00.' };
  }

  // Valor já vem calculado pela rota (total a pagar pelo usuário)
  const totalAmountNum = Math.round(amountNum * 100) / 100;
  const totalAmountStr = totalAmountNum.toFixed(2);

  const fee = (payload.fee != null && payload.fee !== '') ? String(payload.fee).trim() : '0.2';
  const feeNum = parseFloat(fee);
  if (isNaN(feeNum) || feeNum < 0.2) {
    return { success: false, error: 'Taxa mínima é 0.2.' };
  }

  const depixWalletAddress = (payload.depix_wallet_address && typeof payload.depix_wallet_address === 'string')
    ? payload.depix_wallet_address.trim()
    : '';
  if (!depixWalletAddress || depixWalletAddress.length < 20) {
    return { success: false, error: 'Informe o endereço da sua carteira Liquid onde deseja receber o DePix.' };
  }

  const body: Record<string, string | number> = {
    amount: totalAmountStr,
    depix_wallet_address: depixWalletAddress,
    fee,
  };
  if (payload.payer_name) body.payer_name = String(payload.payer_name).trim();
  if (payload.payer_tax_number) body.payer_tax_number = String(payload.payer_tax_number).replace(/\D/g, '');
  if (payload.delay_hours != null) {
    const dh = Number(payload.delay_hours);
    if (!isNaN(dh) && dh >= 24 && dh <= 720) {
      body.delay_hours = Math.floor(dh);
    }
  }

  const url = `${SWAPVERSE_API_URL}/api/v1/depix/generate-qr`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SWAPVERSE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      const raw = data?.message || data?.error || `SwapVerse retornou ${res.status}`;
      const msg = res.status === 500 && (raw === 'Server Error' || raw?.includes('Server Error'))
        ? 'A API da SwapVerse está retornando erro. Verifique se o endereço da carteira Liquid está correto e tente de novo. Se persistir, entre em contato com o suporte da SwapVerse.'
        : raw;
      console.error('[SwapVerse] generate-qr falhou:', res.status, url, raw);
      return { success: false, error: msg };
    }
    return {
      success: true,
      order: data as SwapVerseOrder,
      totalToPay: totalAmountNum,
      pagdepixFeePercent: PAGDEPIX_FEE_PERCENT > 0 ? PAGDEPIX_FEE_PERCENT : undefined,
    };
  } catch (e) {
    const err = e as Error & { cause?: Error };
    const detail = err?.cause?.message || err?.message || 'Erro ao comunicar com SwapVerse.';
    const msg = err?.message === 'fetch failed' ? `Não foi possível conectar à SwapVerse. Verifique a URL (${SWAPVERSE_API_URL}) e a rede. Detalhe: ${detail}` : (err?.message || detail);
    console.error('[SwapVerse] generate-qr error:', url, err?.message, err?.cause || '');
    return { success: false, error: msg };
  }
}

export async function getDepixOrderStatus(orderId: string): Promise<{ success: boolean; error?: string; order?: SwapVerseOrder }> {
  if (!SWAPVERSE_ACCESS_TOKEN) {
    return { success: false, error: 'Integração SwapVerse não configurada.' };
  }
  if (!SWAPVERSE_API_URL) {
    return { success: false, error: 'Integração SwapVerse não configurada.' };
  }
  if (!orderId || orderId.trim() === '') {
    return { success: false, error: 'ID do pedido é obrigatório.' };
  }

  try {
    const res = await fetch(`${SWAPVERSE_API_URL}/api/v1/depix/${encodeURIComponent(orderId.trim())}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SWAPVERSE_ACCESS_TOKEN}`,
        'Accept': 'application/json',
      },
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    if (!res.ok) {
      const msg = data?.message || data?.error || `SwapVerse retornou ${res.status}`;
      return { success: false, error: msg };
    }
    return { success: true, order: data as SwapVerseOrder };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao comunicar com SwapVerse.';
    console.error('[SwapVerse] status error:', e);
    return { success: false, error: msg };
  }
}

/** Lista transações DePix (nível parceiro). Uso: admin. */
export async function getDepixTransactions(): Promise<{ success: boolean; error?: string; transactions?: unknown[] }> {
  if (!SWAPVERSE_ACCESS_TOKEN) {
    return { success: false, error: 'Integração SwapVerse não configurada.' };
  }
  if (!SWAPVERSE_API_URL) {
    return { success: false, error: 'Integração SwapVerse não configurada.' };
  }
  try {
    const res = await fetch(`${SWAPVERSE_API_URL}/api/v1/depix/transactions`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SWAPVERSE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string; data?: unknown; transactions?: unknown[] };
    if (!res.ok) {
      const msg = data?.message || data?.error || `SwapVerse retornou ${res.status}`;
      return { success: false, error: msg };
    }
    const list = Array.isArray(data) ? data : (data?.data ?? data?.transactions ?? []) as unknown[];
    return { success: true, transactions: list };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao comunicar com SwapVerse.';
    console.error('[SwapVerse] transactions error:', e);
    return { success: false, error: msg };
  }
}
