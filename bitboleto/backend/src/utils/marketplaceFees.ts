/**
 * Taxas do Marketplace PagDepix
 * - Padrão: 0.5% variável + R$ 0.99 fixo
 * - Pode usar MarketplaceFeeConfig (por sellerTier/category)
 */

import { prisma } from '../prisma';

export const MARKETPLACE_PLATFORM_VARIABLE_PERCENT = 0.005; // 0.5%
export const MARKETPLACE_PLATFORM_FIXED_FEE = 0.99;

export interface MarketplaceFeeResult {
  productPrice: number;
  platformVariableFee: number;
  platformFixedFee: number;
  totalPlatformFee: number;
  affiliateCommission: number;
  couponDiscount: number;
  sellerReceives: number;
  finalPrice: number;
}

export function calculateMarketplaceFees(
  productPrice: number,
  affiliateCommissionPercent: number = 0,
  couponDiscountPercent: number = 0
): MarketplaceFeeResult {
  // Produto gratuito: sem taxas
  if (productPrice <= 0) {
    return {
      productPrice: 0,
      platformVariableFee: 0,
      platformFixedFee: 0,
      totalPlatformFee: 0,
      affiliateCommission: 0,
      couponDiscount: 0,
      sellerReceives: 0,
      finalPrice: 0,
    };
  }

  const platformVariableFee = Math.round(productPrice * MARKETPLACE_PLATFORM_VARIABLE_PERCENT * 100) / 100;
  const platformFixedFee = MARKETPLACE_PLATFORM_FIXED_FEE;
  const totalPlatformFee = Math.round((platformVariableFee + platformFixedFee) * 100) / 100;

  const affiliateCommission = Math.round(productPrice * (affiliateCommissionPercent / 100) * 100) / 100;
  const couponDiscount = Math.round(productPrice * (couponDiscountPercent / 100) * 100) / 100;

  const finalPrice = Math.round((productPrice - couponDiscount) * 100) / 100;
  const sellerReceives = Math.round((productPrice - totalPlatformFee - affiliateCommission - couponDiscount) * 100) / 100;

  return {
    productPrice,
    platformVariableFee,
    platformFixedFee,
    totalPlatformFee,
    affiliateCommission,
    couponDiscount,
    sellerReceives: Math.max(0, sellerReceives),
    finalPrice,
  };
}

/**
 * Busca config de taxa (MarketplaceFeeConfig). Fallback para padrão.
 */
export async function getMarketplaceFeeConfig(_sellerId?: string, categoryId?: string | null): Promise<{
  percentage: number;
  fixedFee: number;
}> {
  const config = await prisma.marketplaceFeeConfig.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (config) return { percentage: config.percentage, fixedFee: config.fixedFee };
  return { percentage: MARKETPLACE_PLATFORM_VARIABLE_PERCENT, fixedFee: MARKETPLACE_PLATFORM_FIXED_FEE };
}

/**
 * Calcula taxas usando config dinâmica (async).
 */
export async function calculateMarketplaceFeesWithConfig(
  productPrice: number,
  affiliateCommissionPercent: number,
  couponDiscountPercent: number,
  sellerId?: string,
  categoryId?: string | null
): Promise<MarketplaceFeeResult> {
  const config = await getMarketplaceFeeConfig(sellerId, categoryId);
  const platformVariableFee = Math.round(productPrice * config.percentage * 100) / 100;
  const platformFixedFee = config.fixedFee;
  const totalPlatformFee = Math.round((platformVariableFee + platformFixedFee) * 100) / 100;
  const affiliateCommission = Math.round(productPrice * (affiliateCommissionPercent / 100) * 100) / 100;
  const couponDiscount = Math.round(productPrice * (couponDiscountPercent / 100) * 100) / 100;
  const finalPrice = Math.round((productPrice - couponDiscount) * 100) / 100;
  const sellerReceives = Math.round((productPrice - totalPlatformFee - affiliateCommission - couponDiscount) * 100) / 100;
  return {
    productPrice,
    platformVariableFee,
    platformFixedFee,
    totalPlatformFee,
    affiliateCommission,
    couponDiscount,
    sellerReceives: Math.max(0, sellerReceives),
    finalPrice,
  };
}
