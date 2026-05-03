import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock objects ───────────────────────────────────────────────────────

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx: Record<string, any> = {
    boletoBatch: { create: vi.fn() },
    boleto:      { create: vi.fn() },
    coupon:      { update: vi.fn() },
    couponUsage: { create: vi.fn() },
    $queryRaw:   vi.fn(),
  };

  const mockPrisma: Record<string, any> = {
    $transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTx)),
    user:         { findUnique: vi.fn() },
    coupon:       { findUnique: vi.fn() },
    config:       { findUnique: vi.fn() },
    log:          { create: vi.fn().mockResolvedValue({}) },
  };

  return { mockTx, mockPrisma };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));

vi.mock('../../utils/antifraud', () => ({
  isUserVerified:           vi.fn().mockResolvedValue(true),
  validateCouponUsage:      vi.fn().mockResolvedValue({ valid: true }),
  calculateEstimatedProfit: vi.fn().mockReturnValue({ isValid: true, profit: 2.00 }),
}));

vi.mock('../../utils/taxConfig', () => ({
  REFERRAL_RATE:                   0.20,
  MIN_BOLETO_AMOUNT:               20,
  calculateTax:                    vi.fn().mockReturnValue({
    isValid: true, taxAmount: 5.00, totalAmount: 105, totalAmountExact: 105, percentage: 0.05, fixedFee: 0,
  }),
  getTaxRule:                      vi.fn().mockReturnValue({}),
  getMaxCouponDiscountFromRule:     vi.fn().mockReturnValue(0.20),
  getAffiliateCommissionFromProfit: vi.fn().mockReturnValue(0.50),
}));

vi.mock('../exchangeRate', () => ({
  getRates:         vi.fn().mockResolvedValue({ usdBrl: 5.0, btcBrl: 300000 }),
  convertBrlToUsdt: vi.fn().mockReturnValue(21),
  convertBrlToSats: vi.fn().mockReturnValue(200000),
}));

vi.mock('../liquidHdWallet.service', () => ({
  isXpubConfigured:    vi.fn().mockReturnValue(false),
  getNextAddressIndex: vi.fn(),
  deriveLiquidAddress: vi.fn().mockReturnValue('liquid_addr_mock'),
}));

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-001', name: 'Test', email: 'u@test.com', telegram: '@u',
  isBlocked: false, isActive: true, referredByCode: null,
};

const BASE_COUPON = {
  id: 'cup-001', code: 'SAVE10', discount: 0.10, isActive: true,
  usageCount: 2, maxUsage: 10, affiliateId: null, affiliate: null,
};

const BASE_ITEMS = [
  { barcode: '12345', amount: 100, dueDate: new Date(Date.now() + 86_400_000) },
  { barcode: '67890', amount: 200, dueDate: new Date(Date.now() + 86_400_000) },
];

const BASE_INPUT = { userId: 'user-001', items: BASE_ITEMS };

const WALLET_CONFIG = {
  walletAddress: 'addr_main', qrCodeUrl: 'qr_main',
  walletAddressUsdt: null, qrCodeUrlUsdt: null,
  walletAddressBtc: null, qrCodeUrlBtc: null,
  rateLockMinutes: 10,
};

const CREATED_BATCH = {
  id: 'batch-001', userId: 'user-001', status: 'PENDING',
  itemCount: 2, totalBoletos: 300, totalFee: 10, grandTotal: 310,
  walletAddress: 'addr_main', qrCode: 'qr_main', paymentCurrency: 'DEPIX',
  cryptoAmount: null, depixAmount: 310, exchangeRate: null, rateLockExpiresAt: null,
};

const BOLETO_1 = { id: 'bol-001', barcode: '12345', pdfUrl: null, amount: 100, fee: 5, totalAmount: 105, dueDate: new Date(), status: 'PENDING' };
const BOLETO_2 = { id: 'bol-002', barcode: '67890', pdfUrl: null, amount: 200, fee: 5, totalAmount: 205, dueDate: new Date(), status: 'PENDING' };

function setupHappyPath() {
  mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
  mockPrisma.config.findUnique.mockResolvedValue(WALLET_CONFIG);
  mockTx.boletoBatch.create.mockResolvedValueOnce(CREATED_BATCH);
  mockTx.boleto.create
    .mockResolvedValueOnce(BOLETO_1)
    .mockResolvedValueOnce(BOLETO_2);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));
  mockPrisma.log.create.mockResolvedValue({});
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('createBoletoBatch — happy path (no coupon)', () => {
  it('creates batch and 2 boletos inside the transaction', async () => {
    setupHappyPath();

    const { createBoletoBatch } = await import('../createBoletoBatch');
    const result = await createBoletoBatch(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(mockTx.boletoBatch.create).toHaveBeenCalledTimes(1);
    expect(mockTx.boleto.create).toHaveBeenCalledTimes(2);
    expect(mockTx.couponUsage.create).not.toHaveBeenCalled();
    expect(mockTx.coupon.update).not.toHaveBeenCalled();
  });
});

describe('createBoletoBatch — coupon: usageCount++ and CouponUsage inside tx', () => {
  it('increments usageCount and creates CouponUsage with first boleto id', async () => {
    setupHappyPath();
    mockPrisma.coupon.findUnique.mockResolvedValueOnce(BASE_COUPON);
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 2, maxUsage: 10, isActive: true },
    ]);
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { createBoletoBatch } = await import('../createBoletoBatch');
    const result = await createBoletoBatch({ ...BASE_INPUT, couponCode: 'SAVE10' });

    expect(result.success).toBe(true);
    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cup-001' },
        data:  { usageCount: { increment: 1 } },
      })
    );
    expect(mockTx.couponUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId: 'cup-001',
          userId:   'user-001',
          boletoId: 'bol-001',
        }),
      })
    );
  });
});

describe('createBoletoBatch — coupon exhausted at tx time (FOR UPDATE recheck)', () => {
  it('returns error without writing batch when FOR UPDATE reveals coupon exhausted', async () => {
    // No setupHappyPath() — COUPON_EXHAUSTED throws before boletoBatch/boleto.create
    mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
    mockPrisma.config.findUnique.mockResolvedValue(WALLET_CONFIG);
    mockPrisma.coupon.findUnique.mockResolvedValueOnce(BASE_COUPON); // passes pre-check
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 10, maxUsage: 10, isActive: true }, // exhausted inside tx
    ]);

    const { createBoletoBatch } = await import('../createBoletoBatch');
    const result = await createBoletoBatch({ ...BASE_INPUT, couponCode: 'SAVE10' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/esgotado/i);
    expect(mockTx.boletoBatch.create).not.toHaveBeenCalled();
  });
});

describe('createBoletoBatch — 2nd boleto failure causes full rollback', () => {
  it('propagates error when second boleto.create throws inside the transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
    mockPrisma.config.findUnique.mockResolvedValue(WALLET_CONFIG);
    mockTx.boletoBatch.create.mockResolvedValueOnce(CREATED_BATCH);
    mockTx.boleto.create
      .mockResolvedValueOnce(BOLETO_1)
      .mockRejectedValueOnce(new Error('DB_CRASH_ON_SECOND'));

    const { createBoletoBatch } = await import('../createBoletoBatch');
    await expect(createBoletoBatch(BASE_INPUT)).rejects.toThrow('DB_CRASH_ON_SECOND');
  });
});

describe('createBoletoBatch — P2002 retry on liquidAddressIndex collision', () => {
  it('retries with new index when first attempt collides', async () => {
    const { isXpubConfigured, getNextAddressIndex, deriveLiquidAddress } =
      await import('../liquidHdWallet.service');

    vi.mocked(isXpubConfigured).mockReturnValue(true);
    vi.mocked(getNextAddressIndex)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    vi.mocked(deriveLiquidAddress)
      .mockReturnValueOnce('addr_1')
      .mockReturnValueOnce('addr_2');

    mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
    mockPrisma.config.findUnique.mockResolvedValue(WALLET_CONFIG);

    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    mockPrisma.$transaction
      .mockImplementationOnce(async (_cb: Function) => { throw p2002; })
      .mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const retryBatch = { ...CREATED_BATCH, id: 'batch-retry', walletAddress: 'addr_2' };
    mockTx.boletoBatch.create.mockResolvedValueOnce(retryBatch);
    mockTx.boleto.create
      .mockResolvedValueOnce(BOLETO_1)
      .mockResolvedValueOnce(BOLETO_2);

    const { createBoletoBatch } = await import('../createBoletoBatch');
    const result = await createBoletoBatch(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(getNextAddressIndex).toHaveBeenCalledTimes(2);
  });
});
