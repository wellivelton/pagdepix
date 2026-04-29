/**
 * Validação de telefone WhatsApp - apenas Brasil (+55)
 */

/** DDDs válidos do Brasil (11-99, exceto alguns reservados). 55 é código do país, não DDD. */
const VALID_DDDS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35,
  37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88,
  89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
];

export interface PhoneValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Normaliza o número para apenas dígitos
 */
export function normalizePhone(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

/**
 * Validação de telefone WhatsApp Brasil
 * Formato: 55 + DDD (2 dígitos) + 9 dígitos (celular) ou 8 dígitos (fixo)
 * Celular: 9XXXXXXXX (11 dígitos após 55)
 * Fixo: 8XXXXXXX ou 3XXXXXXX (10 dígitos após 55)
 */
export function validateWhatsAppBrazil(phone: string): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'WhatsApp é obrigatório' };
  }

  const digits = normalizePhone(phone);

  // Deve começar com 55 (Brasil)
  if (!digits.startsWith('55')) {
    return {
      valid: false,
      error: 'Apenas números brasileiros (+55) são aceitos',
    };
  }

  const withoutCountry = digits.slice(2);

  // 10 dígitos (fixo) ou 11 dígitos (celular com 9)
  if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
    return {
      valid: false,
      error: 'Número inválido. Use DDD + número (ex: 11999999999)',
    };
  }

  const ddd = parseInt(withoutCountry.slice(0, 2), 10);
  if (!VALID_DDDS.includes(ddd)) {
    return {
      valid: false,
      error: 'DDD inválido',
    };
  }

  // Celular: deve começar com 9
  if (withoutCountry.length === 11) {
    if (withoutCountry[2] !== '9') {
      return {
        valid: false,
        error: 'Celular deve começar com 9 após o DDD',
      };
    }
  }

  return {
    valid: true,
    normalized: `55${withoutCountry}`,
  };
}
