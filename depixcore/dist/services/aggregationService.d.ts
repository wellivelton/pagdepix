import { PagDepixEventType } from './eventCollector';
export declare function updateDailyAggregation(eventType: PagDepixEventType, data: {
    amount: number | null;
    fee: number | null;
    cost: number | null;
    netProfit: number | null;
    transactionType: string;
    isSandbox: boolean;
}): Promise<void>;
export declare function getSummary(filters?: {
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
    byType: {
        boleto: number;
        recharge: number;
        charge: number;
    };
}>;
export declare function getMonthlyBreakdown(months?: number): Promise<Array<{
    month: string;
    approvedCount: number;
    grossVolume: number;
    totalFees: number;
    netProfit: number;
    boletoCount: number;
    rechargeCount: number;
    chargeCount: number;
}>>;
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
    byBracket: Record<string, {
        count: number;
        receitaBruta: number;
        custosEueln: number;
        receitaLiquida: number;
        volume: number;
    }>;
    byType: Record<string, {
        count: number;
        receitaBruta: number;
        custosEueln: number;
        receitaLiquida: number;
        volume: number;
    }>;
}
export declare function getMonthlyDetail(month: string): Promise<MonthlyDetailResult>;
//# sourceMappingURL=aggregationService.d.ts.map