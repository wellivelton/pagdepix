/**
 * Script de Sincronização: Sincronizar status de pagamentos de comércio com SwapVerse
 *
 * Este script:
 * 1. Busca TODOS os pagamentos de comércio
 * 2. Consulta o status na SwapVerse para cada um
 * 3. Atualiza o status no banco se houver diferença
 * 4. Para pagamentos confirmados (depix_sent), calcula taxas e credita valores
 *
 * Uso:
 *   cd backend
 *   npm run sync-commerce-status
 *   ou
 *   npx ts-node scripts/sync-commerce-status.ts
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente primeiro
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { getDepixOrderStatus } from '../src/services/swapverse';
import { sendPaymentNotificationEmail } from '../src/services/email.service';

const prisma = new PrismaClient();

async function syncCommerceStatus() {
  console.log('🔄 Iniciando sincronização de status de pagamentos de comércio...\n');

  try {
    // Buscar TODOS os pagamentos de comércio
    const orders = await (prisma.depixOrder.findMany as any)({
      where: {
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        commerceLink: {
          select: {
            id: true,
            titulo: true,
            slug: true,
          },
        },
        commercePage: {
          select: {
            id: true,
            titulo: true,
            slug: true,
          },
        },
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

    console.log(`📊 Encontrados ${orders.length} pagamentos de comércio\n`);

    if (orders.length === 0) {
      console.log('✅ Nenhum pagamento de comércio encontrado!');
      return;
    }

    let updated = 0;
    let errors = 0;
    let alreadySynced = 0;
    let credited = 0;
    let emailsSent = 0;

    for (const order of orders) {
      try {
        // Consultar status na SwapVerse
        const result = await getDepixOrderStatus(order.orderId);

        if (!result.success || !result.order) {
          console.log(`⚠️  Pedido ${order.orderId.substring(0, 20)}... - Erro: ${result.error || 'Não encontrado'}`);
          errors++;
          continue;
        }

        const swapverseStatus = result.order.status;
        const dbStatus = order.status;
        const orderAny = order as any;

        // Se o status já está sincronizado, pular
        if (swapverseStatus === dbStatus) {
          alreadySynced++;
          continue;
        }

        console.log(`🔄 Atualizando pedido ${order.orderId.substring(0, 20)}...`);
        console.log(`   Status atual: ${dbStatus} -> Novo status: ${swapverseStatus}`);

        const isDepixSent = swapverseStatus === 'depix_sent';
        const isCommercePayment = !!(orderAny.commerceLinkId || orderAny.commercePageId);

        // Preparar dados de atualização
        const updateData: any = {
          status: swapverseStatus,
        };

        // Se está sendo confirmado e é pagamento de comércio, calcular taxas
        if (isDepixSent && isCommercePayment) {
          // Calcular taxas se ainda não calculadas
          const currentGrossAmount = (order as any).grossAmount;
          if (!currentGrossAmount || currentGrossAmount === null) {
            const grossAmount = order.totalToPay || order.amount || 0;
            const fixedFeePaid = 0.99;
            const variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100; // 0,5%
            const pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100; // 0,3%
            const swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100; // 0,2%

            updateData.grossAmount = grossAmount;
            updateData.fixedFeePaid = fixedFeePaid;
            updateData.variableFeePaid = variableFeePaid;
            updateData.pagdepixProfit = pagdepixProfit;
            updateData.swapverseFee = swapverseFee;

            console.log(`   💰 Taxas calculadas: Bruto R$ ${grossAmount.toFixed(2)}, Líquido R$ ${(grossAmount - fixedFeePaid - variableFeePaid).toFixed(2)}`);
          }
        }

        // Atualizar status no banco
        await (prisma.depixOrder.update as any)({
          where: { id: order.id },
          data: updateData,
        });

        // Se foi confirmado e é pagamento de comércio, creditar valor líquido
        if (isDepixSent && isCommercePayment) {
          // Buscar dados atualizados para calcular valor líquido
          const updatedOrder = await (prisma.depixOrder.findUnique as any)({
            where: { id: order.id },
            select: {
              grossAmount: true,
              fixedFeePaid: true,
              variableFeePaid: true,
              totalToPay: true,
            },
          });

          if (updatedOrder) {
            const grossAmount = updatedOrder.grossAmount || updatedOrder.totalToPay || 0;
            const fixedFeePaid = updatedOrder.fixedFeePaid || 0;
            const variableFeePaid = updatedOrder.variableFeePaid || 0;
            const netAmount = grossAmount - fixedFeePaid - variableFeePaid;

            // Verificar se já foi creditado (verificar se totalPaid do usuário já inclui esse valor)
            // Por segurança, vamos creditar apenas se o valor líquido for positivo
            if (netAmount > 0) {
              await prisma.user.update({
                where: { id: order.userId },
                data: {
                  totalPaid: {
                    increment: netAmount,
                  },
                },
              });
              credited++;
              console.log(`   ✅ Valor líquido creditado: R$ ${netAmount.toFixed(2)}`);
            }
          }
        }

        // Enviar email de notificação se ainda não foi enviado (apenas para depix_sent)
        if (
          isDepixSent &&
          isCommercePayment &&
          !orderAny.emailNotifiedAt &&
          orderAny.user?.commercePartner?.settings?.emailNotificationsEnabled !== false
        ) {
          const merchantEmail = orderAny.user.email;
          const merchantName = orderAny.user.commercePartner?.settings?.businessName || orderAny.user.name;
          const paymentTitle = orderAny.commerceLink?.titulo || orderAny.commercePage?.titulo || 'Pagamento';

          // Buscar valor líquido atualizado
          const finalOrder = await (prisma.depixOrder.findUnique as any)({
            where: { id: order.id },
            select: {
              grossAmount: true,
              fixedFeePaid: true,
              variableFeePaid: true,
              totalToPay: true,
            },
          });

          const grossAmount = finalOrder?.grossAmount || finalOrder?.totalToPay || 0;
          const fixedFeePaid = finalOrder?.fixedFeePaid || 0;
          const variableFeePaid = finalOrder?.variableFeePaid || 0;
          const netAmount = grossAmount - fixedFeePaid - variableFeePaid;

          try {
            await sendPaymentNotificationEmail(merchantEmail, merchantName, {
              amount: netAmount,
              linkTitle: paymentTitle,
              orderId: order.orderId,
              paymentDate: order.createdAt.toISOString(),
            });

            // Marcar como notificado
            await (prisma.depixOrder.update as any)({
              where: { id: order.id },
              data: { emailNotifiedAt: new Date() },
            });

            emailsSent++;
            console.log(`   📧 Email de notificação enviado`);
          } catch (emailError: any) {
            console.log(`   ⚠️  Erro ao enviar email: ${emailError.message}`);
          }
        }

        updated++;
        console.log(`   ✅ Pedido atualizado com sucesso\n`);

      } catch (error: any) {
        errors++;
        console.error(`❌ Erro ao processar pedido ${order.orderId}:`, error.message);
        console.log('');
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA SINCRONIZAÇÃO:');
    console.log('='.repeat(60));
    console.log(`Total de pedidos processados: ${orders.length}`);
    console.log(`Pedidos atualizados: ${updated}`);
    console.log(`Pedidos já sincronizados: ${alreadySynced}`);
    console.log(`Valores creditados: ${credited}`);
    console.log(`Emails enviados: ${emailsSent}`);
    console.log(`Erros: ${errors}`);
    console.log('='.repeat(60) + '\n');

    if (updated > 0) {
      console.log('✅ Sincronização concluída! Os dashboards devem atualizar automaticamente.');
    } else {
      console.log('✅ Todos os pedidos já estavam sincronizados!');
    }

  } catch (error: any) {
    console.error('❌ Erro fatal na sincronização:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar sincronização
(async () => {
  try {
    await syncCommerceStatus();
    console.log('✨ Script finalizado com sucesso!');
    await prisma.$disconnect();
    process.exit(0);
  } catch (error: any) {
    console.error('💥 Erro ao executar script:', error);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
})();
