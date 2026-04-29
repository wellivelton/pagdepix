/**
 * Script para corrigir comissões faltantes em DepixOrders que já foram confirmados
 * mas não têm comissão de afiliado criada
 * 
 * Uso: npx ts-node scripts/fix-missing-depix-commissions.ts [--dry-run] [--coupon PROMETHEUS]
 */

import { prisma } from '../src/prisma';
import { DEPIX_MARGIN_PERCENT } from '../src/services/swapverse';

async function fixMissingDepixCommissions(options: { dryRun: boolean; couponCode?: string }) {
  console.log('\n🔧 Correção de Comissões Faltantes em Depix\n');
  console.log(`Modo: ${options.dryRun ? 'DRY RUN (não vai salvar)' : 'EXECUÇÃO REAL'}`);
  if (options.couponCode) {
    console.log(`Cupom específico: ${options.couponCode}\n`);
  }

  // Buscar cupom se especificado
  let couponIdFilter: string | undefined = undefined;
  if (options.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: options.couponCode.toUpperCase() },
      select: { id: true, code: true, affiliateId: true }
    });
    if (!coupon) {
      console.log(`❌ Cupom ${options.couponCode} não encontrado!`);
      return;
    }
    couponIdFilter = coupon.id;
    console.log(`📋 Cupom encontrado: ${coupon.code}, AffiliateId: ${coupon.affiliateId || 'NÃO TEM!'}\n`);
  }

  // Buscar CouponUsages com depixOrderId (esses são os usos reais de cupom em Depix)
  const couponUsagesWhere: any = {
    depixOrderId: { not: null }
  };
  
  if (couponIdFilter) {
    couponUsagesWhere.couponId = couponIdFilter;
  }

  const couponUsages = await prisma.couponUsage.findMany({
    where: couponUsagesWhere,
    include: {
      coupon: {
        select: {
          id: true,
          code: true,
          affiliateId: true
        }
      }
    }
  });

  console.log(`📊 Usos de cupom com DepixOrderId encontrados: ${couponUsages.length}\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const confirmedDepixOrders: any[] = [];

  // Buscar os DepixOrders pelos orderIds dos CouponUsages
  for (const usage of couponUsages) {
    if (!usage.depixOrderId || !usage.coupon?.affiliateId) {
      skippedCount++;
      continue;
    }

    const order = await (prisma as any).depixOrder.findFirst({
      where: { orderId: usage.depixOrderId },
      include: {
        coupon: {
          select: {
            id: true,
            code: true,
            affiliateId: true
          }
        }
      }
    });

    if (!order) {
      console.log(`⚠️  DepixOrder ${usage.depixOrderId} não encontrado`);
      skippedCount++;
      continue;
    }

    if (order.status !== 'depix_sent') {
      console.log(`⏳ DepixOrder ${order.orderId} ainda não foi confirmado (status: ${order.status})`);
      skippedCount++;
      continue;
    }

    // Garantir que o DepixOrder tem affiliateId e couponId (atualizar se necessário)
    if (!order.affiliateId || !order.couponId) {
      if (!options.dryRun) {
        try {
          await (prisma as any).depixOrder.update({
            where: { id: order.id },
            data: {
              affiliateId: usage.coupon.affiliateId,
              couponId: usage.coupon.id
            }
          });
          console.log(`✅ DepixOrder ${order.orderId} atualizado com affiliateId e couponId`);
        } catch (error: any) {
          console.error(`❌ Erro ao atualizar DepixOrder ${order.orderId}:`, error.message);
          errorCount++;
          continue;
        }
      }
      // Atualizar o objeto em memória
      order.affiliateId = usage.coupon.affiliateId;
      order.couponId = usage.coupon.id;
      order.coupon = usage.coupon;
    }

    confirmedDepixOrders.push(order);
  }

  console.log(`📊 DepixOrders confirmados para processar: ${confirmedDepixOrders.length}\n`);

  // Processar cada DepixOrder
  for (const order of confirmedDepixOrders) {
    if (!order.affiliateId) {
      console.log(`⚠️  DepixOrder ${order.orderId} não tem affiliateId, pulando...`);
      skippedCount++;
      continue;
    }

    // Verificar se já existe transação
    const existingTransaction = await prisma.affiliateTransaction.findFirst({
      where: {
        affiliateId: order.affiliateId,
        depixOrderId: order.id as any
      }
    });
    
    // Se não encontrou pelo id, tentar buscar pelo orderId
    let existingByOrderId = null;
    if (!existingTransaction && order.orderId) {
      const allAffiliateTransactions = await prisma.affiliateTransaction.findMany({
        where: { affiliateId: order.affiliateId },
        include: {
          depixOrder: {
            select: { orderId: true }
          }
        }
      });
      existingByOrderId = allAffiliateTransactions.find(tx => tx.depixOrder?.orderId === order.orderId);
    }
    
    if (existingTransaction || existingByOrderId) {
      console.log(`✓ DepixOrder ${order.orderId} já tem comissão (status: ${existingTransaction?.status || existingByOrderId?.status})`);
      skippedCount++;
      continue;
    }

    // Calcular comissão: 20% da margem sobre o valor
    // O amountNum deve ser o valor em reais (totalToPay), não em Depix
    const amountNum = typeof order.totalToPay === 'number' ? order.totalToPay : 
                     typeof order.amount === 'number' ? order.amount : 
                     parseFloat(String(order.totalToPay || order.amount || 0));
    const marginAmount = amountNum * (DEPIX_MARGIN_PERCENT / 100);
    const commission = Math.floor(marginAmount * 0.20 * 100) / 100; // 20% da margem
    
    console.log(`\n💰 DepixOrder ${order.orderId}:`);
    console.log(`   Valor: R$ ${amountNum.toFixed(2)}`);
    console.log(`   Amount: ${order.amount} DPX`);
    console.log(`   Margem (%): ${(DEPIX_MARGIN_PERCENT * 100).toFixed(2)}%`);
    console.log(`   Margem (R$): R$ ${marginAmount.toFixed(2)}`);
    console.log(`   Comissão calculada (20% da margem): R$ ${commission.toFixed(2)}`);
    console.log(`   Cupom: ${order.coupon?.code || 'N/A'}`);
    console.log(`   AffiliateId: ${order.affiliateId}`);

    if (commission <= 0) {
      console.log(`   ⚠️  Comissão é 0 ou negativa, não será criada`);
      skippedCount++;
      continue;
    }

    if (!options.dryRun) {
      try {
        // Criar transação como AVAILABLE (já que o Depix está depix_sent)
        await prisma.affiliateTransaction.create({
          data: {
            affiliateId: order.affiliateId,
            depixOrderId: order.id as any,
            amount: amountNum,
            commission: commission,
            status: 'AVAILABLE', // Já está confirmado, então disponível
            availableAt: new Date()
          }
        });

        // Atualizar saldo do afiliado
        await prisma.affiliate.update({
          where: { id: order.affiliateId },
          data: {
            balance: { increment: commission },
            totalEarned: { increment: commission }
          }
        });

        console.log(`   ✅ Comissão criada e creditada!`);
        fixedCount++;
      } catch (error: any) {
        console.error(`   ❌ Erro ao criar comissão:`, error.message);
        errorCount++;
      }
    } else {
      console.log(`   🔍 [DRY RUN] Seria criada comissão de R$ ${commission.toFixed(2)}`);
      fixedCount++;
    }
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   ✅ Corrigidos: ${fixedCount}`);
  console.log(`   ⏭️  Pulados: ${skippedCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);
  console.log(`\n✅ Processo concluído!\n`);
}

// Executar
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const couponIndex = args.indexOf('--coupon');
const couponCode = couponIndex >= 0 && args[couponIndex + 1] ? args[couponIndex + 1] : undefined;

fixMissingDepixCommissions({ dryRun, couponCode })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
