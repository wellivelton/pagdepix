import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock objects ───────────────────────────────────────────────────────

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx: Record<string, any> = {
    boleto:      { create: vi.fn() },
    couponUsage: { create: vi.fn() },
    $queryRaw:   vi.fn(),
  };

  const mockPrisma: Record<string, any> = {
    $transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTx)),
    user:         { findUnique: vi.fn() },
    coupon:       { findUnique: vi.fn() },
    config:       { findUnique: vi.fn(), create: vi.fn() },
    log:          { create: vi.fn().mockResolvedValue({}) },
  };

  return { mockTx, mockPrisma };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));

vi.mock('../telegram.service', () => ({
  notifyAdmin:          vi.fn().mockResolvedValue(undefined),
  notifyUserByTelegram: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../push.service', () => ({
  sendNotification:       vi.fn().mockResolvedValue(undefined),
  notifyBoletoCreated:    vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webhookService', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/antifraud', () => ({
  validateCouponUsage: vi.fn().mockResolvedValue({ valid: true }),
  isUserVerified:      vi.fn().mockResolvedValue(true),
  calculateEstimatedProfit: vi.fn().mockReturnValue({ isValid: true, profit: 2.00 }),
}));

vi.mock('../../utils/taxConfig', () => ({
  REFERRAL_RATE:                    0.20,
  MIN_BOLETO_AMOUNT:                20,
  calculateTax:                     vi.fn().mockReturnValue({
    isValid: true, taxAmount: 5.00, totalAmount: 105, totalAmountExact: 105, percentage: 0.05, fixedFee: 0,
  }),
  getTaxRule:                       vi.fn().mockReturnValue({}),
  getMaxCouponDiscountFromRule:      vi.fn().mockReturnValue(0.20),
  getAffiliateCommissionFromProfit:  vi.fn().mockReturnValue(0.50),
  costForAmount:                    vi.fn().mockReturnValue(1.00),
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

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-001', name: 'Test', email: 'u@test.com', telegram: '@u',
  isBlocked: false, isActive: true, referredByCode: null,
};

const BASE_COUPON = {
  id: 'cup-001', code: 'SAVE10', discount: 0.10, isActive: true,
  usageCount: 0, maxUsage: 10, affiliateId: null, affiliate: null,
};

const BASE_INPUT = {
  userId: 'user-001',
  amount: 100,
  dueDate: new Date(Date.now() + 86_400_000),
  couponCode: 'SAVE10',
};

function setupCreateHappyPath() {
  mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
  mockPrisma.coupon.findUnique.mockResolvedValue(BASE_COUPON);
  mockPrisma.config.findUnique.mockResolvedValue({
    walletAddress: 'addr_main', qrCodeUrl: '', walletAddressUsdt: null,
    walletAddressBtc: null, qrCodeUrlUsdt: null, qrCodeUrlBtc: null, rateLockMinutes: 10,
  });
}

const CREATED_BOLETO = {
  id: 'bol-new', userId: 'user-001', status: 'PENDING', amount: 100, fee: 5,
  totalAmount: 105, dueDate: new Date(), depixAmount: 105, walletAddress: 'addr_main',
  couponUsed: 'SAVE10', couponId: 'cup-001', affiliateId: null,
  user: BASE_USER, coupon: BASE_COUPON, affiliate: null,
  createdAt: new Date(), qrCode: '', liquidAddressIndex: null,
  paymentCurrency: 'DEPIX', exchangeRate: null, cryptoAmount: null, rateLockExpiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('createBoleto — Q5 fix: couponUsage.create inside same $transaction', () => {
  it('creates CouponUsage inside the same transaction as boleto.create', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: true },
    ]);
    mockTx.boleto.create.mockResolvedValueOnce(CREATED_BOLETO);
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { createBoleto } = await import('../createBoleto');
    const result = await createBoleto(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(mockTx.couponUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId: 'cup-001',
          userId:   'user-001',
          boletoId: 'bol-new',
        }),
      })
    );
  });
});

describe('createBoleto — coupon race protection via FOR UPDATE', () => {
  it('returns error when FOR UPDATE reveals coupon exhausted at tx time', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 10, maxUsage: 10, isActive: true },
    ]);

    const { createBoleto } = await import('../createBoleto');
    const result = await createBoleto(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/esgotado/i);
  });

  it('returns error when FOR UPDATE reveals coupon deactivated at tx time', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: false },
    ]);

    const { createBoleto } = await import('../createBoleto');
    const result = await createBoleto(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/inativo/i);
  });
});

describe('createBoleto — liquidAddressIndex P2002 retry', () => {
  it('retries with a new index when first attempt collides on liquidAddressIndex', async () => {
    const { getNextAddressIndex, deriveLiquidAddress, isXpubConfigured } =
      await import('../liquidHdWallet.service');

    vi.mocked(isXpubConfigured).mockReturnValue(true);
    vi.mocked(getNextAddressIndex)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    vi.mocked(deriveLiquidAddress)
      .mockReturnValueOnce('addr_1')
      .mockReturnValueOnce('addr_2');

    setupCreateHappyPath();

    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const createdRecord = { ...CREATED_BOLETO, id: 'bol-retry', liquidAddressIndex: 2, walletAddress: 'addr_2' };

    mockPrisma.$transaction
      .mockImplementationOnce(async (_cb: Function) => { throw p2002; })
      .mockImplementationOnce(async (cb: Function) => cb(mockTx));

    mockTx.$queryRaw.mockResolvedValue([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: true },
    ]);
    mockTx.boleto.create.mockResolvedValue(createdRecord);
    mockTx.couponUsage.create.mockResolvedValue({});

    const { createBoleto } = await import('../createBoleto');
    const result = await createBoleto(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(getNextAddressIndex).toHaveBeenCalledTimes(2);
  });
});
