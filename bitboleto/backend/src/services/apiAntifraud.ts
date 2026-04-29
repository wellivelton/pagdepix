import { prisma } from '../prisma';
import { notifyAdmin } from './telegram.service';

const THRESHOLD_FAILED_TXIDS = 10;
const THRESHOLD_WINDOW_HOURS = 1;
const THRESHOLD_RAPID_CREATES = 20;

export async function checkAbnormalBehavior(apiKeyId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - THRESHOLD_WINDOW_HOURS * 60 * 60 * 1000);

    const [failedBoletos, failedRecharges] = await Promise.all([
      prisma.boleto.count({
        where: {
          apiKeyId,
          createdAt: { gte: since },
          status: 'CANCELLED',
        },
      }),
      prisma.mobileRecharge.count({
        where: {
          apiKeyId,
          createdAt: { gte: since },
          status: 'CANCELLED',
        },
      }),
    ]);

    const totalFailed = failedBoletos + failedRecharges;

    if (totalFailed >= THRESHOLD_FAILED_TXIDS) {
      await suspendKey(apiKeyId, `Auto-suspended: ${totalFailed} failed transactions in ${THRESHOLD_WINDOW_HOURS}h`);
      return;
    }

    const [recentBoletos, recentRecharges] = await Promise.all([
      prisma.boleto.count({ where: { apiKeyId, createdAt: { gte: since } } }),
      prisma.mobileRecharge.count({ where: { apiKeyId, createdAt: { gte: since } } }),
    ]);

    const totalRecent = recentBoletos + recentRecharges;

    if (totalRecent >= THRESHOLD_RAPID_CREATES) {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
      });
      if (apiKey) {
        notifyAdmin(
          `⚠️ *API Alerta*\nAPI Key: ${apiKey.keyPrefix}...\nAfiliado: ${apiKey.affiliate.user.name}\n${totalRecent} transações na última hora.`
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[API Antifraud] Check failed:', err);
  }
}

async function suspendKey(apiKeyId: string, reason: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      isActive: false,
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });

  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    include: { affiliate: { include: { user: { select: { name: true, email: true } } } } },
  });

  if (apiKey) {
    notifyAdmin(
      `🚨 *API Key Suspensa Automaticamente*\nKey: ${apiKey.keyPrefix}...\nAfiliado: ${apiKey.affiliate.user.name} (${apiKey.affiliate.user.email})\nMotivo: ${reason}`
    ).catch(() => {});
  }

  console.log(`[API Antifraud] Key ${apiKeyId} suspended: ${reason}`);
}
