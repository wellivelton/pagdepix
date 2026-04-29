require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const r1 = await prisma.user.updateMany({ data: { emailVerified: true } });
  console.log('emailVerified = true:', r1.count, 'usuários');

  const r2 = await prisma.user.updateMany({
    where: { role: { not: 'ADMIN' } },
    data: { telegramVerified: false },
  });
  console.log('telegramVerified = false (exceto ADMIN):', r2.count, 'usuários');

  const users = await prisma.user.findMany({
    select: { email: true, emailVerified: true, telegramVerified: true, role: true },
  });
  console.log('\nResultado:', users);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
