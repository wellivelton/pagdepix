/**
 * Seed do banco: cria o usuário ADMIN inicial (se não existir).
 * Configure no .env: ADMIN_EMAIL, ADMIN_NAME, ADMIN_TELEGRAM, ADMIN_PASSWORD
 * Depois rode: npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@pagdepix.com';
  const name = process.env.ADMIN_NAME || 'Administrador';
  const telegram = process.env.ADMIN_TELEGRAM || '@admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    console.log('Usuário admin já existe:', email);
    if (existing.role !== 'ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          emailVerified: true,
          telegramVerified: true,
        },
      });
      console.log('Usuário atualizado para role ADMIN e verificado.');
    }
    return;
  }

  const telegramFormatted = telegram.startsWith('@') ? telegram : `@${telegram}`;
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      telegram: telegramFormatted,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      isBlocked: false,
      emailVerified: true,
      telegramVerified: true,
      dailyLimit: 999999,
    },
  });

  console.log('Usuário ADMIN criado com sucesso.');
  console.log('Email:', email);
  console.log('Telegram:', telegramFormatted);
  console.log('Faça login e troque a senha nas configurações.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
