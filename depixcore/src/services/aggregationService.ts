import { prisma } from '../prisma';
import { PagDepixEventType } from './eventCollector';

// ============================================================
// EVENTOS QUE REPRESENTAM TRANSAÇÕES APROVADAS (financeiramente)
// ============================================================
const APPROVED_EVENTS: PagDepixEventType[] = [
  'payment.approved',
  'recharge.completed',
  'charge.paid',
];

const REFUSED_EVENTS: PagDepixEventType[] = [
  'payment.refused',
  'recharge.refused',
];

// ============================================================
// UPDATE DAILY AGGREGATION
// Atualiza ou cria o registro de agregação do dia atual.
// Chamado após cada evento processado.
// ============================================================
export async function updateDailyAggregation(
  eventType: PagDepixEventType,
  data: {
    amount: number | null;
    fee: number | null;
    cost: number | null;
    netProfit: number | null;
    transactionType: string;
    isSandbox: boolean;
  }
): Promise<void> {
  const today = getTodayString();
  const source = 'pagdepix';

  const isApproved = APPROVED_EVENTS.includes(eventType);
  const isRefused = REFUSED_EVENTS.includes(eventType);

  // Incrementos financeiros (apenas em eventos aprovados e não sandbox)
  const financeIncrement = isApproved && !data.isSandbox
    ? {
        grossVolume: { increment: data.amount ?? 0 },
        totalFees: { increment: data.fee ?? 0 },
        estimatedCosts: { increment: data.cost ?? 0 },
        netProfit: { increment: data.netProfit ?? 0 },
      }
    : {};

  // Incrementos de contagem
  const countIncrement = {
    totalEvents: { increment: 1 },
    approvedCount: isApproved ? { increment: 1 } : { increment: 0 },
    refusedCount: isRefused ? { increment: 1 } : { increment: 0 },
    receivedCount: eventType === 'payment.received' ? { increment: 1 } : { increment: 0 },
    boletoCount: data.transactionType === 'boleto' && isApproved ? { increment: 1 } : { increment: 0 },
    rechargeCount: data.transactionType === 'recharge' && isApproved ? { increment: 1 } : { increment: 0 },
    chargeCount: data.transactionType === 'charge' && isApproved ? { increment: 1 } : { increment: 0 },
    sandboxCount: data.isSandbox ? { increment: 1 } : { increment: 0 },
    sandboxVolume: data.isSandbox && isApproved ? { increment: data.amount ?? 0 } : { increment: 0 },
  };

  await prisma.dailyAggregation.upsert({
    where: { date_source: { date: today, source } },
    update: {
      ...countIncrement,
      ...financeIncrement,
    },
    create: {
      date: today,
      source,
      totalEvents: 1,
      approvedCount: isApproved ? 1 : 0,
      refusedCount: isRefused ? 1 : 0,
      receivedCount: eventType === 'payment.received' ? 1 : 0,
      boletoCount: data.transactionType === 'boleto' && isApproved ? 1 : 0,
      rechargeCount: data.transactionType === 'recharge' && isApproved ? 1 : 0,
      chargeCount: data.transactionType === 'charge' && isApproved ? 1 : 0,
      grossVolume: isApproved && !data.isSandbox ? (data.amount ?? 0) : 0,
      totalFees: isApproved && !data.isSandbox ? (data.fee ?? 0) : 0,
      estimatedCosts: isApproved && !data.isSandbox ? (data.cost ?? 0) : 0,
      netProfit: isApproved && !data.isSandbox ? (data.netProfit ?? 0) : 0,
      sandboxCount: data.isSandbox ? 1 : 0,
      sandboxVolume: data.isSandbox && isApproved ? (data.amount ?? 0) : 0,
    },
  });
}

// ============================================================
// GET SUMMARY
// Retorna métricas consolidadas de todos os tempos ou por período.
// ============================================================
export async function getSummary(filters?: {
  startDate?: Date;
  endDate?: Date;
  includeSandbox?: boolean;
}): Promise<{
  totalTransactions: number;
  approvedCount: number;
  refusedCount: number;
  grossVolume: number;
  totalFees: number;
  estimatedCosts: number;
  netProfit: number;
  conversionRate: number;
  byType: { boleto: number; recharge: number; charge: number };
}> {
  const where: any = { isSandbox: filters?.includeSandbox ? undefined : false };

  if (filters?.startDate || filters?.endDate) {
    where.processedAt = {};
    if (filters.startDate) where.processedAt.gte = filters.startDate;
    if (filters.endDate) where.processedAt.lte = filters.endDate;
  }

  const approved = await prisma.eventProcessed.findMany({
    where: {
      ...where,
      eventType: { in: ['payment.approved', 'recharge.completed', 'charge.paid'] },
    },
    select: {
      amount: true,
      fee: true,
      cost: true,
      netProfit: true,
      transactionType: true,
    },
  });

  const refused = await prisma.eventProcessed.count({
    where: {
      ...where,
      eventType: { in: ['payment.refused', 'recharge.refused'] },
    },
  });

  const received = await prisma.eventProcessed.count({
    where: {
      ...where,
      eventType: 'payment.received',
    },
  });

  const grossVolume = approved.reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalFees = approved.reduce((s, e) => s + (e.fee ?? 0), 0);
  const estimatedCosts = approved.reduce((s, e) => s + (e.cost ?? 0), 0);
  const netProfit = approved.reduce((s, e) => s + (e.netProfit ?? 0), 0);

  const boletoCount = approved.filter((e) => e.transactionType === 'boleto').length;
  const rechargeCount = approved.filter((e) => e.transactionType === 'recharge').length;
  const chargeCount = approved.filter((e) => e.transactionType === 'charge').length;

  const totalTransactions = approved.length;
  const conversionRate = received > 0
    ? Math.round((approved.length / (approved.length + refused)) * 10000) / 100
    : 0;

  return {
    totalTransactions,
    approvedCount: approved.length,
    refusedCount: refused,
    grossVolume: round2(grossVolume),
    totalFees: round2(totalFees),
    estimatedCosts: round2(estimatedCosts),
    netProfit: round2(netProfit),
    conversionRate,
    byType: {
      boleto: boletoCount,
      recharge: rechargeCount,
      charge: chargeCount,
    },
  };
}

// ============================================================
// GET MONTHLY BREAKDOWN
// Retorna métricas agrupadas por mês.
// ============================================================
export async function getMonthlyBreakdown(months: number = 12): Promise<
  Array<{
    month: string;
    approvedCount: number;
    grossVolume: number;
    totalFees: number;
    netProfit: number;
    boletoCount: number;
    rechargeCount: number;
    chargeCount: number;
  }>
> {
  // Buscar agregações diárias dos últimos N meses
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startDateStr = toDateString(startDate);

  const aggregations = await prisma.dailyAggregation.findMany({
    where: {
      date: { gte: startDateStr },
    },
    orderBy: { date: 'asc' },
  });

  // Agrupar por mês (YYYY-MM)
  const monthMap = new Map<
    string,
    {
      approvedCount: number;
      grossVolume: number;
      totalFees: number;
      netProfit: number;
      boletoCount: number;
      rechargeCount: number;
      chargeCount: number;
    }
  >();

  for (const agg of aggregations) {
    const month = agg.date.substring(0, 7); // YYYY-MM
    const existing = monthMap.get(month) ?? {
      approvedCount: 0,
      grossVolume: 0,
      totalFees: 0,
      netProfit: 0,
      boletoCount: 0,
      rechargeCount: 0,
      chargeCount: 0,
    };

    monthMap.set(month, {
      approvedCount: existing.approvedCount + agg.approvedCount,
      grossVolume: existing.grossVolume + agg.grossVolume,
      totalFees: existing.totalFees + agg.totalFees,
      netProfit: existing.netProfit + agg.netProfit,
      boletoCount: existing.boletoCount + agg.boletoCount,
      rechargeCount: existing.rechargeCount + agg.rechargeCount,
      chargeCount: existing.chargeCount + agg.chargeCount,
    });
  }

  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    approvedCount: data.approvedCount,
    grossVolume: round2(data.grossVolume),
    totalFees: round2(data.totalFees),
    netProfit: round2(data.netProfit),
    boletoCount: data.boletoCount,
    rechargeCount: data.rechargeCount,
    chargeCount: data.chargeCount,
  }));
}

// ============================================================
// GET MONTHLY DETAIL
// Detalhamento mensal para geração do DAS (Simples Nacional).
// Retorna: resumo financeiro + por faixa de taxa + por tipo.
// ============================================================

/** Detecta a faixa de taxa a partir do valor do boleto */
function getTaxBracket(amount: number): string {
  if (amount < 50)  return '4%';
  if (amount < 100) return '3%';
  if (amount < 500) return '2.5%';
  return '2%';
}

export interface MonthlyDetailResult {
  month: string;
  summary: {
    totalTransactions: number;
    receitaBruta: number;
    custosEueln: number;
    receitaLiquida: number;
    margemLiquida: number;
    volumeTransacional: number;
    ticketMedio: number;
    refusedCount: number;
  };
  byBracket: Record<string, { count: number; receitaBruta: number; custosEueln: number; receitaLiquida: number; volume: number }>;
  byType: Record<string, { count: number; receitaBruta: number; custosEueln: number; receitaLiquida: number; volume: number }>;
}

export async function getMonthlyDetail(month: string): Promise<MonthlyDetailResult> {
  // month = 'YYYY-MM'
  const startDate = new Date(`${month}-01T00:00:00.000Z`);
  const endDate   = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const APPROVED = ['payment.approved', 'recharge.completed', 'charge.paid'] as const;
  const REFUSED  = ['payment.refused', 'recharge.refused'] as const;

  const [approved, refused] = await Promise.all([
    prisma.eventProcessed.findMany({
      where: {
        processedAt: { gte: startDate, lt: endDate },
        eventType: { in: [...APPROVED] },
        isSandbox: false,
      },
      select: {
        transactionType: true, amount: true, fee: true,
        cost: true, netProfit: true,
      },
    }),
    prisma.eventProcessed.count({
      where: {
        processedAt: { gte: startDate, lt: endDate },
        eventType: { in: [...REFUSED] },
        isSandbox: false,
      },
    }),
  ]);

  const receitaBruta       = round2(approved.reduce((s, e) => s + (e.fee ?? 0), 0));
  const custosEueln        = round2(approved.reduce((s, e) => s + (e.cost ?? 0), 0));
  const receitaLiquida     = round2(approved.reduce((s, e) => s + (e.netProfit ?? 0), 0));
  const volumeTransacional = round2(approved.reduce((s, e) => s + (e.amount ?? 0), 0));
  const totalTransactions  = approved.length;
  const ticketMedio        = totalTransactions > 0 ? round2(volumeTransacional / totalTransactions) : 0;
  const margemLiquida      = receitaBruta > 0 ? round2((receitaLiquida / receitaBruta) * 100) : 0;

  // Por faixa de taxa
  const byBracket: MonthlyDetailResult['byBracket'] = {
    '4%':   { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    '3%':   { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    '2.5%': { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    '2%':   { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    'N/A':  { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
  };

  // Por tipo
  const byType: MonthlyDetailResult['byType'] = {
    boleto:   { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    recharge: { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
    charge:   { count: 0, receitaBruta: 0, custosEueln: 0, receitaLiquida: 0, volume: 0 },
  };

  for (const e of approved) {
    const fee    = e.fee ?? 0;
    const cost   = e.cost ?? 0;
    const profit = e.netProfit ?? 0;
    const vol    = e.amount ?? 0;

    // Bracket (apenas boletos têm faixa de taxa)
    const bracketKey = e.transactionType === 'boleto' && vol > 0
      ? getTaxBracket(vol) : 'N/A';
    byBracket[bracketKey].count++;
    byBracket[bracketKey].receitaBruta  += fee;
    byBracket[bracketKey].custosEueln   += cost;
    byBracket[bracketKey].receitaLiquida += profit;
    byBracket[bracketKey].volume        += vol;

    // Type
    const typeKey = e.transactionType in byType ? e.transactionType : 'charge';
    byType[typeKey].count++;
    byType[typeKey].receitaBruta  += fee;
    byType[typeKey].custosEueln   += cost;
    byType[typeKey].receitaLiquida += profit;
    byType[typeKey].volume        += vol;
  }

  // Arredondar todos os sub-totais
  for (const k of Object.keys(byBracket)) {
    byBracket[k].receitaBruta   = round2(byBracket[k].receitaBruta);
    byBracket[k].custosEueln    = round2(byBracket[k].custosEueln);
    byBracket[k].receitaLiquida = round2(byBracket[k].receitaLiquida);
    byBracket[k].volume         = round2(byBracket[k].volume);
  }
  for (const k of Object.keys(byType)) {
    byType[k].receitaBruta   = round2(byType[k].receitaBruta);
    byType[k].custosEueln    = round2(byType[k].custosEueln);
    byType[k].receitaLiquida = round2(byType[k].receitaLiquida);
    byType[k].volume         = round2(byType[k].volume);
  }

  return {
    month,
    summary: {
      totalTransactions,
      receitaBruta,
      custosEueln,
      receitaLiquida,
      margemLiquida,
      volumeTransacional,
      ticketMedio,
      refusedCount: refused,
    },
    byBracket,
    byType,
  };
}

// ============================================================
// UTILS
// ============================================================
function getTodayString(): string {
  return toDateString(new Date());
}

function toDateString(date: Date): string {
  return date.toISOString().substring(0, 10); // YYYY-MM-DD
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
