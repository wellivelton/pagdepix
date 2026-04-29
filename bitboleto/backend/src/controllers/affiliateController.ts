import { Request, Response } from 'express';
import { prisma } from '../prisma';

// ========================================
// BUSCAR DADOS DO AFILIADO
// ========================================
export const getAffiliateData = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: {
          include: {
            coupons: {
              select: {
                id: true,
                code: true,
                isActive: true,
                usageCount: true,
                maxUsage: true,
                discount: true,
                commission: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.role !== 'AFFILIATE' || !user.affiliate) {
      return res.status(403).json({ error: 'Usuário não é afiliado' });
    }

    const affiliate = user.affiliate;
    const coupon = affiliate.coupons[0] || null;

    // Buscar todas as transações (boletos, recargas e Depix)
    const transactions = await prisma.affiliateTransaction.findMany({
      where: {
        affiliateId: affiliate.id
      },
      include: {
        boleto: {
          select: {
            id: true,
            amount: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            apiKeyId: true   // distingue cupom (null) vs API (não null)
          }
        },
        mobileRecharge: {
          select: {
            id: true,
            amount: true,
            totalAmount: true,
            status: true,
            createdAt: true
          }
        },
        depixOrder: {
          select: {
            id: true,
            amount: true,
            totalToPay: true,
            status: true,
            createdAt: true
          }
        },
        pixCopiaCola: {
          select: {
            id: true,
            valorOriginal: true,
            totalFinal: true,
            nomeDestinatario: true,
            status: true,
            createdAt: true,
            apiKeyId: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100 // Últimas 100 transações
    });

    // Calcular resumo de ganhos separando cupom vs API (retroativo — funciona mesmo antes desta feature)
    const allTxForSummary = await prisma.affiliateTransaction.findMany({
      where: { affiliateId: affiliate.id },
      include: {
        boleto: { select: { apiKeyId: true } },
        mobileRecharge: { select: { apiKeyId: true } },
        pixCopiaCola: { select: { apiKeyId: true } },
      },
    });
    const pccTx      = allTxForSummary.filter((t: any) => t.pixCopiaColaId != null);
    const rechargeTx = allTxForSummary.filter((t: any) => t.mobileRechargeId != null);
    const nonPccTx   = allTxForSummary.filter((t: any) => t.pixCopiaColaId == null);
    const apiTx      = nonPccTx.filter((t: any) => t.boleto?.apiKeyId != null || (t.mobileRecharge as any)?.apiKeyId != null);
    const couponTx   = nonPccTx.filter((t: any) => t.boleto?.apiKeyId == null && (t.mobileRecharge as any)?.apiKeyId == null);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const sum = (arr: any[]) => r2(arr.reduce((s: number, t: any) => s + (t.commission ?? 0), 0));
    const earningsSummary = {
      total:       sum(allTxForSummary),
      coupon:      { total: sum(couponTx),  count: couponTx.length },
      api:         { total: sum(apiTx),     count: apiTx.length },
      recharge:    { total: sum(rechargeTx), count: rechargeTx.length },
      pixCopiaCola: { total: sum(pccTx),    count: pccTx.length },
    };

    // Buscar cupons usados que ainda não geraram comissão (sem transação associada)
    // Buscar todos os IDs de transações existentes para filtrar
    const existingTransactionIds = await prisma.affiliateTransaction.findMany({
      where: {
        affiliateId: affiliate.id
      },
      select: {
        boletoId: true,
        mobileRechargeId: true,
        depixOrderId: true
      }
    });

    const existingBoletoIds = new Set(existingTransactionIds.map(t => t.boletoId).filter(Boolean));
    const existingDepixOrderIds = new Set(existingTransactionIds.map(t => t.depixOrderId).filter(Boolean));
    const existingRechargeIds = new Set(existingTransactionIds.map(t => t.mobileRechargeId).filter(Boolean));

    // Buscar usos de cupom dos últimos 30 dias
    const couponUsages = await prisma.couponUsage.findMany({
      where: {
        couponId: coupon?.id || '',
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Últimos 30 dias
        }
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Filtrar apenas os usos que não têm transação de comissão associada
    const pendingUsages = couponUsages
      .filter(usage => {
        // Se tem boletoId, verificar se há transação
        if (usage.boletoId && existingBoletoIds.has(usage.boletoId)) {
          return false;
        }
        // Se tem depixOrderId, verificar se há transação
        if (usage.depixOrderId && existingDepixOrderIds.has(usage.depixOrderId)) {
          return false;
        }
        // Se não tem boletoId nem depixOrderId, pode ser recarga - verificar se há recarga com transação
        if (!usage.boletoId && !usage.depixOrderId) {
          // Buscar recarga próxima no tempo
          return true; // Incluir por enquanto, pode ser recarga sem transação ainda
        }
        return true; // Não tem transação associada
      })
      .map(usage => ({
        id: usage.id,
        userEmail: usage.userEmail,
        userName: usage.user?.name || usage.userEmail,
        createdAt: usage.createdAt,
        boletoId: usage.boletoId,
        depixOrderId: usage.depixOrderId
      }))
      .slice(0, 20); // Limitar a 20

    // Enriquecer transações com campos derivados (source, type) sem alterar schema
    const enrichedTransactions = transactions.map((tx: any) => {
      const isApi = tx.boleto?.apiKeyId != null || (tx.mobileRecharge as any)?.apiKeyId != null || (tx.pixCopiaCola as any)?.apiKeyId != null;
      let type = 'depix';
      if (tx.pixCopiaCola) type = 'pix-copia-cola';
      else if (tx.boleto) type = 'boleto';
      else if (tx.mobileRecharge) type = 'recarga';
      return { ...tx, source: isApi ? 'api' : 'coupon', type };
    });

    return res.status(200).json({
      affiliate: {
        id: affiliate.id,
        couponCode: affiliate.couponCode,
        balance: affiliate.balance,
        pendingBalance: affiliate.pendingBalance,
        totalEarned: affiliate.totalEarned,
        totalPaid: (affiliate as any).totalPaid ?? 0,
        liquidWallet: affiliate.liquidWallet,
        lastWalletChange: affiliate.lastWalletChange,
        isActive: affiliate.isActive,
        createdAt: affiliate.createdAt,
        commissionRate: coupon?.commission ?? null,
      },
      coupon: coupon ? {
        code: coupon.code,
        isActive: coupon.isActive,
        usageCount: coupon.usageCount,
        maxUsage: coupon.maxUsage,
        discount: coupon.discount,
        commission: coupon.commission
      } : null,
      transactions: enrichedTransactions,
      earningsSummary,  // Breakdown cupom vs API vs recarga (retroativo)
      pendingUsages, // Cupons usados que ainda não geraram comissão
      user: {
        emailVerified: user.emailVerified,
        telegramVerified: user.telegramVerified
      }
    });

  } catch (error) {
    console.error('Erro ao buscar dados do afiliado:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
