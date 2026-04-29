/**
 * Script de Diagnóstico: Verificar pagamentos do modo comércio
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function checkCommercePayments() {
  console.log('🔍 Verificando pagamentos do modo comércio...\n');

  try {
    // 1. Total de pagamentos confirmados do modo comércio
    const allCommerceOrders = await prisma.depixOrder.findMany({
      where: {
        status: 'depix_sent',
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      select: {
        id: true,
        amount: true,
        totalToPay: true,
        grossAmount: true,
        fixedFeePaid: true,
        variableFeePaid: true,
        pagdepixProfit: true,
        swapverseFee: true,
        commerceLinkId: true,
        commercePageId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 Total de pagamentos confirmados do modo comércio: ${allCommerceOrders.length}\n`);

    if (allCommerceOrders.length === 0) {
      console.log('⚠️  Nenhum pagamento encontrado!');
      console.log('\nVerificando se há pagamentos pendentes...\n');
      
      const pendingOrders = await prisma.depixOrder.findMany({
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
          commerceLinkId: true,
          commercePageId: true,
          createdAt: true,
        },
        take: 10,
      });

      console.log(`📋 Pagamentos pendentes encontrados: ${pendingOrders.length}`);
      if (pendingOrders.length > 0) {
        console.log('\nPrimeiros pagamentos:');
        pendingOrders.forEach((o, i) => {
          console.log(`  ${i + 1}. ID: ${o.id.substring(0, 8)}... | Status: ${o.status} | Amount: R$ ${o.amount} | Link: ${o.commerceLinkId ? 'Sim' : 'Não'} | Page: ${o.commercePageId ? 'Sim' : 'Não'}`);
        });
      }
      return;
    }

    // 2. Separar por status de migração
    const withGrossAmount = allCommerceOrders.filter(o => o.grossAmount !== null);
    const withoutGrossAmount = allCommerceOrders.filter(o => o.grossAmount === null);

    console.log(`✅ Com grossAmount preenchido: ${withGrossAmount.length}`);
    console.log(`❌ Sem grossAmount (precisam migração): ${withoutGrossAmount.length}\n`);

    // 3. Mostrar alguns exemplos
    if (withoutGrossAmount.length > 0) {
      console.log('📋 Exemplos de pagamentos que precisam migração:');
      withoutGrossAmount.slice(0, 5).forEach((o, i) => {
        console.log(`\n  ${i + 1}. ID: ${o.id.substring(0, 8)}...`);
        console.log(`     Amount: R$ ${o.amount}`);
        console.log(`     TotalToPay: R$ ${o.totalToPay}`);
        console.log(`     Link: ${o.commerceLinkId ? 'Sim' : 'Não'}`);
        console.log(`     Page: ${o.commercePageId ? 'Sim' : 'Não'}`);
        console.log(`     Data: ${o.createdAt.toLocaleString('pt-BR')}`);
      });
    }

    if (withGrossAmount.length > 0) {
      console.log('\n📋 Exemplos de pagamentos já migrados:');
      withGrossAmount.slice(0, 3).forEach((o, i) => {
        console.log(`\n  ${i + 1}. ID: ${o.id.substring(0, 8)}...`);
        console.log(`     GrossAmount: R$ ${o.grossAmount}`);
        console.log(`     FixedFeePaid: R$ ${o.fixedFeePaid}`);
        console.log(`     VariableFeePaid: R$ ${o.variableFeePaid}`);
        console.log(`     PagDepixProfit: R$ ${o.pagdepixProfit}`);
      });
    }

    // 4. Verificar se há algum problema com a query
    console.log('\n🔍 Verificando query alternativa...\n');
    
    const alternativeQuery = await prisma.depixOrder.findMany({
      where: {
        status: 'depix_sent',
      },
      select: {
        id: true,
        commerceLinkId: true,
        commercePageId: true,
        grossAmount: true,
      },
    });

    const commerceLinks = alternativeQuery.filter(o => o.commerceLinkId !== null);
    const commercePages = alternativeQuery.filter(o => o.commercePageId !== null);
    const withoutFields = alternativeQuery.filter(o => o.grossAmount === null && (o.commerceLinkId !== null || o.commercePageId !== null));

    console.log(`Total pagamentos confirmados: ${alternativeQuery.length}`);
    console.log(`Com commerceLinkId: ${commerceLinks.length}`);
    console.log(`Com commercePageId: ${commercePages.length}`);
    console.log(`Sem grossAmount mas com commerceLink/Page: ${withoutFields.length}`);

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkCommercePayments()
  .then(() => {
    console.log('\n✨ Diagnóstico concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro ao executar diagnóstico:', error);
    process.exit(1);
  });
