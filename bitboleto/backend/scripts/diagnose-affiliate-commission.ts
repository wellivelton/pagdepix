/**
 * Script de diagnóstico: Verifica por que comissões de afiliados não estão sendo creditadas
 * 
 * Uso: npx ts-node scripts/diagnose-affiliate-commission.ts PROMETHEUS
 */

import { prisma } from '../src/prisma';

async function diagnoseAffiliateCommission(couponCode: string) {
  console.log(`\n🔍 Diagnóstico de Comissões - Cupom: ${couponCode}\n`);

  // 1. Buscar cupom e afiliado
  const coupon = await prisma.coupon.findUnique({
    where: { code: couponCode.toUpperCase() },
    include: {
      affiliate: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              telegram: true
            }
          }
        }
      }
    }
  });

  if (!coupon) {
    console.log('❌ Cupom não encontrado!');
    return;
  }

  console.log('📋 Informações do Cupom:');
  console.log(`   ID: ${coupon.id}`);
  console.log(`   Código: ${coupon.code}`);
  console.log(`   Ativo: ${coupon.isActive}`);
  console.log(`   Usos registrados: ${coupon.usageCount}`);
  console.log(`   Max usos: ${coupon.maxUsage || 'Ilimitado'}`);
  console.log(`   Desconto: ${coupon.discount}`);
  console.log(`   Comissão: ${coupon.commission}`);
  console.log(`   AffiliateId: ${coupon.affiliateId || 'NÃO TEM!'}`);

  if (!coupon.affiliateId) {
    console.log('\n⚠️  PROBLEMA ENCONTRADO: Cupom não tem affiliateId associado!');
    console.log('   Isso significa que o cupom não está vinculado a nenhum afiliado.');
    return;
  }

  const affiliate = coupon.affiliate;
  if (!affiliate) {
    console.log('\n⚠️  PROBLEMA ENCONTRADO: Afiliado não encontrado!');
    return;
  }

  console.log('\n👤 Informações do Afiliado:');
  console.log(`   ID: ${affiliate.id}`);
  console.log(`   UserId: ${affiliate.userId}`);
  console.log(`   Email: ${affiliate.user?.email}`);
  console.log(`   Telegram: ${affiliate.user?.telegram}`);
  console.log(`   Saldo: R$ ${affiliate.balance.toFixed(2)}`);
  console.log(`   Pendente: R$ ${affiliate.pendingBalance.toFixed(2)}`);
  console.log(`   Total ganho: R$ ${affiliate.totalEarned.toFixed(2)}`);

  // 2. Buscar usos do cupom
  const couponUsages = await prisma.couponUsage.findMany({
    where: { couponId: coupon.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n📊 Usos do Cupom: ${couponUsages.length}`);
  
  for (const usage of couponUsages) {
    console.log(`\n   Uso #${usage.id}:`);
    console.log(`   Data: ${usage.createdAt.toLocaleString('pt-BR')}`);
    console.log(`   Usuário: ${usage.userEmail} (${usage.user?.name || 'N/A'})`);
    console.log(`   BoletoId: ${usage.boletoId || 'N/A'}`);
    console.log(`   DepixOrderId: ${usage.depixOrderId || 'N/A'}`);

    // Verificar se há transação de comissão
    let transaction = null;
    
    if (usage.boletoId) {
      transaction = await prisma.affiliateTransaction.findFirst({
        where: {
          affiliateId: affiliate.id,
          boletoId: usage.boletoId
        },
        include: {
          boleto: {
            select: {
              id: true,
              amount: true,
              fee: true,
              totalAmount: true,
              status: true
            }
          }
        }
      });

      if (transaction) {
        console.log(`   ✅ Transação encontrada:`);
        console.log(`      Status: ${transaction.status}`);
        console.log(`      Comissão: R$ ${transaction.commission.toFixed(2)}`);
        console.log(`      Boleto Status: ${transaction.boleto?.status}`);
        console.log(`      Boleto Valor: R$ ${transaction.boleto?.amount.toFixed(2)}`);
        console.log(`      Boleto Taxa: R$ ${transaction.boleto?.fee.toFixed(2)}`);
      } else {
        console.log(`   ❌ NENHUMA TRANSAÇÃO ENCONTRADA para este uso!`);
        
        // Verificar se o boleto existe e seu status
        const boleto = await prisma.boleto.findUnique({
          where: { id: usage.boletoId },
          select: {
            id: true,
            amount: true,
            fee: true,
            totalAmount: true,
            status: true,
            affiliateId: true,
            couponId: true,
            createdAt: true
          }
        });

        if (boleto) {
          console.log(`   📄 Boleto encontrado:`);
          console.log(`      Status: ${boleto.status}`);
          console.log(`      Valor: R$ ${boleto.amount.toFixed(2)}`);
          console.log(`      Taxa: R$ ${boleto.fee.toFixed(2)}`);
          console.log(`      AffiliateId no boleto: ${boleto.affiliateId || 'NÃO TEM!'}`);
          console.log(`      CouponId no boleto: ${boleto.couponId || 'NÃO TEM!'}`);
          
          if (boleto.status !== 'PAID') {
            console.log(`   ⚠️  Boleto ainda não foi aprovado (status: ${boleto.status})`);
          }
          
          if (!boleto.affiliateId) {
            console.log(`   ⚠️  PROBLEMA: Boleto não tem affiliateId!`);
          }
        } else {
          console.log(`   ⚠️  Boleto não encontrado no banco!`);
        }
      }
    } else if (usage.depixOrderId) {
      transaction = await prisma.affiliateTransaction.findFirst({
        where: {
          affiliateId: affiliate.id,
          depixOrderId: usage.depixOrderId as any
        }
      });

      if (transaction) {
        console.log(`   ✅ Transação Depix encontrada:`);
        console.log(`      Status: ${transaction.status}`);
        console.log(`      Comissão: R$ ${transaction.commission.toFixed(2)}`);
      } else {
        console.log(`   ❌ NENHUMA TRANSAÇÃO ENCONTRADA para este uso Depix!`);
        
        // Verificar se o DepixOrder existe e seu status (buscar por orderId, não id)
        const depixOrder = await (prisma as any).depixOrder.findFirst({
          where: { orderId: usage.depixOrderId },
          select: {
            id: true,
            orderId: true,
            amount: true,
            totalToPay: true,
            status: true,
            affiliateId: true,
            couponId: true,
            createdAt: true
          }
        });

        if (depixOrder) {
          console.log(`   💰 DepixOrder encontrado:`);
          console.log(`      Status: ${depixOrder.status}`);
          console.log(`      Valor: R$ ${depixOrder.totalToPay?.toFixed(2) || depixOrder.amount?.toFixed(2) || '0.00'}`);
          console.log(`      Amount: ${depixOrder.amount} DPX`);
          console.log(`      AffiliateId no DepixOrder: ${depixOrder.affiliateId || 'NÃO TEM!'}`);
          console.log(`      CouponId no DepixOrder: ${depixOrder.couponId || 'NÃO TEM!'}`);
          
          if (depixOrder.status !== 'depix_sent') {
            console.log(`   ⚠️  DepixOrder ainda não foi confirmado (status: ${depixOrder.status})`);
          }
          
          if (!depixOrder.affiliateId) {
            console.log(`   ⚠️  PROBLEMA: DepixOrder não tem affiliateId!`);
          }
        } else {
          console.log(`   ⚠️  DepixOrder não encontrado no banco!`);
        }
      }
    } else {
      // Pode ser recarga
      console.log(`   ℹ️  Uso sem boletoId ou depixOrderId (pode ser recarga)`);
    }
  }

  // 3. Buscar todas as transações do afiliado
  const allTransactions = await prisma.affiliateTransaction.findMany({
    where: { affiliateId: affiliate.id },
    include: {
      boleto: { select: { id: true, amount: true, status: true } },
      mobileRecharge: { select: { id: true, amount: true, status: true } },
      depixOrder: { select: { id: true, amount: true, status: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\n💰 Todas as Transações do Afiliado: ${allTransactions.length}`);
  allTransactions.forEach((tx, idx) => {
    console.log(`\n   Transação #${idx + 1}:`);
    console.log(`   ID: ${tx.id}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   Comissão: R$ ${tx.commission.toFixed(2)}`);
    console.log(`   Criada em: ${tx.createdAt.toLocaleString('pt-BR')}`);
    if (tx.boleto) {
      console.log(`   Tipo: Boleto (${tx.boleto.status})`);
    } else if (tx.mobileRecharge) {
      console.log(`   Tipo: Recarga (${tx.mobileRecharge.status})`);
    } else if (tx.depixOrder) {
      console.log(`   Tipo: Depix (${tx.depixOrder.status})`);
    }
  });

  console.log('\n✅ Diagnóstico concluído!\n');
}

// Executar
const couponCode = process.argv[2];
if (!couponCode) {
  console.error('Uso: npx ts-node scripts/diagnose-affiliate-commission.ts <CODIGO_DO_CUPOM>');
  process.exit(1);
}

diagnoseAffiliateCommission(couponCode)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
  });
