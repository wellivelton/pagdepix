const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Djwml@1998', 10); // sua senha antiga

  const admin = await prisma.user.create({
    data: {
      email: 'playrecargas@proton.me', // seu email antigo
      password: passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('Admin criado com sucesso:', admin);
}

main()
  .catch((e) => {
    console.error('Erro ao criar admin:', e);
  })
  .finally(() => prisma.$disconnect());

