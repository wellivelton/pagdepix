/**
 * Script de Diagnóstico: Verificar estado dos pagamentos de comércio
 * 
 * Este script verifica:
 * - Quantos pagamentos de comércio existem
 * - Quantos têm grossAmount preenchido
 * - Quantos têm status depix_sent
 * - Se grossAmount está correto (deve ser igual a totalToPay)
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function diagnoseCommercePayments() {
  console.log('🔍 Diagnóstico de pagamentos de comércio...\n');

  try {
    // Buscar TODOS os pagamentos de comércio
    const allCommerceOrders = await prisma.depixOrder.findMany({
      where: {
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      select: {
        id: true,
        status: true,
        amount: true,
        totalToPay: true,
        grossAmount: true,
        fixedFeePaid: true,
        variableFeePaid: true,
        createdAt: true,
        commerceLinkId: true,
        commercePageId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 Total de pagamentos de comércio encontrados: ${allCommerceOrders.length}\n`);

    if (allCommerceOrders.length === 0) {
      console.log('✅ Nenhum pagamento de comércio encontrado!');
      return;
    }

    // Separar por status
    const confirmed = allCommerceOrders.filter(o => o.status === 'depix_sent');
    const pending = allCommerceOrders.filter(o => o.status !== 'depix_sent');
    
    console.log(`   - Confirmados (depix_sent): ${confirmed.length}`);
    console.log(`   - Pendentes/Outros: ${pending.length}\n`);

    // Verificar grossAmount
    const withGrossAmount = allCommerceOrders.filter(o => o.grossAmount !== null && o.grossAmount !== undefined);
    const withoutGrossAmount = allCommerceOrders.filter(o => o.grossAmount === null || o.grossAmount === undefined);
    
    console.log(`📋 Estado do campo grossAmount:`);
    console.log(`   - Com grossAmount preenchido: ${withGrossAmount.length}`);
    console.log(`   - Sem grossAmount: ${withoutGrossAmount.length}\n`);

    // Verificar se grossAmount está correto (deve ser igual a totalToPay)
    const incorrectGrossAmount = withGrossAmount.filter(o => {
      const expectedGrossAmount = o.totalToPay || o.amount || 0;
      return Math.abs((o.grossAmount || 0) - expectedGrossAmount) > 0.01; // Tolerância de 1 centavo
    });

    console.log(`⚠️  Pagamentos com grossAmount incorreto: ${incorrectGrossAmount.length}`);
    if (incorrectGrossAmount.length > 0) {
      console.log(`\n   Exemplos de pagamentos com grossAmount incorreto:`);
      incorrectGrossAmount.slice(0, 5).forEach((o, idx) => {
        console.log(`   ${idx + 1}. ID: ${o.id}`);
        console.log(`      Status: ${o.status}`);
        console.log(`      totalToPay: ${o.totalToPay}`);
        console.log(`      amount: ${o.amount}`);
        console.log(`      grossAmount (atual): ${o.grossAmount}`);
        console.log(`      grossAmount (esperado): ${o.totalToPay || o.amount || 0}`);
        console.log(`      fixedFeePaid: ${o.fixedFeePaid}`);
        console.log(`      variableFeePaid: ${o.variableFeePaid}`);
        console.log('');
      });
    }

    // Verificar pagamentos confirmados sem grossAmount
    const confirmedWithoutGrossAmount = confirmed.filter(o => o.grossAmount === null || o.grossAmount === undefined);
    console.log(`\n🚨 Pagamentos CONFIRMADOS sem grossAmount: ${confirmedWithoutGrossAmount.length}`);
    if (confirmedWithoutGrossAmount.length > 0) {
      console.log(`   Estes pagamentos não aparecerão no dashboard!`);
      console.log(`\n   Exemplos:`);
      confirmedWithoutGrossAmount.slice(0, 5).forEach((o, idx) => {
        console.log(`   ${idx + 1}. ID: ${o.id}`);
        console.log(`      totalToPay: ${o.totalToPay}`);
        console.log(`      amount: ${o.amount}`);
        console.log(`      createdAt: ${o.createdAt}`);
        console.log('');
      });
    }

    // Resumo final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO:');
    console.log('='.repeat(60));
    console.log(`Total de pagamentos de comércio: ${allCommerceOrders.length}`);
    console.log(`   - Confirmados (depix_sent): ${confirmed.length}`);
    console.log(`   - Pendentes: ${pending.length}`);
    console.log(`\nEstado do grossAmount:`);
    console.log(`   - Preenchido: ${withGrossAmount.length}`);
    console.log(`   - Vazio: ${withoutGrossAmount.length}`);
    console.log(`   - Incorreto: ${incorrectGrossAmount.length}`);
    console.log(`\n⚠️  Pagamentos confirmados sem grossAmount: ${confirmedWithoutGrossAmount.length}`);
    console.log('='.repeat(60) + '\n');

  } catch (error: any) {
    console.error('❌ Erro no diagnóstico:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

diagnoseCommercePayments()
  .then(() => {
    console.log('✨ Diagnóstico concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro ao executar diagnóstico:', error);
    process.exit(1);
  });
