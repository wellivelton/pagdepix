const VELORA_BASE_URL = (process.env.VELORA_BASE_URL || 'https://api.velora.notiffly.com.br').replace(/\/$/, '');
const VELORA_API_KEY = process.env.VELORA_API_KEY || '';
const VELORA_API_SECRET = process.env.VELORA_API_SECRET || '';

function veloraHeaders() {
  return {
    'x-api-key': VELORA_API_KEY,
    'x-api-secret': VELORA_API_SECRET,
    'Content-Type': 'application/json',
  };
}

export interface VeloraDecodeResult {
  success: boolean;
  receiverName?: string;
  receiverDocument?: string;
  originalAmount?: number;
  bankName?: string;
  error?: string;
}

export interface VeloraPayResult {
  success: boolean;
  externalId?: string;
  status?: string;
  error?: string;
}

export async function veloraDecodePixCode(pixCopyPaste: string): Promise<VeloraDecodeResult> {
  try {
    const res = await fetch(`${VELORA_BASE_URL}/withdraw/qrcode/decode`, {
      method: 'POST',
      headers: veloraHeaders(),
      body: JSON.stringify({ pixCopyPaste }),
      signal: AbortSignal.timeout(10_000),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      const errMsg = json?.message || json?.error || `HTTP ${res.status}`;
      console.error(`[VELORA] decode falhou: status=${res.status} body=`, json);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      receiverName: json?.data?.receiverName,
      receiverDocument: json?.data?.receiverDocument,
      originalAmount: json?.data?.amount ?? json?.data?.originalAmount ?? undefined,
      bankName: json?.data?.bankName,
    };
  } catch (err) {
    console.error('[VELORA] Erro ao decodificar QR Code:', err);
    return { success: false, error: 'Falha de conexão com a Velora.' };
  }
}

export interface VeloraBalanceResult {
  success: boolean;
  balance?: number;
  error?: string;
}

export async function veloraGetBalance(): Promise<VeloraBalanceResult> {
  try {
    const res = await fetch(`${VELORA_BASE_URL}/wallet/balance`, {
      headers: veloraHeaders(),
      signal: AbortSignal.timeout(6_000),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      return { success: false, error: json?.message || 'Erro ao obter saldo Velora.' };
    }
    const balance: number = json?.data?.balance ?? json?.balance ?? 0;
    return { success: true, balance };
  } catch (err) {
    console.error('[VELORA] Erro ao obter saldo:', err);
    return { success: false, error: 'Falha de conexão com a Velora.' };
  }
}

export interface VeloraPaymentStatusResult {
  success: boolean;
  rawStatus?: string;
  isPaid?: boolean;
  isFailed?: boolean;
  error?: string;
}

export async function veloraGetPaymentStatus(externalId: string): Promise<VeloraPaymentStatusResult> {
  try {
    const res = await fetch(`${VELORA_BASE_URL}/withdraw/${externalId}`, {
      headers: veloraHeaders(),
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      return { success: false, error: json?.message || 'Erro ao consultar status Velora.' };
    }
    const rawStatus: string = (json?.data?.status ?? json?.status ?? '').toUpperCase();
    const isPaid   = ['COMPLETED', 'PAID', 'SUCCESS', 'DONE', 'SETTLED'].includes(rawStatus);
    const isFailed = ['FAILED', 'REJECTED', 'CANCELLED', 'ERROR', 'EXPIRED'].includes(rawStatus);
    return { success: true, rawStatus, isPaid, isFailed };
  } catch (err) {
    console.error('[VELORA] Erro ao consultar status do pagamento:', err);
    return { success: false, error: 'Falha de conexão com a Velora.' };
  }
}

export async function veloraPayPixQrCode(
  pixCopyPaste: string,
  amount?: number,
  description?: string
): Promise<VeloraPayResult> {
  try {
    const body: Record<string, any> = { pixCopyPaste };
    if (amount != null) body.amount = amount;
    if (description) body.description = description;

    const res = await fetch(`${VELORA_BASE_URL}/withdraw/qrcode`, {
      method: 'POST',
      headers: veloraHeaders(),
      body: JSON.stringify(body),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      return { success: false, error: json?.message || 'Erro ao realizar pagamento via Velora.' };
    }

    return {
      success: true,
      externalId: json?.data?.externalId,
      status: json?.data?.status,
    };
  } catch (err) {
    console.error('[VELORA] Erro ao pagar QR Code:', err);
    return { success: false, error: 'Falha de conexão com a Velora.' };
  }
}
