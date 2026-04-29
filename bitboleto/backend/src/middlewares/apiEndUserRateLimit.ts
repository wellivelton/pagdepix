import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

/**
 * Middleware que valida e registra o uso diário por usuário final de um afiliado.
 *
 * Pré-requisitos (setados pelo apiKeyAuth.ts anterior):
 *   (req as any).apiKey.affiliateId  — id do afiliado dono da API key
 *
 * A API call deve passar:
 *   req.body.userRef   — identificador do usuário final (CPF, ID externo, etc.)
 *   req.body.amount    — valor da transação em R$
 *
 * Em caso de aprovação, armazena em (req as any).endUserLimitId para uso posterior.
 */
export const checkEndUserDailyLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const affiliateId: string | undefined = (req as any).apiKey?.affiliateId;
    const { userRef, amount } = req.body as { userRef?: string; amount?: unknown };

    if (!affiliateId) {
      res.status(401).json({ error: 'API key inválida' });
      return;
    }

    // userRef é obrigatório para controle de limite por usuário
    if (!userRef || typeof userRef !== 'string' || !userRef.trim()) {
      res.status(400).json({
        error: 'userRef é obrigatório',
        description: 'Informe o identificador do usuário final (CPF, ID externo, etc.)',
      });
      return;
    }

    const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'));
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'amount deve ser um número positivo' });
      return;
    }

    // ── 1. Verificar status da integração do afiliado ──────────────────────
    const affiliateConfig = await prisma.affiliateApiConfig.findUnique({
      where: { affiliateId },
    });

    if (!affiliateConfig) {
      res.status(403).json({
        error: 'affiliate_integration_not_configured',
        description: 'Este afiliado não possui integração API configurada',
      });
      return;
    }

    if (affiliateConfig.status === 'blocked') {
      res.status(403).json({
        error: 'affiliate_integration_blocked',
        reason: affiliateConfig.blockedReason,
        blockedAt: affiliateConfig.blockedAt,
      });
      return;
    }

    if (affiliateConfig.status === 'inactive') {
      res.status(403).json({
        error: 'affiliate_integration_inactive',
        description: 'Integração API não está ativa para este afiliado',
      });
      return;
    }

    // ── 2. Buscar ou criar registro do usuário final ───────────────────────
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentMonth = today.substring(0, 7); // YYYY-MM

    let endUser = await prisma.apiEndUserLimit.findUnique({
      where: { affiliateId_userRef: { affiliateId, userRef } },
    });

    if (!endUser) {
      endUser = await prisma.apiEndUserLimit.create({
        data: {
          affiliateId,
          userRef,
          isActive: true,
          usedToday: 0,
          lastUsageDate: today,
          usedThisMonth: 0,
          monthResetDate: currentMonth,
        },
      });
    }

    // ── 3. Verificar se usuário está bloqueado ────────────────────────────
    if (!endUser.isActive) {
      res.status(403).json({
        error: 'end_user_blocked',
        blockedReason: endUser.blockedReason,
        blockedAt: endUser.blockedAt,
      });
      return;
    }

    // ── 4. Reset diário (se mudou de dia) ─────────────────────────────────
    let usedToday = endUser.usedToday;
    let usedThisMonth = endUser.usedThisMonth;

    if (endUser.lastUsageDate !== today) {
      usedToday = 0;
      await prisma.apiEndUserLimit.update({
        where: { id: endUser.id },
        data: { usedToday: 0, lastUsageDate: today },
      });
    }

    // ── 5. Reset mensal (se mudou de mês) ─────────────────────────────────
    if (endUser.monthResetDate !== currentMonth) {
      usedThisMonth = 0;
      await prisma.apiEndUserLimit.update({
        where: { id: endUser.id },
        data: { usedThisMonth: 0, monthResetDate: currentMonth },
      });
    }

    // ── 6. Definir limite efetivo ─────────────────────────────────────────
    const effectiveDailyLimit =
      endUser.dailyLimit ?? affiliateConfig.globalDailyLimitPerUser;

    const dailyRemaining = effectiveDailyLimit - usedToday;

    if (numAmount > dailyRemaining) {
      // Registrar tentativa de exceder limite
      await prisma.auditLog.create({
        data: {
          entityType: 'api_end_user_limit',
          entityId: endUser.id,
          action: 'daily_limit_exceeded',
          details: {
            affiliateId,
            userRef,
            limit: effectiveDailyLimit,
            usedToday,
            attempted: numAmount,
            remaining: dailyRemaining,
          } as any,
          userId: 'SYSTEM',
          ip: req.ip ?? null,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      res.status(429).json({
        error: 'daily_limit_exceeded',
        limit: effectiveDailyLimit,
        used_today: usedToday,
        requested: numAmount,
        remaining_today: Math.max(0, dailyRemaining),
        resets_at: new Date(
          new Date(today + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000
        ).toISOString(),
      });
      return;
    }

    // ── 7. Verificar volume total diário do afiliado (se configurado) ─────
    if (affiliateConfig.maxDailyVolumeAffiliate != null) {
      const agg = await prisma.apiEndUserLimit.aggregate({
        where: { affiliateId, lastUsageDate: today },
        _sum: { usedToday: true },
      });
      const affiliateUsedToday = agg._sum.usedToday ?? 0;
      const affiliateRemaining =
        affiliateConfig.maxDailyVolumeAffiliate - affiliateUsedToday;

      if (numAmount > affiliateRemaining) {
        res.status(429).json({
          error: 'affiliate_daily_volume_exceeded',
          affiliateLimit: affiliateConfig.maxDailyVolumeAffiliate,
          affiliateUsedToday,
          remaining: Math.max(0, affiliateRemaining),
          requested: numAmount,
        });
        return;
      }
    }

    // ── 8. Atualizar uso de forma atômica ──────────────────────────────────
    // Usamos updateMany com condition para evitar race condition
    const updateCount = await prisma.apiEndUserLimit.updateMany({
      where: {
        id: endUser.id,
        isActive: true,
        // Garantir que a soma não ultrapasse o limite
        usedToday: { lte: effectiveDailyLimit - numAmount },
      },
      data: {
        usedToday: { increment: numAmount },
        usedThisMonth: { increment: numAmount },
        lastUsageDate: today,
        monthResetDate: currentMonth,
      },
    });

    if (updateCount.count === 0) {
      // Condição não satisfeita (race condition): limite atingido por outra requisição concorrente
      res.status(429).json({
        error: 'daily_limit_exceeded',
        message: 'Limite diário atingido (concorrência)',
        limit: effectiveDailyLimit,
      });
      return;
    }

    // Disponibilizar para controllers posteriores
    (req as any).endUserLimitId = endUser.id;
    (req as any).endUserRef = userRef;

    next();
  } catch (err: any) {
    console.error('[apiEndUserRateLimit]', err);
    res.status(500).json({ error: 'Erro interno no controle de limite' });
  }
};
