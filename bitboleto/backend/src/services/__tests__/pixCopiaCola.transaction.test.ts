import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock objects (hoisted so vi.mock factories can reference them) ──────

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx: Record<string, any> = {
    pixCopiaCola:        { updateMany: vi.fn(), create: vi.fn() },
    user:                { update: vi.fn(), findUnique: vi.fn() },
    referralEarning:     { create: vi.fn() },
    affiliateTransaction:{ findFirst: vi.fn(), create: vi.fn() },
    affiliate:           { update: vi.fn() },
    coupon:              { update: vi.fn() },
    couponUsage:         { create: vi.fn() },
    $queryRaw:           vi.fn(),
  };

  const mockPrisma: Record<string, any> = {
    $transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTx)),
    pixCopiaCola: { findUnique: vi.fn(), count: vi.fn() },
    user:         { findUnique: vi.fn() },
    coupon:       { findUnique: vi.fn() },
    config:       { findUnique: vi.fn() },
  };

  return { mockTx, mockPrisma };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));

vi.mock('../telegram.service', () => ({
  notifyAdmin:         vi.fn().mockResolvedValue(undefined),
  notifyUserByTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../push.service', () => ({
  sendNotification:         vi.fn().mockResolvedValue(undefined),
  notifyAffiliateCommission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webhookService', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../velora.service', () => ({
  veloraDecodePixCode:  vi.fn().mockResolvedValue({ success: true, originalAmount: null }),
  veloraPayPixQrCode:   vi.fn(),
}));

vi.mock('../liquidHdWallet.service', () => ({
  getNextAddressIndex:  vi.fn(),
  deriveLiquidAddress:  vi.fn().mockReturnValue('liquid_addr_mock'),
  isXpubConfigured:     vi.fn().mockReturnValue(false),
  AUTO_MODE_CURRENCIES: new Set<string>(['DEPIX']),
}));

vi.mock('../../utils/antifraud', () => ({
  validateCouponUsage: vi.fn().mockResolvedValue({ valid: true }),
  isUserVerified:      vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/taxConfig', () => ({
  calculatePixCopiaColaFee: vi.fn().mockReturnValue({
    taxa: 0.03, taxaFixa: 1, taxaVariavel: 0.02, valorTaxa: 3, totalFinal: 97,
  }),
  MIN_PIX_COPIA_COLA_AMOUNT: 20,
  REFERRAL_RATE: 0.20,
}));

vi.mock('../exchangeRate', () => ({
  getRates:          vi.fn().mockResolvedValue({ usdBrl: 5.0, btcBrl: 300000 }),
  convertBrlToUsdt:  vi.fn().mockReturnValue(10),
  convertBrlToSats:  vi.fn().mockReturnValue(100000),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_RECORD = {
  id: 'pcc-001',
  userId: 'user-001',
  status: 'TXID_SUBMITTED',
  totalFinal: 97,
  valorTaxa: 3,
  valorOriginal: 100,
  nomeDestinatario: 'Fulano',
  cupomId: null as string | null,
  affiliateId: null as string | null,
  apiKeyId: null,
  cupomUsado: null,
  paymentCurrency: 'DEPIX',
  txid: 'abc123',
  externalRef: null,
  user: { id: 'user-001', email: 'user@test.com', telegram: '@user', telegramChatId: null },
};

function setupApproveHappyPath(overrides: Partial<typeof BASE_RECORD> = {}) {
  const record = { ...BASE_RECORD, ...overrides };
  // initial findUnique
  mockPrisma.pixCopiaCola.findUnique.mockResolvedValueOnce(record);
  // atomic claim succeeds
  mockTx.pixCopiaCola.updateMany.mockResolvedValueOnce({ count: 1 });
  // user.update totalPaid
  mockTx.user.update.mockResolvedValueOnce({});
  // referral owner: no referredByCode
  mockTx.user.findUnique.mockResolvedValueOnce(null);
  // re-fetch after tx
  mockPrisma.pixCopiaCola.findUnique.mockResolvedValueOnce({ ...record, status: 'APPROVED' });
}

beforeEach(() => {
  vi.clearAllMocks();
  // restore $transaction default (execute callback)
  mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));
});

// ─── adminProcessPixCopiaCola tests ──────────────────────────────────────────

describe('adminProcessPixCopiaCola — double-approval guard', () => {
  it('returns error when concurrent call already claimed the slot (count=0)', async () => {
    mockPrisma.pixCopiaCola.findUnique.mockResolvedValueOnce(BASE_RECORD);
    mockTx.pixCopiaCola.updateMany.mockResolvedValueOnce({ count: 0 });

    const { adminProcessPixCopiaCola } = await import('../pixCopiaCola');
    const result = await adminProcessPixCopiaCola('pcc-001', 'APPROVED');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Pedido já foi processado.');
  });
});

describe('adminProcessPixCopiaCola — ASAAS_PROCESSING allowed', () => {
  it('does not reject ASAAS_PROCESSING status (was missing from allowed list)', async () => {
    setupApproveHappyPath({ status: 'ASAAS_PROCESSING' });

    const { adminProcessPixCopiaCola } = await import('../pixCopiaCola');
    const result = await adminProcessPixCopiaCola('pcc-001', 'APPROVED');

    // Must NOT get the "Só é possível processar" rejection
    expect(result.error).not.toBe('Só é possível processar solicitações com TXID informado.');
    expect(result.success).toBe(true);
    // updateMany WHERE must include ASAAS_PROCESSING
    expect(mockTx.pixCopiaCola.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.arrayContaining(['ASAAS_PROCESSING']) }),
        }),
      })
    );
  });
});

describe('adminProcessPixCopiaCola — Bug B: coupon usageCount outside affiliateId block', () => {
  it('increments usageCount even when affiliateId is null', async () => {
    const COUPON_ID = 'cup-bugB';
    setupApproveHappyPath({ cupomId: COUPON_ID, affiliateId: null });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { adminProcessPixCopiaCola } = await import('../pixCopiaCola');
    await adminProcessPixCopiaCola('pcc-001', 'APPROVED');

    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COUPON_ID },
        data:  { usageCount: { increment: 1 } },
      })
    );
  });
});

describe('adminProcessPixCopiaCola — Bug A: CouponUsage created for PCC', () => {
  it('creates CouponUsage with pixCopiaColaId on approval', async () => {
    const COUPON_ID = 'cup-bugA';
    const PCC_ID    = 'pcc-001';
    setupApproveHappyPath({ id: PCC_ID, cupomId: COUPON_ID, affiliateId: null });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { adminProcessPixCopiaCola } = await import('../pixCopiaCola');
    await adminProcessPixCopiaCola(PCC_ID, 'APPROVED');

    expect(mockTx.couponUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId:       COUPON_ID,
          userId:         'user-001',
          pixCopiaColaId: PCC_ID,
        }),
      })
    );
  });
});

describe('adminProcessPixCopiaCola — Bug C: errors propagate (no silent catch)', () => {
  it('rethrows errors thrown inside the transaction callback', async () => {
    mockPrisma.pixCopiaCola.findUnique.mockResolvedValueOnce(BASE_RECORD);
    mockTx.pixCopiaCola.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockRejectedValueOnce(new Error('DB_CRASH'));

    const { adminProcessPixCopiaCola } = await import('../pixCopiaCola');

    await expect(adminProcessPixCopiaCola('pcc-001', 'APPROVED')).rejects.toThrow('DB_CRASH');
  });
});

// ─── createPixCopiaCola tests ─────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-001', name: 'Test User', email: 'u@test.com', telegram: '@u',
  isBlocked: false, isActive: true, referralCode: 'REF1', referredByCode: null,
};

const BASE_COUPON = {
  id: 'cup-001', code: 'SAVE10', discount: 0.10, isActive: true,
  usageCount: 0, maxUsage: 10, affiliateId: null,
  affiliate: null,
};

const BASE_CREATE_INPUT = {
  userId:           'user-001',
  codigoPix:        'pix_code_abc',
  valorOriginal:    100,
  nomeDestinatario: 'Destinatário',
  contatoTelegram:  '@telegram',
  couponCode:       'SAVE10',
};

function setupCreateHappyPath() {
  mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
  mockPrisma.pixCopiaCola.count.mockResolvedValue(0);
  mockPrisma.coupon.findUnique.mockResolvedValue(BASE_COUPON);
  mockPrisma.config.findUnique.mockResolvedValue({
    walletAddress: 'addr_main', walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10,
  });
}

describe('createPixCopiaCola — coupon race protection', () => {
  it('returns error when FOR UPDATE reveals coupon exhausted at tx time', async () => {
    setupCreateHappyPath();
    // $queryRaw inside transaction: coupon is now at maxUsage
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 10, maxUsage: 10, isActive: true },
    ]);

    const { createPixCopiaCola } = await import('../pixCopiaCola');
    const result = await createPixCopiaCola(BASE_CREATE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/esgotado/i);
  });

  it('returns error when FOR UPDATE reveals coupon deactivated at tx time', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: false },
    ]);

    const { createPixCopiaCola } = await import('../pixCopiaCola');
    const result = await createPixCopiaCola(BASE_CREATE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/inativo/i);
  });
});

describe('createPixCopiaCola — liquidAddressIndex P2002 retry', () => {
  it('retries with a new index when first attempt collides on liquidAddressIndex', async () => {
    const { getNextAddressIndex, deriveLiquidAddress, isXpubConfigured, AUTO_MODE_CURRENCIES } =
      await import('../liquidHdWallet.service');

    vi.mocked(isXpubConfigured).mockReturnValue(true);
    // AUTO_MODE_CURRENCIES already contains 'DEPIX' from the mock
    vi.mocked(getNextAddressIndex)
      .mockResolvedValueOnce(1)   // first attempt
      .mockResolvedValueOnce(2);  // retry after P2002
    vi.mocked(deriveLiquidAddress)
      .mockReturnValueOnce('addr_1')
      .mockReturnValueOnce('addr_2');

    setupCreateHappyPath();

    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const createdRecord = { ...BASE_RECORD, liquidAddressIndex: 2, walletAddress: 'addr_2' };

    // First attempt: $transaction throws P2002 WITHOUT calling the callback.
    // Second attempt: callback executes normally.
    mockPrisma.$transaction
      .mockImplementationOnce(async (_cb: Function) => { throw p2002; })
      .mockImplementationOnce(async (cb: Function) => cb(mockTx));

    // Persistent mocks for the second attempt's callback (coupon FOR UPDATE + create).
    mockTx.$queryRaw.mockResolvedValue([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: true },
    ]);
    mockTx.pixCopiaCola.create.mockResolvedValue(createdRecord);

    const { createPixCopiaCola } = await import('../pixCopiaCola');
    const result = await createPixCopiaCola(BASE_CREATE_INPUT);

    expect(result.success).toBe(true);
    // getNextAddressIndex must have been called twice (initial + retry)
    expect(getNextAddressIndex).toHaveBeenCalledTimes(2);
  });
});
