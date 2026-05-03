export interface Env {
  // Required — app refuses to start if any of these are missing or invalid
  JWT_SECRET: string;
  DATABASE_URL: string;
  LIQUID_WALLET_ADDRESS: string;
  LIQUID_XPUB: string;
  LIQUID_MASTER_BLINDING_KEY: string;
  GERADEPIX_API_KEY: string;

  // Optional — features degrade gracefully when absent
  TELEGRAM_BOT_TOKEN: string | undefined;
  TELEGRAM_WEBHOOK_SECRET: string | undefined;
  ASAAS_API_KEY: string | undefined;
  RESEND_API_KEY: string | undefined;
  VAPID_PUBLIC_KEY: string | undefined;
  VAPID_PRIVATE_KEY: string | undefined;
  SWAPVERSE_ACCESS_TOKEN: string | undefined;
  VELORA_API_KEY: string | undefined;
  VELORA_API_SECRET: string | undefined;
  TELEGRAM_ADMIN_CHAT_ID: string | undefined;
}

interface ValidationError {
  key: string;
  message: string;
}

// Known compromised default values — must never be accepted as JWT_SECRET
const KNOWN_WEAK_SECRETS = new Set([
  'segredo',
  'supersecret',
  'seu-secret-aqui',
  'download-secret',
  'secret',
  'changeme',
]);

export class EnvValidationError extends Error {
  constructor(public readonly validationErrors: ValidationError[]) {
    const lines = validationErrors.map((e) => `  ✗ ${e.key}: ${e.message}`).join('\n');
    super(
      `\n[ENV][FATAL] Configuration error — refusing to start\n\n` +
        `Missing or invalid required environment variables:\n${lines}\n\n` +
        `Fix your .env file and restart. See .env.example for reference.\n`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates environment variables. Accepts a custom source for testability.
 * Throws EnvValidationError listing ALL failures — never fails on the first one.
 */
export function validateEnv(source: Record<string, string | undefined> = process.env): Env {
  const errors: ValidationError[] = [];
  const vals: Record<string, string> = {};

  function checkRequired(key: string, validator?: (val: string) => string | null): void {
    const raw = (source[key] ?? '').trim();
    if (!raw) {
      errors.push({ key, message: `must not be empty (got 0 characters)` });
      return;
    }
    if (validator) {
      const err = validator(raw);
      if (err) {
        errors.push({ key, message: err });
        return;
      }
    }
    vals[key] = raw;
  }

  checkRequired('JWT_SECRET', (val) => {
    if (val.length < 32) return `must be at least 32 characters (got ${val.length})`;
    if (KNOWN_WEAK_SECRETS.has(val))
      return `is a known compromised default — use a cryptographically random string`;
    return null;
  });

  checkRequired('DATABASE_URL', (val) => {
    if (!val.startsWith('postgresql://') && !val.startsWith('postgres://'))
      return `must start with postgresql:// or postgres://`;
    return null;
  });

  checkRequired('LIQUID_WALLET_ADDRESS', (val) => {
    // TODO: Tighten to exact Liquid mainnet bech32/legacy prefixes after team review
    if (/^(bc1|[13])/.test(val))
      return `appears to be a Bitcoin address — must be a Liquid Network address`;
    if (val.length < 30)
      return `too short to be a valid Liquid address (got ${val.length} chars)`;
    return null;
  });

  checkRequired('LIQUID_XPUB', (val) => {
    // TODO: Confirm Liquid-specific xpub prefixes with team; update if different
    const knownPrefixes = ['xpub', 'ypub', 'zpub', 'Mtub'];
    if (!knownPrefixes.some((p) => val.startsWith(p)))
      return `must start with xpub/ypub/zpub/Mtub — update this check if using a Liquid-specific prefix`;
    if (val.length < 100)
      return `too short for an extended public key (got ${val.length} chars)`;
    return null;
  });

  checkRequired('LIQUID_MASTER_BLINDING_KEY', (val) => {
    if (!/^[0-9a-fA-F]{64}$/.test(val))
      return `must be a 64-character hex string (32 bytes) — got ${val.length} chars`;
    return null;
  });

  checkRequired('GERADEPIX_API_KEY', (val) => {
    if (val.length < 16) return `must be at least 16 characters (got ${val.length})`;
    return null;
  });

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }

  const opt = (key: string): string | undefined =>
    (source[key] ?? '').trim() || undefined;

  const optional = {
    TELEGRAM_BOT_TOKEN:     opt('TELEGRAM_BOT_TOKEN'),
    TELEGRAM_WEBHOOK_SECRET: opt('TELEGRAM_WEBHOOK_SECRET'),
    ASAAS_API_KEY:          opt('ASAAS_API_KEY'),
    RESEND_API_KEY:         opt('RESEND_API_KEY'),
    VAPID_PUBLIC_KEY:       opt('VAPID_PUBLIC_KEY'),
    VAPID_PRIVATE_KEY:      opt('VAPID_PRIVATE_KEY'),
    SWAPVERSE_ACCESS_TOKEN: opt('SWAPVERSE_ACCESS_TOKEN'),
    VELORA_API_KEY:         opt('VELORA_API_KEY'),
    VELORA_API_SECRET:      opt('VELORA_API_SECRET'),
    TELEGRAM_ADMIN_CHAT_ID: opt('TELEGRAM_ADMIN_CHAT_ID'),
  };

  logFeatureStatus(optional);

  return {
    JWT_SECRET:                vals['JWT_SECRET']!,
    DATABASE_URL:              vals['DATABASE_URL']!,
    LIQUID_WALLET_ADDRESS:     vals['LIQUID_WALLET_ADDRESS']!,
    LIQUID_XPUB:               vals['LIQUID_XPUB']!,
    LIQUID_MASTER_BLINDING_KEY: vals['LIQUID_MASTER_BLINDING_KEY']!,
    GERADEPIX_API_KEY:         vals['GERADEPIX_API_KEY']!,
    ...optional,
  };
}

function logFeatureStatus(optional: Record<string, string | undefined>): void {
  const features = [
    { name: 'TELEGRAM_BOT',         enabled: !!optional['TELEGRAM_BOT_TOKEN'],                                           reason: 'TELEGRAM_BOT_TOKEN missing' },
    { name: 'TELEGRAM_WEBHOOK_AUTH', enabled: !!optional['TELEGRAM_WEBHOOK_SECRET'],                                      reason: 'TELEGRAM_WEBHOOK_SECRET missing — webhook accepts any request' },
    { name: 'PUSH_NOTIFICATIONS',   enabled: !!(optional['VAPID_PUBLIC_KEY'] && optional['VAPID_PRIVATE_KEY']),           reason: 'VAPID_PUBLIC_KEY/PRIVATE_KEY missing' },
    { name: 'SWAP (SwapVerse)',      enabled: !!optional['SWAPVERSE_ACCESS_TOKEN'],                                        reason: 'SWAPVERSE_ACCESS_TOKEN missing' },
    { name: 'EMAIL (Resend)',        enabled: !!optional['RESEND_API_KEY'],                                                reason: 'RESEND_API_KEY missing' },
    { name: 'ASAAS',                enabled: !!optional['ASAAS_API_KEY'],                                                 reason: 'ASAAS_API_KEY missing' },
    { name: 'VELORA',               enabled: !!(optional['VELORA_API_KEY'] && optional['VELORA_API_SECRET']),             reason: 'VELORA_API_KEY/SECRET missing' },
    { name: 'TELEGRAM_ADMIN_ALERTS', enabled: !!optional['TELEGRAM_ADMIN_CHAT_ID'],                                      reason: 'TELEGRAM_ADMIN_CHAT_ID missing' },
  ];

  const disabled = features.filter((f) => !f.enabled);
  const enabled  = features.filter((f) => f.enabled);

  console.log(`[ENV] ✅ Required vars OK (6/6)`);
  if (disabled.length > 0) {
    console.warn(`[ENV] ⚠️  Optional features disabled:`);
    disabled.forEach((f) => console.warn(`   - ${f.name} (${f.reason})`));
  }
  if (enabled.length > 0) {
    console.log(`[ENV] ✅ Optional features enabled:`);
    enabled.forEach((f) => console.log(`   - ${f.name}`));
  }
}

/**
 * Module-level singleton. Crashes the process on validation failure.
 * Tests import validateEnv() directly (not this export) to avoid process.exit.
 * NODE_ENV=test skips the crash so test files can safely import this module.
 */
export const env: Env = process.env['NODE_ENV'] === 'test'
  ? ({} as Env)
  : (() => {
      try {
        return validateEnv();
      } catch (err) {
        if (err instanceof EnvValidationError) {
          console.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    })();
