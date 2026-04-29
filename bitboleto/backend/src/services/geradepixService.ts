/**
 * Serviço de integração com a API GeraDePix (@geradepixbot).
 * Documentação: https://telegra.ph/DOCUMENTA%C3%87%C3%83O-API-geradepixbot-03-02
 *
 * Funcionalidades: criar saques Depix→Pix, consultar status.
 */

const GERADEPIX_BASE = 'https://imdstv.xyz/geradepix/api/v1';
/** API alternativa (geradepix.fyi) com endpoint de refresh para buscar comprovante. */
const GERADEPIX_REFRESH_BASE = 'https://geradepix.fyi/api/v1';

export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

export interface CreateWithdrawalParams {
  amount: number; // Valor em R$
  pixKey: string;
  pixKeyType?: PixKeyType;
  reference?: string;
  description?: string;
  webhookUrl?: string;
}

/** Formato exato do valor DePix (8 decimais) - Eulen exige envio exato, sem arredondamento. */
export const DEPIX_DECIMAL_PLACES = 8;

export interface CreateWithdrawalResult {
  success: boolean;
  withdrawal?: {
    withdrawal_id: string;
    amount: number;
    pix_key: string;
    status: string;
    deposit_address: string;
    /** Quantidade DePix a enviar - usar valor exato retornado pela API, sem arredondar */
    deposit_amount: number;
    expiration: string;
    reference?: string;
    created_at: string;
  };
  error?: string;
}

/** Formata o valor DePix exatamente como retornado pela API, preservando até 8 decimais. */
export function formatDepositAmountExact(amount: number): string {
  return Number(amount).toFixed(DEPIX_DECIMAL_PLACES);
}

export interface GetWithdrawalResult {
  success: boolean;
  withdrawal?: {
    withdrawal_id: string;
    amount: number;
    pix_key: string;
    status: string;
    reference?: string;
    created_at: string;
    completed_at?: string;
    receipt_url?: string;
    blockchain_tx_id?: string;
  };
  error?: string;
}

function getApiKey(): string {
  const key = process.env.GERADEPIX_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('GERADEPIX_API_KEY não configurada. Adicione no .env');
  }
  return key.trim();
}

/**
 * Cria um saque Depix→Pix na API GeraDePix.
 * Retorna o endereço para enviar Depix e a quantidade.
 */
export async function createWithdrawal(params: CreateWithdrawalParams): Promise<CreateWithdrawalResult> {
  const apiKey = getApiKey();

  const kt = params.pixKeyType || inferPixKeyType(params.pixKey);
  const pk = (kt === 'cpf' || kt === 'cnpj') ? params.pixKey.replace(/\D/g, '') : params.pixKey.trim();

  const body = {
    amount: params.amount,
    pix_key: pk,
    pix_key_type: kt,
    reference: params.reference || undefined,
    description: params.description || undefined,
    webhook_url: params.webhookUrl || undefined,
  };

  const res = await fetch(`${GERADEPIX_BASE}/withdrawals.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { success?: boolean; withdrawal?: CreateWithdrawalResult['withdrawal']; error?: string };

  if (!res.ok) {
    return {
      success: false,
      error: data?.error || `HTTP ${res.status}`,
    };
  }

  if (!data.success || !data.withdrawal) {
    return {
      success: false,
      error: data?.error || 'Resposta inválida da API GeraDePix',
    };
  }

  return {
    success: true,
    withdrawal: data.withdrawal,
  };
}

/**
 * Consulta o status de um saque.
 */
export async function getWithdrawalStatus(withdrawalId: string): Promise<GetWithdrawalResult> {
  const apiKey = getApiKey();

  const res = await fetch(
    `${GERADEPIX_BASE}/withdrawals_get.php?withdrawal_id=${encodeURIComponent(withdrawalId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const data = (await res.json()) as { success?: boolean; withdrawal?: GetWithdrawalResult['withdrawal']; error?: string };

  if (!res.ok) {
    return {
      success: false,
      error: data?.error || `HTTP ${res.status}`,
    };
  }

  if (!data.success || !data.withdrawal) {
    return {
      success: false,
      error: data?.error || 'Saque não encontrado',
    };
  }

  return {
    success: true,
    withdrawal: data.withdrawal,
  };
}

/** Resposta do POST /withdrawals/refresh (geradepix.fyi) — atualizar status e buscar comprovante. */
export interface RefreshWithdrawalResult {
  success: boolean;
  withdrawal?: {
    withdrawal_id?: string;
    status?: string;
    receipt_url?: string;
    receiptUrl?: string;
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * Atualiza o status do saque e busca o comprovante (PDF) na API geradepix.fyi.
 * Endpoint: POST /withdrawals/refresh — use quando o GET não retornar receipt_url.
 */
export async function refreshWithdrawalReceipt(withdrawalId: string): Promise<RefreshWithdrawalResult> {
  const apiKey = getApiKey();

  const res = await fetch(`${GERADEPIX_REFRESH_BASE}/withdrawals/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ withdrawal_id: withdrawalId }),
  });

  const data = (await res.json()) as { success?: boolean; withdrawal?: RefreshWithdrawalResult['withdrawal']; error?: string };

  if (!res.ok) {
    return {
      success: false,
      error: data?.error || `HTTP ${res.status}`,
    };
  }

  if (!data.success) {
    return {
      success: false,
      error: data?.error || 'Resposta inválida',
    };
  }

  return {
    success: true,
    withdrawal: data.withdrawal,
  };
}

/**
 * Infere o tipo da chave PIX pelo formato.
 */
function inferPixKeyType(pixKey: string): PixKeyType {
  const cleaned = pixKey.replace(/\D/g, '');
  if (cleaned.length === 11) return 'cpf';
  if (cleaned.length === 14) return 'cnpj';
  if (pixKey.includes('@')) return 'email';
  if (/^\+?\d{10,13}$/.test(cleaned)) return 'phone';
  return 'random';
}
