import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock objects (hoisted so vi.mock factories can reference them) ──────

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx: Record<string, any> = {
    mobileRecharge:      { updateMany: vi.fn(), create: vi.fn() },
    user:                { update: vi.fn(), findUnique: vi.fn() },
    referralEarning:     { create: vi.fn() },
    affiliateTransaction:{ findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    affiliate:           { update: vi.fn() },
    coupon:              { update: vi.fn() },
    couponUsage:         { create: vi.fn() },
    $queryRaw:           vi.fn(),
  };

  const mockPrisma: Record<string, any> = {
    $transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTx)),
    mobileRecharge: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    user:           { findUnique: vi.fn() },
    coupon:         { findUnique: vi.fn() },
    config:         { findUnique: vi.fn(), create: vi.fn() },
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
  sendNotification:          vi.fn().mockResolvedValue(undefined),
  notifyAffiliateCommission: vi.fn().mockResolvedValue(undefined),
  notifyRechargeApproved:    vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webhookService', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../asaas.service', () => ({
  asaasIsConfigured:   vi.fn().mockReturnValue(false),
  asaasCreateRecharge: vi.fn(),
}));

vi.mock('../liquidHdWallet.service', () => ({
  getNextAddressIndex: vi.fn(),
  deriveLiquidAddress: vi.fn().mockReturnValue('liquid_addr_mock'),
  isXpubConfigured:    vi.fn().mockReturnValue(false),
}));

vi.mock('../../utils/antifraud', () => ({
  validateCouponUsage: vi.fn().mockResolvedValue({ valid: true }),
  isUserVerified:      vi.fn().mockResolvedValue(true),
}));

vi.mock('../../utils/taxConfig', () => ({
  REFERRAL_RATE: 0.20,
}));

vi.mock('../exchangeRate', () => ({
  getRates:         vi.fn().mockResolvedValue({ usdBrl: 5.0, btcBrl: 300000 }),
  convertBrlToUsdt: vi.fn().mockReturnValue(10),
  convertBrlToSats: vi.fn().mockReturnValue(100000),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_RECHARGE = {
  id: 'rch-001',
  userId: 'user-001',
  status: 'PENDING',
  amount: 50,
  fee: 2.00,
  totalAmount: 52.00,
  depixAmount: 52.00,
  walletAddress: 'addr_main',
  operator: 'Vivo',
  phoneNumber: '+5511999990000',
  couponId: null as string | null,
  affiliateId: null as string | null,
  couponUsed: null,
  apiKeyId: null,
  externalRef: null,
  isSandbox: false,
  user: { id: 'user-001', email: 'user@test.com', telegram: '@user', telegramChatId: null },
};

function setupFinalizeHappyPath(overrides: Partial<typeof BASE_RECHARGE> = {}) {
  const record = { ...BASE_RECHARGE, ...overrides };
  // initial findUnique (with user include)
  mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(record);
  // atomic claim succeeds
  mockTx.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 1 });
  // user.update totalPaid
  mockTx.user.update.mockResolvedValueOnce({});
  // referral owner: no referredByCode
  mockTx.user.findUnique.mockResolvedValueOnce(null);
  // reload after tx
  mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));
});

// ─── finalizeApprovedRecharge tests ──────────────────────────────────────────

describe('finalizeApprovedRecharge — double-finalization guard', () => {
  it('returns error when concurrent call already claimed the slot (count=0)', async () => {
    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(BASE_RECHARGE);
    mockTx.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 0 });

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    const result = await finalizeApprovedRecharge('rch-001');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Recarga já finalizada.');
  });

  it('claim WHERE includes both PENDING and PROCESSING', async () => {
    setupFinalizeHappyPath();

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    await finalizeApprovedRecharge('rch-001');

    expect(mockTx.mobileRecharge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: expect.objectContaining({ in: expect.arrayContaining(['PENDING', 'PROCESSING']) }),
        }),
      })
    );
  });
});

describe('finalizeApprovedRecharge — Bug B: coupon usageCount outside affiliateId block', () => {
  it('increments usageCount even when affiliateId is null', async () => {
    const COUPON_ID = 'cup-bugB';
    setupFinalizeHappyPath({ couponId: COUPON_ID, affiliateId: null });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    await finalizeApprovedRecharge('rch-001');

    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COUPON_ID },
        data:  { usageCount: { increment: 1 } },
      })
    );
  });
});

describe('finalizeApprovedRecharge — Bug A: CouponUsage created for mobile recharge', () => {
  it('creates CouponUsage with mobileRechargeId on approval', async () => {
    const COUPON_ID = 'cup-bugA';
    const RECHARGE_ID = 'rch-001';
    setupFinalizeHappyPath({ id: RECHARGE_ID, couponId: COUPON_ID, affiliateId: null });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    await finalizeApprovedRecharge(RECHARGE_ID);

    expect(mockTx.couponUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId:        COUPON_ID,
          userId:          'user-001',
          mobileRechargeId: RECHARGE_ID,
        }),
      })
    );
  });
});

describe('finalizeApprovedRecharge — Bug C: errors propagate (no silent catch)', () => {
  it('rethrows errors thrown inside the transaction callback', async () => {
    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(BASE_RECHARGE);
    mockTx.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockRejectedValueOnce(new Error('DB_CRASH'));

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');

    await expect(finalizeApprovedRecharge('rch-001')).rejects.toThrow('DB_CRASH');
  });
});

describe('finalizeApprovedRecharge — affiliate commission with coupon', () => {
  it('creates affiliateTransaction and increments coupon — both inside tx', async () => {
    const COUPON_ID  = 'cup-aff';
    const AFFILIATE_ID = 'aff-001';
    const record = { ...BASE_RECHARGE, couponId: COUPON_ID, affiliateId: AFFILIATE_ID, fee: 4.00 };

    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(record);
    mockTx.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValueOnce({});
    mockTx.user.findUnique.mockResolvedValueOnce(null); // no referral
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(null); // no existing
    mockTx.affiliateTransaction.create.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockResolvedValueOnce({});
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockTx.couponUsage.create.mockResolvedValueOnce({});
    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    const result = await finalizeApprovedRecharge('rch-001');

    expect(result.success).toBe(true);
    expect(mockTx.affiliateTransaction.create).toHaveBeenCalled();
    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COUPON_ID } })
    );
    expect(mockTx.couponUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mobileRechargeId: 'rch-001' }) })
    );
  });
});

describe('finalizeApprovedRecharge — affiliate existing PENDING transaction', () => {
  it('updates existing PENDING affiliateTransaction to AVAILABLE', async () => {
    const AFFILIATE_ID = 'aff-002';
    const record = { ...BASE_RECHARGE, affiliateId: AFFILIATE_ID };
    const existingTx = { id: 'atx-001', status: 'PENDING', commission: 0.50 };

    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(record);
    mockTx.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValueOnce({});
    mockTx.user.findUnique.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(existingTx);
    mockTx.affiliateTransaction.update.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockResolvedValueOnce({});
    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });

    const { finalizeApprovedRecharge } = await import('../mobileRecharge');
    const result = await finalizeApprovedRecharge('rch-001');

    expect(result.success).toBe(true);
    expect(mockTx.affiliateTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'atx-001' },
        data:  expect.objectContaining({ status: 'AVAILABLE' }),
      })
    );
  });
});

// ─── adminMarkRechargePaid tests ──────────────────────────────────────────────

describe('adminMarkRechargePaid — concurrent Asaas claim', () => {
  it('blocks second concurrent call when PENDING→PROCESSING claim returns count=0', async () => {
    const { asaasIsConfigured } = await import('../asaas.service');
    vi.mocked(asaasIsConfigured).mockReturnValue(true);

    mockPrisma.mobileRecharge.findUnique.mockResolvedValueOnce(BASE_RECHARGE);
    // Atomic claim fails — already claimed by concurrent call
    mockPrisma.mobileRecharge.updateMany.mockResolvedValueOnce({ count: 0 });

    const { adminMarkRechargePaid } = await import('../mobileRecharge');
    const result = await adminMarkRechargePaid('rch-001');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/sendo processada/i);
  });
});

// ─── createRecharge tests ─────────────────────────────────────────────────────

const BASE_USER = {
  id: 'user-001', name: 'Test User', email: 'u@test.com', telegram: '@u',
  isBlocked: false, isActive: true,
};

const BASE_COUPON = {
  id: 'cup-001', code: 'SAVE10', discount: 0.10, isActive: true,
  usageCount: 0, maxUsage: 10, affiliateId: null, affiliate: null,
};

const BASE_CREATE_INPUT = {
  userId:      'user-001',
  operator:    'Vivo',
  phoneNumber: '11999990000',
  amount:      50,
  couponCode:  'SAVE10',
};

function setupCreateHappyPath() {
  mockPrisma.user.findUnique.mockResolvedValue(BASE_USER);
  mockPrisma.coupon.findUnique.mockResolvedValue(BASE_COUPON);
  mockPrisma.config.findUnique.mockResolvedValue({
    walletAddress: 'addr_main', walletAddressUsdt: null, walletAddressBtc: null, rateLockMinutes: 10,
  });
}

describe('createRecharge — coupon race protection', () => {
  it('returns error when FOR UPDATE reveals coupon exhausted at tx time', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 10, maxUsage: 10, isActive: true },
    ]);

    const { createRecharge } = await import('../mobileRecharge');
    const result = await createRecharge(BASE_CREATE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/esgotado/i);
  });

  it('returns error when FOR UPDATE reveals coupon deactivated at tx time', async () => {
    setupCreateHappyPath();
    mockTx.$queryRaw.mockResolvedValueOnce([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: false },
    ]);

    const { createRecharge } = await import('../mobileRecharge');
    const result = await createRecharge(BASE_CREATE_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/inativo/i);
  });
});

describe('createRecharge — liquidAddressIndex P2002 retry', () => {
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
    const createdRecord = { ...BASE_RECHARGE, id: 'rch-new', liquidAddressIndex: 2, walletAddress: 'addr_2' };

    mockPrisma.$transaction
      .mockImplementationOnce(async (_cb: Function) => { throw p2002; })
      .mockImplementationOnce(async (cb: Function) => cb(mockTx));

    mockTx.$queryRaw.mockResolvedValue([
      { id: 'cup-001', usageCount: 0, maxUsage: 10, isActive: true },
    ]);
    mockTx.mobileRecharge.create.mockResolvedValue(createdRecord);

    const { createRecharge } = await import('../mobileRecharge');
    const result = await createRecharge(BASE_CREATE_INPUT);

    expect(result.success).toBe(true);
    expect(getNextAddressIndex).toHaveBeenCalledTimes(2);
  });
});
