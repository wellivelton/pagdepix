import { createHash } from 'crypto';
import { prisma } from '../prisma';

export type WebhookSource = 'telegram' | 'geradepix' | 'velora';

export interface IdempotencyCheckResult {
  alreadyProcessed: boolean;
  existingResult?: string;
}

// Covers server restarts, OOM kills, and other mid-processing crashes that
// leave a record stuck in 'pending' with no handler running.
const STALE_PENDING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Attempts to record a webhook event as being processed.
 * The unique key is (source, eventType, externalId) — intentionally allows
 * the same externalId with different eventTypes (e.g. payment.paid and
 * payment.refunded for the same payment_id are distinct events).
 *
 * Retry semantics:
 * - result='ok'             → genuine duplicate, block.
 * - result='pending' fresh  → in-flight, block.
 * - result='pending' stale  → previous handler crashed, allow retry.
 * - result='error'          → previous handler failed, allow retry.
 *
 * Concurrent retries on the same errored/stale record are resolved via an
 * atomic conditional UPDATE: only the retry that wins (count > 0) proceeds.
 */
export async function ensureIdempotent(params: {
  source: WebhookSource;
  eventType: string;
  externalId: string;
  payload: unknown;
}): Promise<IdempotencyCheckResult> {
  const { source, eventType, externalId, payload } = params;
  const payloadHash = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');

  try {
    await (prisma as any).webhookIdempotencyKey.create({
      data: {
        source,
        eventType,
        externalId,
        payloadHash,
        result: 'pending',
      },
    });
    return { alreadyProcessed: false };
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err;

    const existing = await (prisma as any).webhookIdempotencyKey.findUnique({
      where: { source_eventType_externalId: { source, eventType, externalId } },
      select: { result: true, processedAt: true },
    });

    if (!existing) {
      // Record was deleted between INSERT and findUnique — reprocess by safety.
      return { alreadyProcessed: false };
    }

    const isErrored = existing.result === 'error';
    const isStalePending =
      existing.result === 'pending' &&
      Date.now() - existing.processedAt.getTime() > STALE_PENDING_THRESHOLD_MS;

    if (isErrored || isStalePending) {
      // Atomically claim the slot. The WHERE includes the current state so that
      // a concurrent retry that also read the same state will get count=0 and yield.
      const claimed = await (prisma as any).webhookIdempotencyKey.updateMany({
        where: {
          source,
          eventType,
          externalId,
          result: existing.result,
          ...(isStalePending && { processedAt: existing.processedAt }),
        },
        data: {
          result: 'pending',
          payloadHash,
          processedAt: new Date(),
          errorMessage: null,
        },
      });

      if (claimed.count === 0) {
        // A concurrent retry won the race and already claimed this slot.
        return { alreadyProcessed: true, existingResult: 'pending' };
      }

      return { alreadyProcessed: false };
    }

    // result is 'ok' or fresh 'pending' — genuine duplicate.
    return { alreadyProcessed: true, existingResult: existing.result };
  }
}

/**
 * Updates the result of an already-recorded idempotency key after processing completes.
 * Call this after all side effects (DB writes, notifications) have finished.
 */
export async function updateResult(params: {
  source: WebhookSource;
  eventType: string;
  externalId: string;
  result: 'ok' | 'error';
  errorMessage?: string;
}): Promise<void> {
  const { source, eventType, externalId, result, errorMessage } = params;
  await (prisma as any).webhookIdempotencyKey.updateMany({
    where: { source, eventType, externalId },
    data: {
      result,
      ...(errorMessage !== undefined && { errorMessage }),
    },
  });
}
