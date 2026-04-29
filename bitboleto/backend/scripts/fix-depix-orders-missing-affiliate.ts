/**
 * Script para atualizar DepixOrders antigos que não têm affiliateId e couponId
 * mas têm uso de cupom registrado em CouponUsage
 * 
 * Uso: npx ts-node scripts/fix-depix-orders-missing-affiliate.ts [--dry-run]
 */

import { prisma } from '../src/prisma';

async function fixDepixOrdersMissingAffiliate(options: { dryRun: boolean }) {
  console.log('\n🔧 Correção de DepixOrders sem AffiliateId\n');
  console.log(`Modo: ${options.dryRun ? 'DRY RUN (não vai salvar)' : 'EXECUÇÃO REAL'}\n`);

  // Buscar CouponUsages que têm depixOrderId mas o DepixOrder não tem affiliateId
  const couponUsages = await prisma.couponUsage.findMany({
    where: {
      depixOrderId: { not: null }
    },
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

  for (const usage of couponUsages) {
    if (!usage.depixOrderId || !usage.coupon?.affiliateId) {
      skippedCount++;
      continue;
    }

    // Buscar DepixOrder pelo orderId (não pelo id)
    const depixOrder = await (prisma as any).depixOrder.findFirst({
      where: { orderId: usage.depixOrderId },
      select: {
        id: true,
        orderId: true,
        affiliateId: true,
        couponId: true,
        status: true
      }
    });

    if (!depixOrder) {
      console.log(`⚠️  DepixOrder ${usage.depixOrderId} não encontrado`);
      skippedCount++;
      continue;
    }

    const needsUpdate = !depixOrder.affiliateId || !depixOrder.couponId;

    if (!needsUpdate) {
      console.log(`✓ DepixOrder ${usage.depixOrderId} já tem affiliateId e couponId`);
      skippedCount++;
      continue;
    }

    console.log(`\n💰 DepixOrder ${usage.depixOrderId}:`);
    console.log(`   Status: ${depixOrder.status}`);
    console.log(`   AffiliateId atual: ${depixOrder.affiliateId || 'NÃO TEM'}`);
    console.log(`   CouponId atual: ${depixOrder.couponId || 'NÃO TEM'}`);
    console.log(`   Cupom usado: ${usage.coupon.code}`);
    console.log(`   AffiliateId do cupom: ${usage.coupon.affiliateId}`);

    if (!options.dryRun) {
      try {
        await (prisma as any).depixOrder.update({
          where: { id: depixOrder.id },
          data: {
            affiliateId: usage.coupon.affiliateId,
            couponId: usage.coupon.id
          }
        });

        console.log(`   ✅ DepixOrder atualizado!`);
        fixedCount++;
      } catch (error: any) {
        console.error(`   ❌ Erro ao atualizar:`, error.message);
        errorCount++;
      }
    } else {
      console.log(`   🔍 [DRY RUN] Seria atualizado com affiliateId=${usage.coupon.affiliateId}, couponId=${usage.coupon.id}`);
      fixedCount++;
    }
  }

  console.log(`\n📊 Resumo:`);
  console.log(`   ✅ Atualizados: ${fixedCount}`);
  console.log(`   ⏭️  Pulados: ${skippedCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);
  console.log(`\n✅ Processo concluído!\n`);
}

// Executar
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

fixDepixOrdersMissingAffiliate({ dryRun })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
