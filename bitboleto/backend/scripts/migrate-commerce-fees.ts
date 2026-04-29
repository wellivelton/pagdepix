/**
 * Script de Migração: Preencher/corrigir campos discriminados de taxas para pagamentos do modo comércio
 * 
 * Este script:
 * 1. Busca TODOS os pagamentos do modo comércio
 * 2. Verifica se grossAmount está correto (deve ser igual a totalToPay)
 * 3. Corrige pagamentos com grossAmount incorreto ou vazio
 * 4. Calcula taxas para pagamentos confirmados
 * 
 * Uso:
 *   cd backend
 *   npm run migrate-commerce-fees
 *   ou
 *   npx ts-node scripts/migrate-commerce-fees.ts
 */

/// <reference types="node" />

import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Carregar variáveis de ambiente
dotenv.config();

const prisma = new PrismaClient();

async function migrateCommerceFees() {
  console.log('🚀 Iniciando migração/correção de dados de taxas do modo comércio...\n');

  try {
    // Buscar TODOS os pagamentos do modo comércio (não apenas os sem grossAmount)
    const orders = await prisma.depixOrder.findMany({
      where: {
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`📊 Encontrados ${orders.length} pagamentos do modo comércio\n`);

    if (orders.length === 0) {
      console.log('✅ Nenhum pagamento de comércio encontrado!');
      return;
    }

    // Separar por status
    const confirmedOrders = orders.filter(o => o.status === 'depix_sent');
    const pendingOrders = orders.filter(o => o.status !== 'depix_sent');
    
    console.log(`   - Confirmados (depix_sent): ${confirmedOrders.length}`);
    console.log(`   - Pendentes/Outros: ${pendingOrders.length}\n`);

    let migrated = 0;
    let corrected = 0;
    let errors = 0;

    for (const order of orders) {
      try {
        // IMPORTANTE: Para pagamentos antigos, usar totalToPay como grossAmount (valor que o cliente pagou)
        // Na lógica antiga, totalToPay era o valor que o cliente pagava (com taxas incluídas)
        // Com a nova lógica, totalToPay = grossAmount (sem taxas)
        // Então assumimos que totalToPay antigo era o valor que o cliente pagou
        const expectedGrossAmount = order.totalToPay || order.amount || 0;

        if (expectedGrossAmount <= 0) {
          console.log(`⚠️  Pulando ordem ${order.id}: valor inválido (${expectedGrossAmount})`);
          continue;
        }

        // Verificar se grossAmount precisa ser corrigido
        const currentGrossAmount = order.grossAmount;
        const needsCorrection = 
          currentGrossAmount === null || 
          currentGrossAmount === undefined ||
          Math.abs((currentGrossAmount || 0) - expectedGrossAmount) > 0.01; // Tolerância de 1 centavo

        if (!needsCorrection) {
          // Já está correto, pular
          continue;
        }

        const grossAmount = expectedGrossAmount;

        // Para pagamentos confirmados, calcular todas as taxas
        // Para pagamentos pendentes, apenas preencher o grossAmount (taxas serão calculadas quando confirmar)
        const isConfirmed = order.status === 'depix_sent';
        
        let fixedFeePaid: number | null = null;
        let variableFeePaid: number | null = null;
        let pagdepixProfit: number | null = null;
        let swapverseFee: number | null = null;

        if (isConfirmed) {
          // Calcular taxas baseado na nova estrutura:
          // - Taxa fixa: R$ 0,99
          // - Taxa variável: 0,5% do valor bruto
          //   - Subdivisão: 0,3% PagDepix + 0,2% SwapVerse
          fixedFeePaid = 0.99;
          variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100; // 0,5%
          pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100; // 0,3%
          swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100; // 0,2%
        }

        // Atualizar o registro
        await prisma.depixOrder.update({
          where: { id: order.id },
          data: {
            grossAmount,
            fixedFeePaid,
            variableFeePaid,
            pagdepixProfit,
            swapverseFee,
          },
        });

        if (currentGrossAmount === null || currentGrossAmount === undefined) {
          migrated++;
        } else {
          corrected++;
        }
        
        const statusLabel = isConfirmed ? 'confirmados' : 'pendentes';
        const actionLabel = currentGrossAmount === null || currentGrossAmount === undefined ? 'migrados' : 'corrigidos';
        if ((migrated + corrected) % 10 === 0) {
          console.log(`✅ ${migrated + corrected}/${orders.length} pagamentos ${actionLabel} (${statusLabel})...`);
        }
      } catch (error: any) {
        errors++;
        console.error(`❌ Erro ao processar ordem ${order.id}:`, error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migração/Correção concluída!`);
    console.log(`   - Total processados: ${orders.length}`);
    console.log(`   - Novos migrados: ${migrated}`);
    console.log(`   - Corrigidos: ${corrected}`);
    console.log(`   - Total atualizados: ${migrated + corrected}`);
    console.log(`   - Erros: ${errors}`);
    console.log('\n💡 Nota: Pagamentos pendentes terão apenas grossAmount preenchido.');
    console.log('   As taxas serão calculadas automaticamente quando o pagamento for confirmado.');
    console.log('='.repeat(50) + '\n');

  } catch (error: any) {
    console.error('❌ Erro fatal na migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar migração
migrateCommerceFees()
  .then(() => {
    console.log('✨ Script finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro ao executar script:', error);
    process.exit(1);
  });
