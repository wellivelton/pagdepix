import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma module before importing the service.
vi.mock('../../prisma', () => ({
  prisma: {
    webhookIdempotencyKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { ensureIdempotent, updateResult } from '../webhookIdempotency.service';
import { prisma } from '../../prisma';

const mockCreate = vi.mocked((prisma as any).webhookIdempotencyKey.create);
const mockFindUnique = vi.mocked((prisma as any).webhookIdempotencyKey.findUnique);
const mockUpdateMany = vi.mocked((prisma as any).webhookIdempotencyKey.updateMany);

const BASE_PARAMS = {
  source: 'geradepix' as const,
  eventType: 'payment.paid',
  externalId: 'pay_abc123',
  payload: { event: 'payment.paid', payment_id: 'pay_abc123' },
};

const p2002 = Object.assign(new Error('Unique constraint violation'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── First-time processing ────────────────────────────────────────────────────

describe('ensureIdempotent — new key', () => {
  it('returns alreadyProcessed:false when INSERT succeeds', async () => {
    mockCreate.mockResolvedValueOnce({});

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(false);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('allows same externalId with different eventType (distinct events)', async () => {
    mockCreate.mockResolvedValueOnce({});
    const r1 = await ensureIdempotent({ ...BASE_PARAMS, eventType: 'payment.paid' });

    mockCreate.mockResolvedValueOnce({});
    const r2 = await ensureIdempotent({ ...BASE_PARAMS, eventType: 'payment.refunded' });

    expect(r1.alreadyProcessed).toBe(false);
    expect(r2.alreadyProcessed).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-P2002 DB errors', async () => {
    const dbError = Object.assign(new Error('DB connection lost'), { code: 'P1001' });
    mockCreate.mockRejectedValueOnce(dbError);

    await expect(ensureIdempotent(BASE_PARAMS)).rejects.toThrow('DB connection lost');
  });
});

// ─── Genuine duplicates (must block) ─────────────────────────────────────────

describe('ensureIdempotent — genuine duplicates', () => {
  it('blocks when existing result is "ok"', async () => {
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({ result: 'ok', processedAt: new Date() });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.existingResult).toBe('ok');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('blocks when existing result is "pending" and record is fresh (< 10 min)', async () => {
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({
      result: 'pending',
      processedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
    });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.existingResult).toBe('pending');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── Retry-allowed cases ──────────────────────────────────────────────────────

describe('ensureIdempotent — retry allowed', () => {
  it('allows retry when existing result is "error"', async () => {
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({ result: 'error', processedAt: new Date() });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    // WHERE must include result:'error' to guard against concurrent retries
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ result: 'error' }),
      })
    );
  });

  it('allows retry when pending record is stale (> 10 min — crash recovery)', async () => {
    const staleDate = new Date(Date.now() - 11 * 60 * 1000); // 11 min ago
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({ result: 'pending', processedAt: staleDate });
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(false);
    expect(mockUpdateMany).toHaveBeenCalledOnce();
    // WHERE must include processedAt to pin to the exact stale record
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ processedAt: staleDate }),
      })
    );
  });

  it('reprocesses after findUnique returns null (tombstone race)', async () => {
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── Concurrent retry race condition ─────────────────────────────────────────

describe('ensureIdempotent — concurrent retry race', () => {
  it('yields to winner when updateMany returns count=0 on "error" record', async () => {
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({ result: 'error', processedAt: new Date() });
    // Another retry claimed the slot first
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.existingResult).toBe('pending');
    expect(mockUpdateMany).toHaveBeenCalledOnce();
  });

  it('yields to winner when updateMany returns count=0 on stale "pending" record', async () => {
    const staleDate = new Date(Date.now() - 11 * 60 * 1000);
    mockCreate.mockRejectedValueOnce(p2002);
    mockFindUnique.mockResolvedValueOnce({ result: 'pending', processedAt: staleDate });
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await ensureIdempotent(BASE_PARAMS);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.existingResult).toBe('pending');
  });
});

// ─── updateResult ─────────────────────────────────────────────────────────────

describe('updateResult', () => {
  it('calls updateMany with result "ok"', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    await updateResult({ source: 'geradepix', eventType: 'payment.paid', externalId: 'pay_abc123', result: 'ok' });

    expect(mockUpdateMany).toHaveBeenCalledOnce();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: 'geradepix', eventType: 'payment.paid', externalId: 'pay_abc123' },
        data: expect.objectContaining({ result: 'ok' }),
      })
    );
  });

  it('includes errorMessage when result is "error"', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 1 });

    await updateResult({
      source: 'velora',
      eventType: 'PAID',
      externalId: 'vel_xyz',
      result: 'error',
      errorMessage: 'timeout',
    });

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'error', errorMessage: 'timeout' }),
      })
    );
  });
});

// ─── GeraDePix handler — missing external ID guard ───────────────────────────

describe('geradepixWebhook — missing external ID guard', () => {
  it('returns 400 and does not write idempotency key when withdrawal_id and payment_id absent', async () => {
    const { geradepixWebhook } = await import('../../controllers/geradepixWebhookController');

    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const req = { body: { event: 'payment.paid' } } as any;
    const res = { status: statusMock } as any;

    await geradepixWebhook(req, res);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing external ID' }));
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
