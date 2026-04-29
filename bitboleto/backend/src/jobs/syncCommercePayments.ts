/**
 * Job em background: Sincroniza pagamentos de comércio pendentes com SwapVerse.
 * 
 * Roda automaticamente a cada 1 minuto para garantir que todos os pagamentos
 * confirmados pela SwapVerse sejam atualizados no banco e apareçam no Dashboard/Histórico.
 * 
 * Idempotente: só atualiza se status mudou de 'pending' para 'depix_sent'.
 */

import { prisma } from '../prisma';
import { getDepixOrderStatus, DEPIX_MARGIN_PERCENT } from '../services/swapverse';
import { sendPaymentNotificationEmail } from '../services/email.service';
import { onCommerceLinkPaymentPaid } from '../services/commerceWebhookService';

const JOB_INTERVAL_MS = 60 * 1000; // 1 minuto
const MAX_ORDERS_PER_RUN = 50; // Limite por execução para não sobrecarregar SwapVerse
const MAX_AGE_DAYS = 7; // Só processar pedidos dos últimos 7 dias

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

/**
 * Processa um pedido pendente: consulta SwapVerse e atualiza se necessário.
 */
async function processPendingOrder(order: any): Promise<{ updated: boolean; credited: boolean }> {
  try {
    const result = await getDepixOrderStatus(order.orderId);
    if (!result.success || !result.order) {
      return { updated: false, credited: false };
    }

    const swapverseStatus = result.order.status;
    const dbStatus = order.status;

    // Se já está depix_sent no banco, não fazer nada (idempotência)
    if (dbStatus === 'depix_sent') {
      return { updated: false, credited: false };
    }

    // Se SwapVerse ainda não confirmou, não fazer nada
    if (swapverseStatus !== 'depix_sent') {
      return { updated: false, credited: false };
    }

    // Status mudou para depix_sent - atualizar banco
    const isCommercePayment = !!(order.commerceLinkId || order.commercePageId);
    
    // Calcular taxas se ainda não calculadas (para comércio)
    let grossAmount = order.grossAmount ?? order.totalToPay ?? order.amount ?? 0;
    let fixedFeePaid = order.fixedFeePaid ?? 0.99;
    let variableFeePaid = order.variableFeePaid ?? 0;
    let pagdepixProfit = order.pagdepixProfit ?? 0;
    let swapverseFee = order.swapverseFee ?? 0;

    if (isCommercePayment && !order.grossAmount) {
      fixedFeePaid = 0.99;
      variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100; // 0,5%
      pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100; // 0,3%
      swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100; // 0,2%
    }

    // Atualizar status e taxas no banco
    await prisma.depixOrder.update({
      where: { id: order.id },
      data: {
        status: 'depix_sent',
        grossAmount: order.grossAmount ?? grossAmount,
        fixedFeePaid: order.fixedFeePaid ?? fixedFeePaid,
        variableFeePaid: order.variableFeePaid ?? variableFeePaid,
        pagdepixProfit: order.pagdepixProfit ?? pagdepixProfit,
        swapverseFee: order.swapverseFee ?? swapverseFee,
      },
    });

    // Se tem afiliado, criar comissão e incrementar usageCount (apenas quando pagamento confirmado)
    if (order.affiliateId && order.couponId) {
      // Verificar se já existe transação (pode ter sido criada antes da correção)
      const existingTransaction = await prisma.affiliateTransaction.findFirst({
        where: {
          affiliateId: order.affiliateId,
          depixOrderId: order.id as any
        }
      });

      if (existingTransaction) {
        // Se já existe e está PENDING, mover para AVAILABLE
        if (existingTransaction.status === 'PENDING') {
          await prisma.affiliateTransaction.update({
            where: { id: existingTransaction.id },
            data: {
              status: 'AVAILABLE',
              availableAt: new Date()
            }
          });

          // Mover de pendingBalance para balance
          await prisma.affiliate.update({
            where: { id: order.affiliateId },
            data: {
              pendingBalance: { decrement: existingTransaction.commission },
              balance: { increment: existingTransaction.commission }
            }
          });
        }
      } else {
        // Criar comissão agora que o pagamento foi confirmado
        const amountNum = typeof order.totalToPay === 'number' ? order.totalToPay : 
                         typeof order.amount === 'number' ? order.amount : 
                         parseFloat(String(order.totalToPay || order.amount || 0));
        const marginAmount = amountNum * (DEPIX_MARGIN_PERCENT / 100);
        const commissionAmount = Math.floor(marginAmount * 0.20 * 100) / 100; // 20% da margem

        if (commissionAmount > 0) {
          try {
            // Criar transação como AVAILABLE (já está confirmado)
            await prisma.affiliateTransaction.create({
              data: {
                affiliateId: order.affiliateId,
                depixOrderId: order.id as any,
                amount: amountNum,
                commission: commissionAmount,
                status: 'AVAILABLE',
                availableAt: new Date()
              }
            });

            // Creditar diretamente no balance (já está confirmado)
            await prisma.affiliate.update({
              where: { id: order.affiliateId },
              data: {
                balance: { increment: commissionAmount },
                totalEarned: { increment: commissionAmount }
              }
            });

            console.log(`[AFFILIATE] ✅ Comissão de Depix criada após confirmação: depixOrderId=${order.id}, affiliateId=${order.affiliateId}, commission=${commissionAmount}`);
          } catch (error) {
            console.error(`[AFFILIATE] ❌ Erro ao criar comissão para Depix ${order.id}:`, error);
          }
        }
      }

      // Incrementar usageCount do cupom apenas quando pagamento confirmado
      try {
        await prisma.coupon.update({
          where: { id: order.couponId },
          data: { usageCount: { increment: 1 } }
        });
        console.log(`[AFFILIATE] ✅ usageCount incrementado para cupom ${order.couponId} após confirmação do pagamento`);
      } catch (error) {
        console.error(`[AFFILIATE] ❌ Erro ao incrementar usageCount do cupom ${order.couponId}:`, error);
      }
    }

    // Creditar valor líquido ao comerciante (idempotente: só se status mudou)
    let credited = false;
    if (isCommercePayment) {
      const netAmount = grossAmount - fixedFeePaid - variableFeePaid;
      if (netAmount > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: {
            totalPaid: {
              increment: netAmount,
            },
          },
        });
        credited = true;
      }
    } else {
      // Pagamento não-comércio: creditar totalToPay
      if (order.totalToPay > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: {
            totalPaid: {
              increment: order.totalToPay,
            },
          },
        });
        credited = true;
      }
    }

    // Enviar email de notificação (apenas comércio, se ainda não enviado)
    if (isCommercePayment && !order.emailNotifiedAt) {
      try {
        const fullOrder = await prisma.depixOrder.findUnique({
          where: { id: order.id },
          include: {
            commerceLink: { select: { titulo: true } },
            commercePage: { select: { titulo: true } },
            user: {
              include: {
                commercePartner: {
                  include: {
                    settings: true,
                  },
                },
              },
            },
          },
        });

        const user = fullOrder?.user as any;
        if (user?.commercePartner?.settings?.emailNotificationsEnabled !== false) {
          const merchantEmail = user.email;
          const merchantName = user.commercePartner?.settings?.businessName || user.name;
          const paymentTitle = fullOrder?.commerceLink?.titulo || fullOrder?.commercePage?.titulo || 'Pagamento';
          const netAmount = grossAmount - fixedFeePaid - variableFeePaid;

          await sendPaymentNotificationEmail(merchantEmail, merchantName, {
            amount: netAmount,
            linkTitle: paymentTitle,
            orderId: order.orderId,
            paymentDate: order.createdAt.toISOString(),
          });

          await prisma.depixOrder.update({
            where: { id: order.id },
            data: { emailNotifiedAt: new Date() },
          });
        }
      } catch (emailError: any) {
        console.error(`[syncCommercePayments] Erro ao enviar email para pedido ${order.orderId}:`, emailError?.message);
      }
    }

    // Atualizar CommerceCharge e disparar webhook charge.paid (para cobranças com link)
    if (order.commerceLinkId) {
      onCommerceLinkPaymentPaid(order.commerceLinkId, order.id, grossAmount, new Date()).catch((e) =>
        console.warn('[syncCommercePayments] Webhook charge.paid:', (e as Error)?.message)
      );
    }

    console.log(`[syncCommercePayments] ✅ Pedido ${order.orderId.substring(0, 20)}... atualizado: ${dbStatus} -> depix_sent${credited ? ' (creditado)' : ''}`);
    return { updated: true, credited };
  } catch (error: any) {
    console.error(`[syncCommercePayments] ❌ Erro ao processar pedido ${order.orderId}:`, error?.message);
    return { updated: false, credited: false };
  }
}

/**
 * Executa uma rodada de sincronização.
 */
async function runSync(): Promise<void> {
  if (isRunning) {
    console.log('[syncCommercePayments] ⏭️  Job já em execução, pulando...');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

    // Buscar pedidos pendentes de comércio (últimos 7 dias)
    const pendingOrders = await prisma.depixOrder.findMany({
      where: {
        status: { not: 'depix_sent' },
        createdAt: { gte: cutoff },
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ORDERS_PER_RUN,
      select: {
        id: true,
        orderId: true,
        userId: true,
        status: true,
        amount: true,
        totalToPay: true,
        grossAmount: true,
        fixedFeePaid: true,
        variableFeePaid: true,
        pagdepixProfit: true,
        swapverseFee: true,
        commerceLinkId: true,
        commercePageId: true,
        emailNotifiedAt: true,
        createdAt: true,
      },
    });

    if (pendingOrders.length === 0) {
      isRunning = false;
      return;
    }

    console.log(`[syncCommercePayments] 🔄 Processando ${pendingOrders.length} pedidos pendentes...`);

    let updated = 0;
    let credited = 0;

    // Processar em sequência para evitar sobrecarga na SwapVerse
    for (const order of pendingOrders) {
      const result = await processPendingOrder(order);
      if (result.updated) updated++;
      if (result.credited) credited++;
      
      // Pequeno delay entre requisições para não sobrecarregar SwapVerse
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const duration = Date.now() - startTime;
    console.log(`[syncCommercePayments] ✅ Sincronização concluída: ${updated} atualizados, ${credited} creditados (${duration}ms)`);
  } catch (error: any) {
    console.error('[syncCommercePayments] ❌ Erro fatal na sincronização:', error?.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Inicia o job em background (roda a cada 1 minuto).
 */
export function startCommercePaymentsSync(): void {
  if (intervalId !== null) {
    console.log('[syncCommercePayments] ⚠️  Job já está rodando');
    return;
  }

  console.log('[syncCommercePayments] 🚀 Iniciando job de sincronização (intervalo: 1 minuto)');
  
  // Executar imediatamente na primeira vez
  runSync().catch(err => console.error('[syncCommercePayments] Erro na execução inicial:', err));

  // Agendar execuções periódicas
  intervalId = setInterval(() => {
    runSync().catch(err => console.error('[syncCommercePayments] Erro na execução periódica:', err));
  }, JOB_INTERVAL_MS);
}

/**
 * Para o job (útil para testes ou shutdown graceful).
 */
export function stopCommercePaymentsSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[syncCommercePayments] ⏹️  Job parado');
  }
}
