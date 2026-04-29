/**
 * Script para reprocessar comissões faltantes em transações via API
 * (boletos e recargas criados por afiliados via API key, sem cupom)
 *
 * O bug original exigia couponId para gerar comissão, bloqueando 100% das
 * transações via API. Este script cria as comissões retroativamente.
 *
 * Uso:
 *   npx ts-node scripts/reprocessApiCommissions.ts [--dry-run] [--affiliate <couponCode>]
 *
 * Flags:
 *   --dry-run          Exibe o que seria feito sem salvar nada no banco
 *   --affiliate CODE   Restringe a um afiliado específico (pelo couponCode)
 */

import { prisma } from '../src/prisma';
import { getAffiliateCommissionFromProfit, costForAmount } from '../src/utils/taxConfig';

const RECHARGE_COST_PERCENT = 0.02;
const RECHARGE_COST_FIXED = 0.99;

async function reprocessApiCommissions(options: { dryRun: boolean; affiliateCode?: string }) {
  console.log('\n🔧 Reprocessamento de Comissões via API\n');
  console.log(`Modo: ${options.dryRun ? 'DRY RUN (não salva nada)' : '⚠️  EXECUÇÃO REAL'}`);
  if (options.affiliateCode) {
    console.log(`Afiliado: ${options.affiliateCode.toUpperCase()}`);
  }
  console.log('');

  // Resolver afiliado se especificado
  let affiliateFilter: { id: string } | undefined;
  if (options.affiliateCode) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { couponCode: options.affiliateCode.toUpperCase() },
      select: { id: true, couponCode: true }
    });
    if (!affiliate) {
      console.log(`❌ Afiliado com cupom "${options.affiliateCode}" não encontrado!`);
      return;
    }
    affiliateFilter = { id: affiliate.id };
    console.log(`📋 Afiliado: ${affiliate.couponCode} (id: ${affiliate.id})\n`);
  }

  let totalFixed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalCommission = 0;

  // ============================================================
  // BOLETOS via API (affiliateId set, apiKeyId set, couponId null)
  // ============================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📄 BOLETOS via API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const paidApiboletos = await prisma.boleto.findMany({
    where: {
      status: 'PAID',
      affiliateId: affiliateFilter ? affiliateFilter.id : { not: null },
      apiKeyId: { not: null },
      couponId: null,
    },
    select: {
      id: true,
      amount: true,
      fee: true,
      totalAmount: true,
      affiliateId: true,
      apiKeyId: true,
      paidAt: true,
      confirmedAt: true,
      affiliate: { select: { couponCode: true } }
    },
    orderBy: { paidAt: 'asc' }
  });

  console.log(`Total de boletos API aprovados encontrados: ${paidApiboletos.length}\n`);

  for (const boleto of paidApiboletos) {
    const existingTx = await prisma.affiliateTransaction.findFirst({
      where: { affiliateId: boleto.affiliateId!, boletoId: boleto.id }
    });

    if (existingTx) {
      console.log(`  ✓ Boleto ${boleto.id.slice(0, 8)}... já tem comissão [${existingTx.status}]`);
      totalSkipped++;
      continue;
    }

    const commission = getAffiliateCommissionFromProfit(boleto.fee, boleto.amount);
    const cost = costForAmount(boleto.amount);

    console.log(`  📄 Boleto ${boleto.id.slice(0, 8)}...`);
    console.log(`     Afiliado: ${boleto.affiliate?.couponCode ?? boleto.affiliateId}`);
    console.log(`     Valor: R$ ${boleto.amount.toFixed(2)}  Taxa: R$ ${boleto.fee.toFixed(2)}  Custo: R$ ${cost.toFixed(2)}`);
    console.log(`     Comissão calculada: ${commission.toFixed(4)} DEPIX`);

    if (commission <= 0) {
      console.log(`     ⚠️  Comissão zerada — pulando`);
      totalSkipped++;
      continue;
    }

    if (!options.dryRun) {
      try {
        await prisma.affiliateTransaction.create({
          data: {
            affiliateId: boleto.affiliateId!,
            boletoId: boleto.id,
            amount: boleto.totalAmount,
            commission,
            status: 'AVAILABLE',
            availableAt: boleto.confirmedAt ?? boleto.paidAt ?? new Date()
          }
        });
        await prisma.affiliate.update({
          where: { id: boleto.affiliateId! },
          data: {
            balance: { increment: commission },
            totalEarned: { increment: commission }
          }
        });
        console.log(`     ✅ Comissão criada e creditada!`);
        totalFixed++;
        totalCommission += commission;
      } catch (err: any) {
        console.error(`     ❌ Erro:`, err.message);
        totalErrors++;
      }
    } else {
      console.log(`     🔍 [DRY RUN] Criaria comissão de ${commission.toFixed(4)} DEPIX`);
      totalFixed++;
      totalCommission += commission;
    }
  }

  // ============================================================
  // RECARGAS via API (affiliateId set, apiKeyId set, couponId null)
  // ============================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📱 RECARGAS via API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const paidApiRecharges = await (prisma as any).mobileRecharge.findMany({
    where: {
      status: 'PAID',
      affiliateId: affiliateFilter ? affiliateFilter.id : { not: null },
      apiKeyId: { not: null },
      couponId: null,
    },
    select: {
      id: true,
      amount: true,
      fee: true,
      totalAmount: true,
      affiliateId: true,
      apiKeyId: true,
      paidAt: true,
      affiliate: { select: { couponCode: true } }
    },
    orderBy: { paidAt: 'asc' }
  });

  console.log(`Total de recargas API aprovadas encontradas: ${paidApiRecharges.length}\n`);

  for (const recharge of paidApiRecharges) {
    const existingTx = await prisma.affiliateTransaction.findFirst({
      where: { affiliateId: recharge.affiliateId, mobileRechargeId: recharge.id }
    });

    if (existingTx) {
      console.log(`  ✓ Recarga ${recharge.id.slice(0, 8)}... já tem comissão [${existingTx.status}]`);
      totalSkipped++;
      continue;
    }

    const cost = recharge.amount * RECHARGE_COST_PERCENT + RECHARGE_COST_FIXED;
    const profit = Math.max(0, recharge.fee - cost);
    const commission = Math.floor(profit * 0.20 * 100) / 100;

    console.log(`  📱 Recarga ${recharge.id.slice(0, 8)}...`);
    console.log(`     Afiliado: ${recharge.affiliate?.couponCode ?? recharge.affiliateId}`);
    console.log(`     Valor: R$ ${recharge.amount.toFixed(2)}  Taxa: R$ ${recharge.fee.toFixed(2)}  Custo: R$ ${cost.toFixed(2)}`);
    console.log(`     Comissão calculada: ${commission.toFixed(4)} DEPIX`);

    if (commission <= 0) {
      console.log(`     ⚠️  Comissão zerada — pulando`);
      totalSkipped++;
      continue;
    }

    if (!options.dryRun) {
      try {
        await prisma.affiliateTransaction.create({
          data: {
            affiliateId: recharge.affiliateId,
            mobileRechargeId: recharge.id,
            amount: recharge.totalAmount,
            commission,
            status: 'AVAILABLE',
            availableAt: recharge.paidAt ?? new Date()
          }
        });
        await prisma.affiliate.update({
          where: { id: recharge.affiliateId },
          data: {
            balance: { increment: commission },
            totalEarned: { increment: commission }
          }
        });
        console.log(`     ✅ Comissão criada e creditada!`);
        totalFixed++;
        totalCommission += commission;
      } catch (err: any) {
        console.error(`     ❌ Erro:`, err.message);
        totalErrors++;
      }
    } else {
      console.log(`     🔍 [DRY RUN] Criaria comissão de ${commission.toFixed(4)} DEPIX`);
      totalFixed++;
      totalCommission += commission;
    }
  }

  // ============================================================
  // RESUMO
  // ============================================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 RESUMO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Comissões ${options.dryRun ? 'que seriam criadas' : 'criadas'}: ${totalFixed}`);
  console.log(`  ⏭️  Já existiam (puladas):                 ${totalSkipped}`);
  console.log(`  ❌ Erros:                                  ${totalErrors}`);
  console.log(`  💰 Total ${options.dryRun ? 'estimado' : 'creditado'}: ${totalCommission.toFixed(4)} DEPIX`);
  if (options.dryRun) {
    console.log('\n  ℹ️  Execute sem --dry-run para aplicar as correções.');
  }
  console.log('');
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const affIdx = args.indexOf('--affiliate');
const affiliateCode = affIdx >= 0 && args[affIdx + 1] ? args[affIdx + 1] : undefined;

reprocessApiCommissions({ dryRun, affiliateCode })
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erro fatal:', err);
    prisma.$disconnect();
    process.exit(1);
  });
