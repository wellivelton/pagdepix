"use strict";
/**
 * Recalcula custos e receita líquida de todos os eventos já processados.
 *
 * Necessário porque a fórmula foi corrigida:
 *   ANTES: cost = amount × 1% + 0,99  (ERRADO)
 *   AGORA: cost = fee × 1%            (CORRETO)
 *
 * Uso:
 *   cd ~/depixcore
 *   npx ts-node src/scripts/recalculateCosts.ts
 */
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const prisma_1 = require("../prisma");
async function main() {
    console.log('\n════════════════════════════════════════════');
    console.log('  DepixCore — Recálculo de Custos');
    console.log('════════════════════════════════════════════');
    console.log('  Fórmula nova: custo = fee × 1%\n');
    // 1. Recalcular EventProcessed
    const events = await prisma_1.prisma.eventProcessed.findMany({
        where: { fee: { gt: 0 } },
        select: { id: true, fee: true },
    });
    console.log(`📊 ${events.length} eventos com fee > 0 para recalcular...`);
    let updated = 0;
    for (const e of events) {
        const fee = e.fee;
        const cost = Math.round(fee * 0.01 * 100) / 100;
        const netProfit = Math.round((fee - cost) * 100) / 100;
        await prisma_1.prisma.eventProcessed.update({
            where: { id: e.id },
            data: { cost, netProfit },
        });
        updated++;
        if (updated % 100 === 0)
            console.log(`  ... ${updated}/${events.length}`);
    }
    console.log(`  ✅ ${updated} eventos recalculados`);
    // 2. Reconstruir DailyAggregation do zero
    console.log('\n📅 Reconstruindo agregações diárias...');
    await prisma_1.prisma.dailyAggregation.deleteMany({});
    const processed = await prisma_1.prisma.eventProcessed.findMany({
        where: { isSandbox: false },
        select: {
            eventType: true, transactionType: true, amount: true,
            fee: true, cost: true, netProfit: true, processedAt: true,
        },
    });
    const dayMap = new Map();
    for (const e of processed) {
        const day = e.processedAt.toISOString().substring(0, 10);
        const key = day;
        const existing = dayMap.get(key) ?? {
            date: day, source: 'pagdepix',
            totalEvents: 0, approvedCount: 0, refusedCount: 0, receivedCount: 0,
            boletoCount: 0, rechargeCount: 0, chargeCount: 0,
            grossVolume: 0, totalFees: 0, estimatedCosts: 0, netProfit: 0,
            sandboxCount: 0, sandboxVolume: 0,
        };
        const isApproved = ['payment.approved', 'recharge.completed', 'charge.paid'].includes(e.eventType);
        const isRefused = ['payment.refused', 'recharge.refused'].includes(e.eventType);
        existing.totalEvents++;
        if (isApproved) {
            existing.approvedCount++;
            existing.grossVolume += e.amount ?? 0;
            existing.totalFees += e.fee ?? 0;
            existing.estimatedCosts += e.cost ?? 0;
            existing.netProfit += e.netProfit ?? 0;
            if (e.transactionType === 'boleto')
                existing.boletoCount++;
            if (e.transactionType === 'recharge')
                existing.rechargeCount++;
            if (e.transactionType === 'charge')
                existing.chargeCount++;
        }
        if (isRefused)
            existing.refusedCount++;
        if (e.eventType === 'payment.received')
            existing.receivedCount++;
        dayMap.set(key, existing);
    }
    const rows = Array.from(dayMap.values());
    for (const row of rows) {
        await prisma_1.prisma.dailyAggregation.create({ data: row });
    }
    console.log(`  ✅ ${rows.length} dias de agregação reconstruídos`);
    console.log('\n════════════════════════════════════════════');
    console.log('  ✅ Recálculo concluído!');
    console.log('════════════════════════════════════════════\n');
    await prisma_1.prisma.$disconnect();
}
main().catch(e => {
    console.error('❌ Erro:', e.message);
    process.exit(1);
});
//# sourceMappingURL=recalculateCosts.js.map