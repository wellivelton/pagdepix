import { prisma } from '../prisma';

/**
 * Reseta o campo usedToday de todos os ApiEndUserLimit cujo lastUsageDate != hoje.
 * Deve ser chamado uma vez por dia (ex: cron às 00:00).
 *
 * O middleware checkEndUserDailyLimit já faz reset lazy (ao primeiro acesso do dia),
 * mas esta função garante consistência nos relatórios mesmo para usuários inativos.
 */
export async function resetApiEndUserDailyLimits(): Promise<void> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const result = await prisma.apiEndUserLimit.updateMany({
    where: { lastUsageDate: { not: today } },
    data: { usedToday: 0, lastUsageDate: today },
  });

  if (result.count > 0) {
    console.log(`[resetApiEndUserLimits] Reset diário: ${result.count} registros resetados (${today})`);
  }
}

/**
 * Reseta o campo usedThisMonth de todos os ApiEndUserLimit cujo monthResetDate != mês atual.
 * Deve ser chamado no primeiro dia de cada mês (ex: cron no dia 1 às 00:05).
 */
export async function resetApiEndUserMonthlyLimits(): Promise<void> {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  const result = await prisma.apiEndUserLimit.updateMany({
    where: { monthResetDate: { not: currentMonth } },
    data: { usedThisMonth: 0, monthResetDate: currentMonth },
  });

  if (result.count > 0) {
    console.log(`[resetApiEndUserLimits] Reset mensal: ${result.count} registros resetados (${currentMonth})`);
  }
}
