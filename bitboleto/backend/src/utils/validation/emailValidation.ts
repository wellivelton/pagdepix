/**
 * Validação de e-mail com bloqueio de domínios temporários/descartáveis
 */

const EMAIL_RFC_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** Domínios de e-mail temporário/descartável conhecidos */
const BLOCKED_DOMAINS = [
  'mailinator.com', 'mailinator.net', 'mailinator2.com',
  'tempmail.com', 'tempmail.net', 'temp-mail.org', 'temp-mail.io',
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'throwaway.email', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'maildrop.cc',
  'sharklasers.com', 'guerrillamail.info', 'grr.la',
  'spam4.me', 'dispostable.com', 'mailnesia.com',
  'tempinbox.com', 'mintemail.com', 'emailondeck.com',
  'mailcatch.com', 'inboxkitten.com', 'tmpeml.com',
  'tempail.com', 'mohmal.com', 'emailfake.com',
  'disposable.com', 'mailinator.org', 'tempr.email',
  'temp-mail.com', 'anonymousemail.me', 'mytemp.email',
];

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida formato básico RFC do e-mail
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim().toLowerCase();
  return EMAIL_RFC_REGEX.test(trimmed);
}

/**
 * Verifica se o domínio está na lista de bloqueados (exportado para uso em troca de email)
 */
export function isBlockedDomain(email: string): boolean {
  if (!email || typeof email !== 'string') return true;
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return true;
  return BLOCKED_DOMAINS.some(
    (blocked) => domain === blocked || domain.endsWith('.' + blocked)
  );
}

/**
 * Validação completa de e-mail (formato + domínio bloqueado)
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'E-mail é obrigatório' };
  }

  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5) {
    return { valid: false, error: 'E-mail inválido' };
  }

  if (!isValidEmailFormat(trimmed)) {
    return { valid: false, error: 'Formato de e-mail inválido' };
  }

  if (isBlockedDomain(trimmed)) {
    return {
      valid: false,
      error: 'E-mails temporários ou descartáveis não são permitidos. Use um e-mail pessoal ou corporativo.',
    };
  }

  return { valid: true };
}
