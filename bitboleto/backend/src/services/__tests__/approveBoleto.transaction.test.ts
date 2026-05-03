import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── shared mock objects ───────────────────────────────────────────────────────

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const mockTx: Record<string, any> = {
    boleto:               { updateMany: vi.fn() },
    user:                 { update: vi.fn(), findUnique: vi.fn() },
    referralEarning:      { create: vi.fn() },
    affiliateTransaction: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    affiliate:            { update: vi.fn(), findUnique: vi.fn() },
    coupon:               { update: vi.fn() },
  };

  const mockPrisma: Record<string, any> = {
    $transaction: vi.fn().mockImplementation(async (cb: Function) => cb(mockTx)),
    boleto:       { findUnique: vi.fn() },
  };

  return { mockTx, mockPrisma };
});

// ── module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../prisma', () => ({ prisma: mockPrisma }));

vi.mock('../push.service', () => ({
  notifyBoletoApproved:      vi.fn().mockResolvedValue(undefined),
  notifyAffiliateCommission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../telegram.service', () => ({
  notifyUserByTelegram: vi.fn().mockResolvedValue(undefined),
  notifyAdmin:          vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../webhookService', () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/taxConfig', () => ({
  REFERRAL_RATE:                     0.20,
  getAffiliateCommissionFromProfit:  vi.fn().mockReturnValue(1.00),
}));

// ── base fixtures ─────────────────────────────────────────────────────────────

const BASE_BOLETO = {
  id: 'bol-001',
  userId: 'user-001',
  status: 'PENDING',
  amount: 100,
  fee: 5.00,
  totalAmount: 105.00,
  walletAddress: 'addr_main',
  couponId: null as string | null,
  affiliateId: null as string | null,
  apiKeyId: null,
  externalRef: null,
  isSandbox: false,
  user: { id: 'user-001', email: 'u@test.com', telegram: '@u' },
};

function setupApproveHappyPath(overrides: Partial<typeof BASE_BOLETO> = {}) {
  const record = { ...BASE_BOLETO, ...overrides };
  mockPrisma.boleto.findUnique.mockResolvedValueOnce(record);
  mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
  mockTx.user.update.mockResolvedValue({});
  mockTx.user.findUnique.mockResolvedValueOnce(null); // no referral
  mockPrisma.boleto.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockTx));
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('approveBoleto — double-approval guard', () => {
  it('returns error when concurrent call already claimed (count=0)', async () => {
    mockPrisma.boleto.findUnique.mockResolvedValueOnce(BASE_BOLETO);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 0 });

    const { approveBoletoService } = await import('../approveBoleto');
    const result = await approveBoletoService('bol-001');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Boleto já foi processado.');
  });
});

describe('approveBoleto — Bug B fix: coupon usageCount outside affiliateId', () => {
  it('increments usageCount even when affiliateId is null', async () => {
    const COUPON_ID = 'cup-bugB';
    setupApproveHappyPath({ couponId: COUPON_ID, affiliateId: null });
    mockTx.coupon.update.mockResolvedValueOnce({});

    const { approveBoletoService } = await import('../approveBoleto');
    await approveBoletoService('bol-001');

    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COUPON_ID },
        data:  { usageCount: { increment: 1 } },
      })
    );
  });
});

describe('approveBoleto — Bug C fix: errors propagate (no silent catch)', () => {
  it('rethrows errors thrown inside the transaction callback', async () => {
    mockPrisma.boleto.findUnique.mockResolvedValueOnce(BASE_BOLETO);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockRejectedValueOnce(new Error('DB_CRASH'));

    const { approveBoletoService } = await import('../approveBoleto');
    await expect(approveBoletoService('bol-001')).rejects.toThrow('DB_CRASH');
  });
});

describe('approveBoleto — Q4 fix: referral creates ReferralEarning inside tx', () => {
  it('creates ReferralEarning for referrer inside the transaction', async () => {
    const REFERRER_ID = 'ref-001';
    // Full manual setup so user.findUnique queue is not pre-polluted with null
    mockPrisma.boleto.findUnique.mockResolvedValueOnce(BASE_BOLETO);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.user.findUnique
      .mockResolvedValueOnce({ referredByCode: 'CODE123' }) // owner lookup
      .mockResolvedValueOnce({ id: REFERRER_ID });           // referrer lookup
    mockTx.referralEarning.create.mockResolvedValueOnce({});
    mockPrisma.boleto.findUnique.mockResolvedValueOnce({ ...BASE_BOLETO, status: 'PAID' });

    const { approveBoletoService } = await import('../approveBoleto');
    const result = await approveBoletoService('bol-001');

    expect(result.success).toBe(true);
    expect(mockTx.referralEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          earnerId: REFERRER_ID,
          boletoId: 'bol-001',
        }),
      })
    );
  });
});

describe('approveBoleto — affiliate error causes full rollback', () => {
  it('throws and boleto stays PENDING when affiliate.update fails', async () => {
    const record = { ...BASE_BOLETO, affiliateId: 'aff-001' };
    mockPrisma.boleto.findUnique.mockResolvedValueOnce(record);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValueOnce({});       // totalPaid ok
    mockTx.user.findUnique.mockResolvedValueOnce(null); // no referral
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.create.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockRejectedValueOnce(new Error('AFFILIATE_DB_ERROR'));

    // $transaction propagates the error
    mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(mockTx));

    const { approveBoletoService } = await import('../approveBoleto');
    await expect(approveBoletoService('bol-001')).rejects.toThrow('AFFILIATE_DB_ERROR');
  });
});

describe('approveBoleto — affiliate with coupon together', () => {
  it('creates affiliateTransaction AND increments usageCount', async () => {
    const COUPON_ID  = 'cup-aff';
    const AFF_ID     = 'aff-001';
    const record     = { ...BASE_BOLETO, couponId: COUPON_ID, affiliateId: AFF_ID };

    mockPrisma.boleto.findUnique.mockResolvedValueOnce(record);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.user.findUnique.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.create.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockResolvedValue({});
    mockTx.affiliate.findUnique.mockResolvedValueOnce({ userId: 'aff-user-001' });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockPrisma.boleto.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });

    const { approveBoletoService } = await import('../approveBoleto');
    const result = await approveBoletoService('bol-001');

    expect(result.success).toBe(true);
    expect(mockTx.affiliateTransaction.create).toHaveBeenCalled();
    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COUPON_ID }, data: { usageCount: { increment: 1 } } })
    );
  });
});

describe('approveBoleto — existing PENDING affiliateTransaction → AVAILABLE', () => {
  it('updates existing PENDING tx to AVAILABLE and adjusts balances', async () => {
    const AFF_ID    = 'aff-002';
    const record    = { ...BASE_BOLETO, affiliateId: AFF_ID };
    const existingT = { id: 'atx-001', status: 'PENDING', commission: 0.80 };

    mockPrisma.boleto.findUnique.mockResolvedValueOnce(record);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.user.findUnique.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(existingT);
    mockTx.affiliateTransaction.update.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockResolvedValue({});
    mockTx.affiliate.findUnique.mockResolvedValueOnce({ userId: 'aff-user-002' });
    mockPrisma.boleto.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID' });

    const { approveBoletoService } = await import('../approveBoleto');
    const result = await approveBoletoService('bol-001');

    expect(result.success).toBe(true);
    expect(mockTx.affiliateTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'atx-001' },
        data:  expect.objectContaining({ status: 'AVAILABLE' }),
      })
    );
  });
});

describe('approveBoleto — paidViaAsaas flag creates commission and increments coupon', () => {
  it('runs full approval logic (commission + usageCount) when called with paidViaAsaas=true', async () => {
    const COUPON_ID = 'cup-asaas';
    const AFF_ID    = 'aff-asaas';
    const record    = { ...BASE_BOLETO, couponId: COUPON_ID, affiliateId: AFF_ID };

    mockPrisma.boleto.findUnique.mockResolvedValueOnce(record);
    mockTx.boleto.updateMany.mockResolvedValueOnce({ count: 1 });
    mockTx.user.update.mockResolvedValue({});
    mockTx.user.findUnique.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.findFirst.mockResolvedValueOnce(null);
    mockTx.affiliateTransaction.create.mockResolvedValueOnce({});
    mockTx.affiliate.update.mockResolvedValue({});
    mockTx.affiliate.findUnique.mockResolvedValueOnce({ userId: 'aff-user-asaas' });
    mockTx.coupon.update.mockResolvedValueOnce({});
    mockPrisma.boleto.findUnique.mockResolvedValueOnce({ ...record, status: 'PAID', paidViaAsaas: true });

    const { approveBoletoService } = await import('../approveBoleto');
    const result = await approveBoletoService('bol-001', {
      paidViaAsaas: true,
      asaasPaymentId: 'asaas-pay-123',
      adminNotes: 'Pago via Asaas',
    });

    expect(result.success).toBe(true);
    expect(mockTx.affiliateTransaction.create).toHaveBeenCalled();
    expect(mockTx.coupon.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COUPON_ID } })
    );
    // atomic claim includes paidViaAsaas flag
    expect(mockTx.boleto.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidViaAsaas: true }),
      })
    );
  });
});
