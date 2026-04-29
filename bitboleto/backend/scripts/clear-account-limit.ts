/**
 * Script para liberar o limite de contas por IP (uso em testes/admin).
 * Remove registros de AccountCreation do IP informado para permitir novo cadastro.
 *
 * Uso na VPS:
 *   cd ~/bitboleto/backend
 *   npx ts-node scripts/clear-account-limit.ts SEU_IP
 *   # ou
 *   IP_TO_CLEAR=SEU_IP npx ts-node scripts/clear-account-limit.ts
 *
 * Exemplo: npx ts-node scripts/clear-account-limit.ts 95.111.233.16
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const ip = process.env.IP_TO_CLEAR || process.argv[2];
  if (!ip || !ip.trim()) {
    console.error('Informe o IP: npx ts-node scripts/clear-account-limit.ts SEU_IP');
    process.exit(1);
  }

  const result = await prisma.accountCreation.deleteMany({
    where: { ip: ip.trim() }
  });

  console.log(`Removidos ${result.count} registro(s) de criação de conta para o IP: ${ip.trim()}`);
  console.log('Agora você pode criar uma nova conta a partir desse IP.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
