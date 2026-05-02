const ASAAS_BASE_URL = process.env.ASAAS_ENV === 'sandbox'
  ? 'https://api-sandbox.asaas.com'
  : 'https://api.asaas.com';

function asaasHeaders() {
  return {
    'access_token': process.env.ASAAS_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

export function asaasIsConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

export interface AsaasRechargeResult {
  success: boolean;
  id?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED' | 'WAITING_CRITICAL_ACTION';
  operatorName?: string;
  canBeCancelled?: boolean;
  error?: string;
}

export async function asaasCreateRecharge(phoneNumber: string, value: number): Promise<AsaasRechargeResult> {
  const phone = phoneNumber.replace(/^\+55/, '').replace(/\D/g, '');
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/mobilePhoneRecharges`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: JSON.stringify({ value, phoneNumber: phone }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      const errMsg = json?.errors?.[0]?.description || `HTTP ${res.status}`;
      console.error(`[ASAAS] createRecharge falhou: ${res.status}`, json);
      return { success: false, error: errMsg };
    }
    console.log(`[ASAAS] Recarga criada: id=${json.id} status=${json.status} operadora=${json.operatorName}`);
    return { success: true, id: json.id, status: json.status, operatorName: json.operatorName, canBeCancelled: json.canBeCancelled };
  } catch (err) {
    console.error('[ASAAS] Erro ao criar recarga:', err);
    return { success: false, error: 'Falha de conexão com Asaas.' };
  }
}

export async function asaasGetRechargeStatus(asaasId: string): Promise<AsaasRechargeResult> {
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/mobilePhoneRecharges/${asaasId}`, {
      headers: asaasHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as any;
    if (!res.ok) return { success: false, error: json?.errors?.[0]?.description || `HTTP ${res.status}` };
    return { success: true, id: json.id, status: json.status, operatorName: json.operatorName, canBeCancelled: json.canBeCancelled };
  } catch (err) {
    return { success: false, error: 'Falha de conexão com Asaas.' };
  }
}

export async function asaasCancelRecharge(asaasId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/mobilePhoneRecharges/${asaasId}/cancel`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: '{}',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const json = await res.json() as any;
      return { success: false, error: json?.errors?.[0]?.description || `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Falha de conexão com Asaas.' };
  }
}

export interface AsaasBillInfo {
  value: number;
  dueDate: string | null;
  companyName: string | null;
  beneficiaryName: string | null;
  beneficiaryCpfCnpj: string | null;
  bank: string | null;
  discountValue: number;
  interestValue: number;
  fineValue: number;
  allowChangeValue: boolean;
  isOverdue: boolean;
}

export async function asaasSimulateBill(input: string): Promise<{
  success: boolean;
  bill?: AsaasBillInfo;
  error?: string;
}> {
  const digits = input.replace(/\D/g, '');
  const body = digits.length === 44
    ? { barCode: digits }
    : { identificationField: digits };
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/bill/simulate`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = await res.json() as any;
    if (!res.ok) {
      const errMsg = json?.errors?.[0]?.description || `HTTP ${res.status}`;
      console.warn(`[ASAAS] simulateBill falhou: ${res.status}`, json);
      return { success: false, error: errMsg };
    }
    // Asaas returns beneficiary fields nested inside bankSlipInfo
    const bsi = json.bankSlipInfo ?? {};
    console.log('[ASAAS] simulateBill response:', JSON.stringify(json));
    return {
      success: true,
      bill: {
        value: json.value ?? bsi.value ?? 0,
        dueDate: json.dueDate ?? bsi.dueDate ?? null,
        companyName: bsi.companyName ?? json.companyName ?? null,
        beneficiaryName: bsi.beneficiaryName ?? json.beneficiaryName ?? null,
        beneficiaryCpfCnpj: bsi.beneficiaryCpfCnpj ?? null,
        bank: bsi.bank ?? null,
        discountValue: json.discountValue ?? 0,
        interestValue: json.interestValue ?? 0,
        fineValue: json.fineValue ?? 0,
        allowChangeValue: json.allowChangeValue ?? true,
        isOverdue: json.isOverdue ?? false,
      },
    };
  } catch (err) {
    return { success: false, error: 'Falha de conexão com Asaas.' };
  }
}

export async function asaasGetProvider(phoneNumber: string): Promise<{
  success: boolean;
  name?: string;
  values?: Array<{ name: string; bonus: string; minValue: number; maxValue: number; description?: string }>;
  error?: string;
}> {
  const phone = phoneNumber.replace(/^\+55/, '').replace(/\D/g, '');
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/mobilePhoneRecharges/${phone}/provider`, {
      headers: asaasHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return { success: false, error: 'Operadora não encontrada ou número inválido.' };
    const json = await res.json() as any;
    if (!res.ok) return { success: false, error: json?.errors?.[0]?.description || `HTTP ${res.status}` };
    return { success: true, name: json.name, values: json.values };
  } catch (err) {
    return { success: false, error: 'Falha de conexão com Asaas.' };
  }
}

// ============================================================
// BOLETO — pagar via Asaas
// ============================================================

export interface AsaasBillPayResult {
  success: boolean;
  id?: string;
  status?: string;
  transactionReceiptUrl?: string;
  error?: string;
}

export async function asaasPayBill(
  barCodeOrIdentification: string,
  value?: number,
  description?: string,
): Promise<AsaasBillPayResult> {
  const digits = barCodeOrIdentification.replace(/\D/g, '');
  const body: Record<string, any> = digits.length === 44
    ? { barCode: digits }
    : { identificationField: digits };
  if (value != null) body.value = value;
  if (description) body.description = description;

  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/bill`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      const errMsg = json?.errors?.[0]?.description || json?.message || `HTTP ${res.status}`;
      console.error(`[ASAAS] payBill falhou: status=${res.status} body=`, json);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      id: json?.id,
      status: json?.status,
      transactionReceiptUrl: json?.transactionReceiptUrl,
    };
  } catch (err) {
    console.error('[ASAAS] Erro ao pagar boleto:', err);
    return { success: false, error: 'Falha de conexão com a Asaas.' };
  }
}

// ============================================================
// PIX COPIA E COLA — decode, pay, status
// ============================================================

export interface AsaasPixDecodeResult {
  success: boolean;
  receiverName?: string;
  receiverDocument?: string;
  originalAmount?: number;
  bankName?: string;
  error?: string;
}

export interface AsaasPixPayResult {
  success: boolean;
  externalId?: string;
  status?: string;
  error?: string;
}

export interface AsaasPixStatusResult {
  success: boolean;
  rawStatus?: string;
  isPaid?: boolean;
  isFailed?: boolean;
  error?: string;
}

export async function asaasDecodePixCode(pixCopyPaste: string): Promise<AsaasPixDecodeResult> {
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/pix/qrCodes/decode`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: JSON.stringify({ payload: pixCopyPaste }),
      signal: AbortSignal.timeout(10_000),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      const errMsg = json?.errors?.[0]?.description || json?.message || `HTTP ${res.status}`;
      console.error(`[ASAAS] decode falhou: status=${res.status} body=`, json);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      receiverName: json?.transactionOriginatorName ?? json?.receiverName,
      receiverDocument: json?.cpfCnpj ?? json?.receiverDocument,
      originalAmount: json?.value ?? json?.originalAmount,
      bankName: json?.bankName,
    };
  } catch (err) {
    console.error('[ASAAS] Erro ao decodificar QR Code Pix:', err);
    return { success: false, error: 'Falha de conexão com a Asaas.' };
  }
}

export async function asaasPayPixQrCode(
  pixCopyPaste: string,
  value: number,
  description?: string,
): Promise<AsaasPixPayResult> {
  try {
    const body: Record<string, any> = { qrCode: { payload: pixCopyPaste }, value };
    if (description) body.description = description;

    const res = await fetch(`${ASAAS_BASE_URL}/v3/pix/qrCodes/pay`, {
      method: 'POST',
      headers: asaasHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      const errMsg = json?.errors?.[0]?.description || json?.message || `HTTP ${res.status}`;
      console.error(`[ASAAS] pay falhou: status=${res.status} body=`, json);
      return { success: false, error: errMsg };
    }

    return {
      success: true,
      externalId: json?.id,
      status: json?.status,
    };
  } catch (err) {
    console.error('[ASAAS] Erro ao pagar QR Code Pix:', err);
    return { success: false, error: 'Falha de conexão com a Asaas.' };
  }
}

export async function asaasGetPixTransaction(id: string): Promise<AsaasPixStatusResult> {
  try {
    const res = await fetch(`${ASAAS_BASE_URL}/v3/pix/transactions/${id}`, {
      headers: asaasHeaders(),
      signal: AbortSignal.timeout(8_000),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      return { success: false, error: json?.errors?.[0]?.description || 'Erro ao consultar transação Asaas.' };
    }

    const rawStatus: string = (json?.status ?? '').toUpperCase();
    const isPaid   = ['DONE', 'CONFIRMED', 'RECEIVED', 'COMPLETED', 'PAID'].includes(rawStatus);
    const isFailed = ['FAILED', 'CANCELLED', 'REJECTED', 'ERROR', 'EXPIRED'].includes(rawStatus);

    return { success: true, rawStatus, isPaid, isFailed };
  } catch (err) {
    console.error('[ASAAS] Erro ao consultar transação Pix:', err);
    return { success: false, error: 'Falha de conexão com a Asaas.' };
  }
}
