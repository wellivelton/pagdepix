/**
 * Backfill histórico do DepixCore
 *
 * Envia todos os boletos, recargas e cobranças históricas para o DepixCore.
 * Idempotente: usa deliveryId fixo (backfill_{event}_{id}), então pode ser
 * executado várias vezes sem duplicar registros.
 *
 * Uso:
 *   cd ~/bitboleto/backend
 *   npx ts-node src/scripts/backfillDepixCore.ts
 *
 * Opções de filtro por data (opcional):
 *   npx ts-node src/scripts/backfillDepixCore.ts --from=2025-01-01
 *   npx ts-node src/scripts/backfillDepixCore.ts --from=2025-01-01 --to=2025-12-31
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { forwardToDepixCore } from '../services/depixcoreForwarder';

const prisma = new PrismaClient();

// Delay entre envios para não sobrecarregar o DepixCore
const DELAY_MS = 80;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  let from: Date | undefined;
  let to: Date | undefined;
  for (const arg of args) {
    if (arg.startsWith('--from=')) from = new Date(arg.slice(7));
    if (arg.startsWith('--to='))   to   = new Date(arg.slice(5) + 'T23:59:59Z');
  }
  return { from, to };
}

async function backfillBoletos(from?: Date, to?: Date) {
  const where: any = {
    status: { in: ['PAID', 'PROBLEM', 'CANCELLED'] as any },
  };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to)   where.createdAt.lte = to;
  }

  const boletos = await prisma.boleto.findMany({
    where,
    select: {
      id: true, amount: true, fee: true, totalAmount: true,
      txid: true, status: true, isSandbox: true, externalRef: true,
      paymentCurrency: true, cryptoAmount: true, exchangeRate: true,
      paidAt: true, confirmedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n📄 Boletos a processar: ${boletos.length}`);
  let ok = 0, skip = 0;

  for (const b of boletos) {
    const isPaid    = b.status === 'PAID';
    const isRefused = b.status === 'PROBLEM' || b.status === 'CANCELLED';

    const event     = isPaid ? 'payment.approved' : 'payment.refused';
    const deliveryId = `backfill_${event}_${b.id}`;

    const data: Record<string, unknown> = {
      boleto_id:   b.id,
      amount:      b.amount,
      fee:         b.fee,
      totalAmount: b.totalAmount,
      txid:        b.txid,
      status:      isPaid ? 'approved' : 'refused',
      externalRef: b.externalRef,
      currency:    b.paymentCurrency,
      cryptoAmount:b.cryptoAmount,
      exchangeRate:b.exchangeRate,
      timestamp:   (b.paidAt ?? b.confirmedAt ?? b.createdAt).toISOString(),
    };

    // Injeta o deliveryId no header via monkey-patch temporário
    await forwardToDepixCore(event, b.id, 'boleto', data, b.isSandbox, deliveryId);
    await sleep(DELAY_MS);

    ok++;
    if (ok % 50 === 0) console.log(`  ... ${ok}/${boletos.length} boletos enviados`);
  }

  console.log(`  ✅ Boletos: ${ok} enviados, ${skip} ignorados`);
}

async function backfillRecargas(from?: Date, to?: Date) {
  const where: any = {
    status: { in: ['PAID', 'CANCELLED'] as any },
  };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to)   where.createdAt.lte = to;
  }

  const recharges = await prisma.mobileRecharge.findMany({
    where,
    select: {
      id: true, amount: true, fee: true, totalAmount: true,
      txid: true, status: true, isSandbox: true, externalRef: true,
      operator: true, phoneNumber: true,
      paymentCurrency: true, cryptoAmount: true, exchangeRate: true,
      paidAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\n📱 Recargas a processar: ${recharges.length}`);
  let ok = 0;

  for (const r of recharges) {
    const isApproved = r.status === 'PAID';
    const event      = isApproved ? 'recharge.completed' : 'recharge.refused';
    const deliveryId = `backfill_${event}_${r.id}`;

    const data: Record<string, unknown> = {
      recharge_id: r.id,
      amount:      r.amount,
      fee:         r.fee,
      totalAmount: r.totalAmount,
      txid:        r.txid,
      status:      isApproved ? 'completed' : 'refused',
      operator:    r.operator,
      phoneNumber: r.phoneNumber,
      externalRef: r.externalRef,
      currency:    r.paymentCurrency,
      cryptoAmount:r.cryptoAmount,
      exchangeRate:r.exchangeRate,
      timestamp:   (r.paidAt ?? r.createdAt).toISOString(),
    };

    await forwardToDepixCore(event, r.id, 'recharge', data, r.isSandbox, deliveryId);
    await sleep(DELAY_MS);

    ok++;
    if (ok % 50 === 0) console.log(`  ... ${ok}/${recharges.length} recargas enviadas`);
  }

  console.log(`  ✅ Recargas: ${ok} enviadas`);
}

async function backfillCharges(from?: Date, to?: Date) {
  const where: any = { status: 'paid' };
  if (from || to) {
    where.paidAt = {};
    if (from) where.paidAt.gte = from;
    if (to)   where.paidAt.lte = to;
  }

  const charges = await prisma.commerceCharge.findMany({
    where,
    select: {
      id: true, amount: true, partnerId: true,
      metadata: true, paidAt: true, createdAt: true,
    },
    orderBy: { paidAt: 'asc' },
  });

  console.log(`\n🏪 Cobranças commerce a processar: ${charges.length}`);
  let ok = 0;

  for (const c of charges) {
    const deliveryId = `backfill_charge.paid_${c.id}`;

    const data: Record<string, unknown> = {
      id:         c.id,
      amount:     c.amount,
      status:     'paid',
      partnerId:  c.partnerId,
      metadata:   (c.metadata as Record<string, unknown>) || {},
      paid_at:    (c.paidAt ?? c.createdAt).toISOString(),
    };

    await forwardToDepixCore('charge.paid', c.id, 'charge', data, false, deliveryId);
    await sleep(DELAY_MS);
    ok++;
  }

  console.log(`  ✅ Cobranças: ${ok} enviadas`);
}

async function main() {
  const { from, to } = parseArgs();

  const url = process.env.DEPIXCORE_WEBHOOK_URL;
  if (!url) {
    console.error('❌ DEPIXCORE_WEBHOOK_URL não configurado no .env');
    process.exit(1);
  }

  console.log('');
  console.log('════════════════════════════════════════════════');
  console.log('  DepixCore — Backfill Histórico');
  console.log('════════════════════════════════════════════════');
  console.log(`  Destino: ${url}`);
  if (from) console.log(`  De:      ${from.toISOString().substring(0,10)}`);
  if (to)   console.log(`  Até:     ${to.toISOString().substring(0,10)}`);
  console.log('');

  try {
    await backfillBoletos(from, to);
    await backfillRecargas(from, to);
    await backfillCharges(from, to);

    console.log('');
    console.log('════════════════════════════════════════════════');
    console.log('  ✅ Backfill concluído!');
    console.log('  Acesse contabilidade.pagdepix.com para ver os dados.');
    console.log('════════════════════════════════════════════════');
    console.log('');
  } catch (err: any) {
    console.error('❌ Erro durante backfill:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
