/**
 * Script para corrigir comissões faltantes em boletos que já foram aprovados
 * mas não têm comissão de afiliado criada
 * 
 * Uso: npx ts-node scripts/fix-missing-commissions.ts [--dry-run] [--coupon PROMETHEUS]
 */

import { prisma } from '../src/prisma';
import { getAffiliateCommissionFromProfit, costForAmount } from '../src/utils/taxConfig';

async function fixMissingCommissions(options: { dryRun: boolean; couponCode?: string }) {
  console.log('\n🔧 Correção de Comissões Faltantes\n');
  console.log(`Modo: ${options.dryRun ? 'DRY RUN (não vai salvar)' : 'EXECUÇÃO REAL'}`);
  if (options.couponCode) {
    console.log(`Cupom específico: ${options.couponCode}\n`);
  }

  // Buscar cupom se especificado
  let couponFilter: any = {};
  if (options.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: options.couponCode.toUpperCase() },
      select: { id: true, code: true, affiliateId: true }
    });
    if (!coupon) {
      console.log(`❌ Cupom ${options.couponCode} não encontrado!`);
      return;
    }
    couponFilter = { couponId: coupon.id };
    console.log(`📋 Cupom encontrado: ${coupon.code}, AffiliateId: ${coupon.affiliateId || 'NÃO TEM!'}\n`);
  }

  // Buscar boletos aprovados (PAID) que têm cupom mas não têm transação de comissão
  const paidBoletos = await prisma.boleto.findMany({
    where: {
      status: 'PAID',
      affiliateId: { not: null },
      ...couponFilter
    },
    include: {
      coupon: {
        select: {
          id: true,
          code: true,
          affiliateId: true
        }
      },
      affiliate: {
        select: {
          id: true,
          userId: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`📊 Boletos aprovados encontrados: ${paidBoletos.length}\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const boleto of paidBoletos) {
    if (!boleto.affiliateId) {
      console.log(`⚠️  Boleto ${boleto.id} não tem affiliateId, pulando...`);
      skippedCount++;
      continue;
    }

    // Verificar se já existe transação
    const existingTransaction = await prisma.affiliateTransaction.findFirst({
      where: {
        affiliateId: boleto.affiliateId,
        boletoId: boleto.id
      }
    });

    if (existingTransaction) {
      console.log(`✓ Boleto ${boleto.id} já tem comissão (status: ${existingTransaction.status})`);
      skippedCount++;
      continue;
    }

    // Calcular comissão
    const commission = getAffiliateCommissionFromProfit(boleto.fee, boleto.amount);
    
    console.log(`\n📄 Boleto ${boleto.id}:`);
    console.log(`   Valor: R$ ${boleto.amount.toFixed(2)}`);
    console.log(`   Taxa: R$ ${boleto.fee.toFixed(2)}`);
    console.log(`   Custo: R$ ${costForAmount(boleto.amount).toFixed(2)}`);
    console.log(`   Lucro: R$ ${(boleto.fee - costForAmount(boleto.amount)).toFixed(2)}`);
    console.log(`   Comissão calculada: R$ ${commission.toFixed(2)}`);
    console.log(`   Cupom: ${boleto.coupon?.code || 'N/A'}`);
    console.log(`   AffiliateId: ${boleto.affiliateId}`);

    if (commission <= 0) {
      console.log(`   ⚠️  Comissão é 0 ou negativa, não será criada`);
      skippedCount++;
      continue;
    }

    if (!options.dryRun) {
      try {
        // Criar transação como AVAILABLE (já que o boleto está PAID)
        await prisma.affiliateTransaction.create({
          data: {
            affiliateId: boleto.affiliateId,
            boletoId: boleto.id,
            amount: boleto.totalAmount,
            commission: commission,
            status: 'AVAILABLE', // Já está pago, então disponível
            availableAt: boleto.confirmedAt || boleto.paidAt || new Date()
          }
        });

        // Atualizar saldo do afiliado
        await prisma.affiliate.update({
          where: { id: boleto.affiliateId },
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

fixMissingCommissions({ dryRun, couponCode })
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
