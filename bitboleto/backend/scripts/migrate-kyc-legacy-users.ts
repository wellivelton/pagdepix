/**
 * Script de migração KYC para usuários antigos
 * - Nome: valida o nome existente; só marca nameVerified = true se passar na validação
 * - E-mail e Telegram: mantém como estão
 * - Usuários com nameVerified = false após migração: nome inválido (precisarão corrigir)
 */

import { PrismaClient } from '@prisma/client';
import { validateFullName } from '../src/utils/validation/nameValidation';

const prisma = new PrismaClient();

async function main() {
  console.log('[KYC Migration] Iniciando migração de usuários legados...');

  const users = await prisma.user.findMany({
    where: { nameVerified: false },
    select: { id: true, name: true, email: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const result = validateFullName(user.name);
    if (result.valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { nameVerified: true },
      });
      updated++;
    } else {
      console.log(`[KYC Migration] Usuário ${user.id} (${user.email}): nome inválido - ${result.error}`);
      skipped++;
    }
  }

  console.log(`[KYC Migration] ${updated} usuário(s) atualizado(s) com nameVerified = true.`);
  if (skipped > 0) {
    console.log(`[KYC Migration] ${skipped} usuário(s) com nome inválido mantidos com nameVerified = false.`);
  }
  console.log('[KYC Migration] Usuários com emailVerified = false precisarão verificar e-mail na tela KYC.');
  console.log('[KYC Migration] Concluído.');
}

main()
  .catch((e) => {
    console.error('[KYC Migration] Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
