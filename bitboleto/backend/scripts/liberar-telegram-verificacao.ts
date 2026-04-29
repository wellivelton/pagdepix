/**
 * Libera usuários antigos: marca telegramVerified = true para quem ainda não está.
 * Use quando a verificação do Telegram estiver desativada e você quiser que
 * todos os usuários existentes acessem sem precisar verificar.
 *
 * Uso (na pasta backend):
 *   npx ts-node scripts/liberar-telegram-verificacao.ts
 *
 * Requer DATABASE_URL no .env.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    where: { telegramVerified: false },
    data: { telegramVerified: true },
  });

  console.log(`✅ ${result.count} usuário(s) atualizado(s): telegramVerified = true`);
  console.log('Usuários antigos agora podem acessar o sistema sem verificar Telegram.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
