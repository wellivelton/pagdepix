/**
 * Script para recalcular totalPaid de cada usuário com base nos dados reais:
 *   soma(Boleto PAID totalAmount) + soma(MobileRecharge PAID totalAmount) + soma(DepixOrder depix_sent totalToPay)
 *
 * Útil para corrigir dados antigos após passar a somar recargas e Depix ao total processado.
 *
 * Uso:
 *   cd backend
 *   npx ts-node scripts/recalculate-total-paid.ts           # recalcula todos os usuários
 *   npx ts-node scripts/recalculate-total-paid.ts --dry-run  # só mostra o que seria atualizado
 *   npx ts-node scripts/recalculate-total-paid.ts USER_ID   # recalcula apenas um usuário
 */

/// <reference types="node" />

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2).filter((a: string) => !a.startsWith('--'));
const isDryRun = process.argv.includes('--dry-run');
// Só tratar como userId um argumento que pareça UUID (evita confundir com caminhos)
const singleUserId =
  args.length === 1 && /^[0-9a-f-]{36}$/i.test(args[0]) ? args[0] : undefined;

async function getCalculatedTotalPaid(userId: string): Promise<number> {
  const [boletosSum, rechargesSum, depixSum] = await Promise.all([
    prisma.boleto.aggregate({
      where: { userId, status: 'PAID' },
      _sum: { totalAmount: true },
    }),
    prisma.mobileRecharge.aggregate({
      where: { userId, status: 'PAID' },
      _sum: { totalAmount: true },
    }),
    prisma.depixOrder.aggregate({
      where: { userId, status: 'depix_sent' },
      _sum: { totalToPay: true },
    }),
  ]);

  const total =
    (boletosSum._sum.totalAmount ?? 0) +
    (rechargesSum._sum.totalAmount ?? 0) +
    (depixSum._sum.totalToPay ?? 0);
  return Math.round(total * 100) / 100;
}

async function main() {
  const userIds: string[] = singleUserId
    ? [singleUserId]
    : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  if (userIds.length === 0) {
    console.log('Nenhum usuário encontrado.');
    return;
  }

  console.log(isDryRun ? '[DRY-RUN] Nenhuma alteração será feita.\n' : 'Recalculando totalPaid...\n');

  let updated = 0;
  let unchanged = 0;

  for (const userId of userIds) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, totalPaid: true },
    });
    if (!user) {
      console.warn(`Usuário ${userId} não encontrado, ignorando.`);
      continue;
    }

    const calculated = await getCalculatedTotalPaid(userId);
    const current = user.totalPaid;

    if (Math.abs(calculated - current) < 0.01) {
      unchanged++;
      if (singleUserId || isDryRun) {
        console.log(`${user.email} (${user.name}): totalPaid já correto R$ ${current.toFixed(2)}`);
      }
      continue;
    }

    updated++;
    console.log(
      `${user.email} (${user.name}): R$ ${current.toFixed(2)} → R$ ${calculated.toFixed(2)}`
    );

    if (!isDryRun) {
      await prisma.user.update({
        where: { id: userId },
        data: { totalPaid: calculated },
      });
    }
  }

  console.log(
    `\nConcluído. ${updated} usuário(s) ${isDryRun ? 'seriam atualizados' : 'atualizados'}, ${unchanged} sem alteração.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
