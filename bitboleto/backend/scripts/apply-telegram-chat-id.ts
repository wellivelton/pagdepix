/**
 * Adiciona a coluna User.telegramChatId e DepixOrder.telegramNotifiedAt no banco.
 * Usa a mesma conexão do .env. Rodar: npm run apply-telegram-column
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Aplicando colunas telegramChatId e telegramNotifiedAt...\n');
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramChatId" TEXT
    `);
    console.log('OK: User.telegramChatId');
  } catch (e: any) {
    if (e?.message?.includes('already exists')) console.log('User.telegramChatId já existe.');
    else throw e;
  }
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "DepixOrder" ADD COLUMN IF NOT EXISTS "telegramNotifiedAt" TIMESTAMP(3)
    `);
    console.log('OK: DepixOrder.telegramNotifiedAt');
  } catch (e: any) {
    if (e?.message?.includes('already exists')) console.log('DepixOrder.telegramNotifiedAt já existe.');
    else throw e;
  }
  console.log('\nConcluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
