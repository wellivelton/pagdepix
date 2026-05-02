import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateEnv, EnvValidationError } from '../env';

// Suppress [ENV] console output in tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Minimal valid env that satisfies all required validations
const VALID_ENV: Record<string, string> = {
  JWT_SECRET:                'a-very-secure-random-string-minimum-32-chars!!',
  DATABASE_URL:              'postgresql://user:pass@localhost:5432/pagdepix',
  LIQUID_WALLET_ADDRESS:     'lq1qqgskhge4cunhw32799ky9wlaavt83xu0klvvz78yg4ugzr3dmq2t0gm4gyfdr59yhaq7anhkg52ha666d0nkys56jh979wyp7',
  LIQUID_XPUB:               'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC' + 'a'.repeat(70),
  LIQUID_MASTER_BLINDING_KEY: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  GERADEPIX_API_KEY:         'geradepix-api-key-test-value',
};

describe('validateEnv', () => {
  // ── Success ──────────────────────────────────────────────────────────────

  it('passes with all required vars valid', () => {
    const result = validateEnv({ ...VALID_ENV });
    expect(result.JWT_SECRET).toBe(VALID_ENV['JWT_SECRET']);
    expect(result.DATABASE_URL).toBe(VALID_ENV['DATABASE_URL']);
    expect(result.LIQUID_WALLET_ADDRESS).toBe(VALID_ENV['LIQUID_WALLET_ADDRESS']);
    expect(result.LIQUID_XPUB).toBe(VALID_ENV['LIQUID_XPUB']);
    expect(result.LIQUID_MASTER_BLINDING_KEY).toBe(VALID_ENV['LIQUID_MASTER_BLINDING_KEY']);
    expect(result.GERADEPIX_API_KEY).toBe(VALID_ENV['GERADEPIX_API_KEY']);
  });

  it('trims whitespace from values before validation', () => {
    const result = validateEnv({
      ...VALID_ENV,
      JWT_SECRET: '  ' + VALID_ENV['JWT_SECRET'] + '  ',
    });
    expect(result.JWT_SECRET).toBe(VALID_ENV['JWT_SECRET']);
  });

  it('optional vars are undefined when absent', () => {
    const result = validateEnv({ ...VALID_ENV });
    expect(result.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(result.RESEND_API_KEY).toBeUndefined();
    expect(result.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it('optional vars are populated when present', () => {
    const result = validateEnv({
      ...VALID_ENV,
      TELEGRAM_BOT_TOKEN: 'bot123:token',
      RESEND_API_KEY: 're_somekey',
    });
    expect(result.TELEGRAM_BOT_TOKEN).toBe('bot123:token');
    expect(result.RESEND_API_KEY).toBe('re_somekey');
  });

  it('optional var set to empty string is treated as absent', () => {
    const result = validateEnv({ ...VALID_ENV, TELEGRAM_BOT_TOKEN: '' });
    expect(result.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it('optional var set to whitespace only is treated as absent', () => {
    const result = validateEnv({ ...VALID_ENV, TELEGRAM_BOT_TOKEN: '   ' });
    expect(result.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  // ── JWT_SECRET failures ───────────────────────────────────────────────────

  it('throws when JWT_SECRET is absent', () => {
    const { JWT_SECRET: _, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(EnvValidationError);
  });

  it('throws when JWT_SECRET is empty string', () => {
    expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: '' }))
      .toThrow(EnvValidationError);
  });

  it('throws when JWT_SECRET is whitespace only', () => {
    expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: '   ' }))
      .toThrow(EnvValidationError);
  });

  it('throws when JWT_SECRET has fewer than 32 characters', () => {
    expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: 'short' }))
      .toThrow(EnvValidationError);
  });

  it('error message includes character count when JWT_SECRET is too short', () => {
    try {
      validateEnv({ ...VALID_ENV, JWT_SECRET: 'tooshort' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as Error).message).toContain('JWT_SECRET');
      expect((err as Error).message).toContain('32 characters');
    }
  });

  it.each(['segredo', 'supersecret', 'seu-secret-aqui', 'download-secret', 'secret', 'changeme'])(
    'throws when JWT_SECRET is known weak default "%s"',
    (weakSecret) => {
      // Pad to 32+ chars but still contains the weak value
      const padded = weakSecret.padEnd(32, 'x');
      // Use exact weak value (original test: exact match)
      expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: weakSecret }))
        .toThrow(EnvValidationError);
      // A padded version is NOT in the weak set, so should pass length check if >= 32
      if (padded.length >= 32 && !['segredo', 'supersecret', 'seu-secret-aqui', 'download-secret', 'secret', 'changeme'].includes(padded)) {
        expect(() => validateEnv({ ...VALID_ENV, JWT_SECRET: padded })).not.toThrow();
      }
    },
  );

  // ── DATABASE_URL failures ─────────────────────────────────────────────────

  it('throws when DATABASE_URL is absent', () => {
    const { DATABASE_URL: _, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(EnvValidationError);
  });

  it('throws when DATABASE_URL does not start with postgresql:// or postgres://', () => {
    expect(() => validateEnv({ ...VALID_ENV, DATABASE_URL: 'mysql://localhost/db' }))
      .toThrow(EnvValidationError);
  });

  it('accepts DATABASE_URL starting with postgres://', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, DATABASE_URL: 'postgres://user:pass@localhost:5432/db' }),
    ).not.toThrow();
  });

  // ── LIQUID_WALLET_ADDRESS failures ────────────────────────────────────────

  it('throws when LIQUID_WALLET_ADDRESS is absent', () => {
    const { LIQUID_WALLET_ADDRESS: _, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(EnvValidationError);
  });

  it('throws when LIQUID_WALLET_ADDRESS is empty', () => {
    expect(() => validateEnv({ ...VALID_ENV, LIQUID_WALLET_ADDRESS: '' }))
      .toThrow(EnvValidationError);
  });

  it('throws when LIQUID_WALLET_ADDRESS looks like a Bitcoin address (bc1)', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, LIQUID_WALLET_ADDRESS: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }),
    ).toThrow(EnvValidationError);
  });

  it('throws when LIQUID_WALLET_ADDRESS looks like a Bitcoin legacy address (1...)', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, LIQUID_WALLET_ADDRESS: '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf' }),
    ).toThrow(EnvValidationError);
  });

  // ── LIQUID_MASTER_BLINDING_KEY failures ───────────────────────────────────

  it('throws when LIQUID_MASTER_BLINDING_KEY is absent', () => {
    const { LIQUID_MASTER_BLINDING_KEY: _, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(EnvValidationError);
  });

  it('throws when LIQUID_MASTER_BLINDING_KEY is not 64 hex chars', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, LIQUID_MASTER_BLINDING_KEY: 'tooshort' }),
    ).toThrow(EnvValidationError);
  });

  it('throws when LIQUID_MASTER_BLINDING_KEY contains non-hex chars', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, LIQUID_MASTER_BLINDING_KEY: 'z'.repeat(64) }),
    ).toThrow(EnvValidationError);
  });

  it('accepts LIQUID_MASTER_BLINDING_KEY with mixed case hex', () => {
    expect(() =>
      validateEnv({ ...VALID_ENV, LIQUID_MASTER_BLINDING_KEY: 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2' }),
    ).not.toThrow();
  });

  // ── GERADEPIX_API_KEY failures ────────────────────────────────────────────

  it('throws when GERADEPIX_API_KEY is absent', () => {
    const { GERADEPIX_API_KEY: _, ...rest } = VALID_ENV;
    expect(() => validateEnv(rest)).toThrow(EnvValidationError);
  });

  it('throws when GERADEPIX_API_KEY has fewer than 16 characters', () => {
    expect(() => validateEnv({ ...VALID_ENV, GERADEPIX_API_KEY: 'short' }))
      .toThrow(EnvValidationError);
  });

  // ── All errors collected before throwing ─────────────────────────────────

  it('collects all errors before throwing — not just the first', () => {
    try {
      validateEnv({
        // Omit JWT_SECRET and DATABASE_URL
        LIQUID_WALLET_ADDRESS: VALID_ENV['LIQUID_WALLET_ADDRESS'],
        LIQUID_XPUB: VALID_ENV['LIQUID_XPUB'],
        LIQUID_MASTER_BLINDING_KEY: VALID_ENV['LIQUID_MASTER_BLINDING_KEY'],
        GERADEPIX_API_KEY: VALID_ENV['GERADEPIX_API_KEY'],
      });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const errors = (err as EnvValidationError).validationErrors;
      const keys = errors.map((e) => e.key);
      expect(keys).toContain('JWT_SECRET');
      expect(keys).toContain('DATABASE_URL');
    }
  });

  it('error message lists all failing keys', () => {
    try {
      validateEnv({});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const msg = (err as Error).message;
      expect(msg).toContain('JWT_SECRET');
      expect(msg).toContain('DATABASE_URL');
      expect(msg).toContain('LIQUID_WALLET_ADDRESS');
      expect(msg).toContain('LIQUID_MASTER_BLINDING_KEY');
      expect(msg).toContain('GERADEPIX_API_KEY');
      expect(msg).toContain('.env.example');
    }
  });
});
