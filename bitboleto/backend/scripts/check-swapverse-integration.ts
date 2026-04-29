/**
 * Script de Diagnóstico: Verificar integração com SwapVerse
 *
 * Este script verifica:
 * 1. Se as variáveis de ambiente estão configuradas
 * 2. Se consegue conectar com a API da SwapVerse
 * 3. Status dos últimos pedidos na SwapVerse
 * 4. Compara status no banco vs SwapVerse
 *
 * Uso:
 *   cd backend
 *   npm run check-swapverse
 *   ou
 *   npx ts-node scripts/check-swapverse-integration.ts
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { getDepixOrderStatus } from '../src/services/swapverse';

// Carregar variáveis de ambiente
dotenv.config();

const prisma = new PrismaClient();

async function checkSwapVerseIntegration() {
  console.log('🔍 Verificando integração com SwapVerse...\n');

  // 1. Verificar variáveis de ambiente
  const swapverseUrl = process.env.SWAPVERSE_API_URL;
  const swapverseToken = process.env.SWAPVERSE_ACCESS_TOKEN;

  console.log('📋 Variáveis de Ambiente:');
  console.log(`   SWAPVERSE_API_URL: ${swapverseUrl ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}`);
  console.log(`   SWAPVERSE_ACCESS_TOKEN: ${swapverseToken ? '✅ Configurado' : '❌ NÃO CONFIGURADO'}\n`);

  if (!swapverseUrl || !swapverseToken) {
    console.log('❌ Variáveis de ambiente não configuradas!');
    return;
  }

  // 2. Buscar últimos pedidos de comércio no banco
  const commerceOrders = await prisma.depixOrder.findMany({
    where: {
      OR: [
        { commerceLinkId: { not: null } },
        { commercePageId: { not: null } },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
    select: {
      id: true,
      orderId: true,
      status: true,
      createdAt: true,
      commerceLinkId: true,
      commercePageId: true,
    },
  });

  console.log(`📊 Encontrados ${commerceOrders.length} pedidos de comércio (últimos 10)\n`);

  if (commerceOrders.length === 0) {
    console.log('✅ Nenhum pedido de comércio encontrado para verificar.');
    return;
  }

  // 3. Verificar status de cada pedido na SwapVerse
  console.log('🔄 Verificando status na SwapVerse...\n');

  let statusMismatches = 0;
  let connectionErrors = 0;
  let notFoundErrors = 0;

  for (const order of commerceOrders) {
    try {
      const result = await getDepixOrderStatus(order.orderId);

      if (!result.success) {
        if (result.error?.includes('não encontrado') || result.error?.includes('not found')) {
          notFoundErrors++;
          console.log(`⚠️  Pedido ${order.orderId.substring(0, 20)}...`);
          console.log(`   Status no banco: ${order.status}`);
          console.log(`   Status SwapVerse: ❌ NÃO ENCONTRADO`);
          console.log(`   Erro: ${result.error}\n`);
        } else {
          connectionErrors++;
          console.log(`❌ Erro ao consultar pedido ${order.orderId.substring(0, 20)}...`);
          console.log(`   Erro: ${result.error}\n`);
        }
        continue;
      }

      const swapverseStatus = result.order?.status || 'unknown';
      const dbStatus = order.status;

      if (swapverseStatus !== dbStatus) {
        statusMismatches++;
        console.log(`⚠️  DESCOMPASSO ENCONTRADO:`);
        console.log(`   OrderId: ${order.orderId}`);
        console.log(`   Status no banco: ${dbStatus}`);
        console.log(`   Status SwapVerse: ${swapverseStatus}`);
        console.log(`   Criado em: ${order.createdAt.toISOString()}\n`);
      } else {
        console.log(`✅ Pedido ${order.orderId.substring(0, 20)}... - Status: ${dbStatus}`);
      }
    } catch (error: any) {
      connectionErrors++;
      console.error(`❌ Erro ao processar pedido ${order.orderId}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO:');
  console.log('='.repeat(60));
  console.log(`Total de pedidos verificados: ${commerceOrders.length}`);
  console.log(`Descompassos encontrados: ${statusMismatches}`);
  console.log(`Erros de conexão: ${connectionErrors}`);
  console.log(`Pedidos não encontrados na SwapVerse: ${notFoundErrors}`);
  console.log('='.repeat(60) + '\n');

  if (statusMismatches > 0) {
    console.log('💡 RECOMENDAÇÃO:');
    console.log('   Os pedidos com descompasso precisam ser atualizados.');
    console.log('   O polling do frontend deve atualizar automaticamente quando detectar mudança.');
    console.log('   Você também pode rodar o script de migração para corrigir dados históricos.\n');
  }

  if (connectionErrors > 0) {
    console.log('⚠️  ATENÇÃO:');
    console.log('   Há erros de conexão com a SwapVerse.');
    console.log('   Verifique se a URL e o token estão corretos.\n');
  }
}

// Executar verificação
checkSwapVerseIntegration()
  .then(() => {
    console.log('✨ Verificação concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro ao executar verificação:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
