// ========================================
// REGRAS DE TAXAS E LIMITES
// ========================================
// Custo operacional: 1% do valor do boleto + R$ 0,99 (fixo).
// Taxa fixa cobrada (R$ 1,99 ou R$ 0,99) é intocável.
// Margem disponível (cupom) = taxa percentual cobrada − 1% (custo).
// Divisão do referral: 20% desconto indicado | 20% comissão indicador | 60% plataforma.

export interface TaxRule {
  minAmount: number;
  maxAmount: number;
  percentage: number;
  fixedFee: number;
  description: string;
}

export const COST_PERCENTAGE = 0.01;
export const COST_FIXED = 0.99;

/** Taxa de referral: 20% de desconto para o indicado e 20% de comissão para o indicador. */
export const REFERRAL_RATE = 0.20;
export const costForAmount = (amount: number): number =>
  amount * COST_PERCENTAGE + COST_FIXED;

/** Valor mínimo do boleto: R$ 20,00 */
export const MIN_BOLETO_AMOUNT = 20.00;

/** Valor máximo do boleto: R$ 5.000,00 */
export const MAX_BOLETO_AMOUNT = 5000.00;

/** Comissão do afiliado = 20% do lucro (taxa - custo operacional). Nunca sobre valor do boleto. */
export const AFFILIATE_COMMISSION_ON_PROFIT_RATE = 0.20;

export const TAX_RULES: TaxRule[] = [
  { minAmount: 20.00, maxAmount: 49.99, percentage: 0.04, fixedFee: 1.99, description: 'De R$ 20,00 até R$ 49,99' },
  { minAmount: 50.00, maxAmount: 99.99, percentage: 0.03, fixedFee: 1.99, description: 'De R$ 50,00 até R$ 99,99' },
  { minAmount: 100.00, maxAmount: 499.99, percentage: 0.025, fixedFee: 1.99, description: 'De R$ 100,00 até R$ 499,99' },
  { minAmount: 500.00, maxAmount: 5000.00, percentage: 0.02, fixedFee: 0.99, description: 'De R$ 500,00 até R$ 5.000,00' }
];

export const getTaxRule = (amount: number): TaxRule | null => {
  if (amount < MIN_BOLETO_AMOUNT) return null;
  return TAX_RULES.find(r => amount >= r.minAmount && amount <= r.maxAmount) || null;
};

/** Margem percentual disponível (taxa cobrada − custo 1%). Máx. 20% vai para desconto, 20% para afiliado. */
export const getMaxCouponDiscountFromRule = (rule: TaxRule): number =>
  Math.max(0, 0.20 * (rule.percentage - COST_PERCENTAGE));

/** Comissão do afiliado = 20% da margem percentual (usado apenas para cap). Valor em R$ é sobre o lucro: (fee - cost) * AFFILIATE_COMMISSION_ON_PROFIT_RATE. */
export const getAffiliateCommissionRateFromRule = (rule: TaxRule): number =>
  Math.max(0, 0.20 * (rule.percentage - COST_PERCENTAGE));

/** Calcula o valor da comissão do afiliado sobre o lucro (taxa cobrada - custo operacional). */
export const getAffiliateCommissionFromProfit = (fee: number, boletoAmount: number): number => {
  const cost = costForAmount(boletoAmount);
  const profit = Math.max(0, fee - cost);
  return Math.floor(profit * AFFILIATE_COMMISSION_ON_PROFIT_RATE * 100) / 100;
};

/** Casas decimais para valor exato (DEPIX/USDT/BTC). */
export const TOTAL_AMOUNT_PRECISION = 8;

/**
 * Calcula a taxa. Com cupom: desconto é aplicado sobre o TOTAL (valor + taxa), como na calculadora.
 * Sem cupom: taxa = ceil(percentual + fixo). Limite do desconto = máx. 20% da margem (não excede a taxa).
 */
export const calculateTax = (
  amount: number,
  couponDiscount: number = 0,
  taxRuleOverride?: TaxRule | null
): {
  taxRule: TaxRule | null;
  percentage: number;
  fixedFee: number;
  taxAmount: number;
  totalAmount: number;
  totalAmountExact: number;
  isValid: boolean;
  maxAllowedDiscount?: number;
  feeBeforeCoupon?: number;
  totalBeforeDiscount?: number;
  discountAmount?: number;
  couponPercentDisplay?: number;
} => {
  if (amount < MIN_BOLETO_AMOUNT || amount > MAX_BOLETO_AMOUNT) {
    return { taxRule: null, percentage: 0, fixedFee: 0, taxAmount: 0, totalAmount: 0, totalAmountExact: 0, isValid: false };
  }

  const taxRule = taxRuleOverride ?? getTaxRule(amount);
  if (!taxRule) {
    return { taxRule: null, percentage: 0, fixedFee: 0, taxAmount: 0, totalAmount: 0, totalAmountExact: 0, isValid: false };
  }

  const rawFeeFull = amount * taxRule.percentage + taxRule.fixedFee;
  const feeBeforeCoupon = Math.ceil(rawFeeFull * 100) / 100;
  const totalBeforeDiscount = amount + feeBeforeCoupon;

  if (couponDiscount <= 0) {
    const totalAmount = parseFloat(totalBeforeDiscount.toFixed(2));
    return {
      taxRule,
      percentage: taxRule.percentage,
      fixedFee: taxRule.fixedFee,
      taxAmount: feeBeforeCoupon,
      totalAmount,
      totalAmountExact: totalAmount,
      isValid: true,
      maxAllowedDiscount: getMaxCouponDiscountFromRule(taxRule),
    };
  }

  const maxAllowedDiscount = getMaxCouponDiscountFromRule(taxRule);
  const effectiveDiscountFraction = Math.min(couponDiscount, maxAllowedDiscount);
  const discountAmount = Math.min(
    totalBeforeDiscount * effectiveDiscountFraction,
    feeBeforeCoupon
  );
  const totalAmountExact = totalBeforeDiscount - discountAmount;
  const totalAmount = parseFloat(totalAmountExact.toFixed(2));
  const taxAmount = Math.round((totalAmountExact - amount) * 100) / 100;

  return {
    taxRule,
    percentage: taxRule.percentage,
    fixedFee: taxRule.fixedFee,
    taxAmount,
    totalAmount,
    totalAmountExact: parseFloat(totalAmountExact.toFixed(TOTAL_AMOUNT_PRECISION)),
    isValid: true,
    maxAllowedDiscount,
    feeBeforeCoupon,
    totalBeforeDiscount,
    discountAmount,
    couponPercentDisplay: effectiveDiscountFraction * 100,
  };
};

export const formatPercentage = (percentage: number): string =>
  (percentage * 100).toFixed(2).replace('.', ',') + '%';

export const formatCurrency = (value: number): string =>
  `R$ ${value.toFixed(2).replace('.', ',')}`;

// ========================================
// PIX COPIA E COLA — R$2,50 fixo + 3% variável
// ========================================
// Coupons ONLY discount the 3% variable portion — never the R$2,50 fixed fee.
// The fixed fee covers the Velora QRCODE_CASH_OUT cost (R$2,50 per payment).
export const PCC_FIXED_FEE = 2.50;
export const PIX_COPIA_COLA_FEE_PERCENT = 0.03;
export const MIN_PIX_COPIA_COLA_AMOUNT = 20.00;

export function calculatePixCopiaColaFee(
  amount: number,
  couponDiscountFraction = 0,
): {
  taxa: number;
  taxaFixa: number;
  taxaVariavel: number;
  valorTaxa: number;
  totalFinal: number;
} {
  const effectivePercent = PIX_COPIA_COLA_FEE_PERCENT * (1 - Math.min(Math.max(couponDiscountFraction, 0), 1));
  const taxaFixa = PCC_FIXED_FEE;
  // 3% applied on (amount + fixed fee) so base already includes the fixed cost
  const taxaVariavel = Math.ceil((amount + taxaFixa) * effectivePercent * 100) / 100;
  const valorTaxa = parseFloat((taxaFixa + taxaVariavel).toFixed(2));
  return {
    taxa: effectivePercent,
    taxaFixa,
    taxaVariavel,
    valorTaxa,
    totalFinal: parseFloat((amount + valorTaxa).toFixed(2)),
  };
}
