/**
 * Utilitários KYC (Know Your Customer)
 * Níveis:
 * - 0: Sem verificações
 * - 1: Nome + E-mail → Pagar boleto, Recarga
 * - 2: Nome + E-mail + Telegram → Todas as funcionalidades (incl. Compra Depix)
 */

export type KycLevel = 0 | 1 | 2;

export interface KycStatus {
  level: KycLevel;
  nameVerified: boolean;
  emailVerified: boolean;
  telegramVerified: boolean;
  whatsappInformed: boolean;
  canUseBoleto: boolean;
  canUseRecarga: boolean;
  canUseDepix: boolean;
}

export function computeKycLevel(
  nameVerified: boolean,
  emailVerified: boolean,
  telegramVerified: boolean
): KycLevel {
  if (nameVerified && emailVerified && telegramVerified) return 2;
  if (nameVerified && emailVerified) return 1;
  return 0;
}

export function getKycStatus(
  nameVerified: boolean,
  emailVerified: boolean,
  telegramVerified: boolean,
  whatsapp: string | null
): KycStatus {
  const level = computeKycLevel(nameVerified, emailVerified, telegramVerified);
  return {
    level,
    nameVerified,
    emailVerified,
    telegramVerified,
    whatsappInformed: Boolean(whatsapp && whatsapp.trim()),
    canUseBoleto: level >= 1,
    canUseRecarga: level >= 1,
    canUseDepix: level >= 2,
  };
}
