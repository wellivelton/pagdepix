import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// IPs na whitelist nunca são afetados pelo rate limiter
// Configure via RATE_LIMIT_WHITELIST="ip1,ip2,ip3" no .env
const WHITELIST = new Set(
  (process.env.RATE_LIMIT_WHITELIST || '').split(',').map((s) => s.trim()).filter(Boolean)
);

function isWhitelisted(req: Request): boolean {
  if (WHITELIST.size === 0) return false;
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  return WHITELIST.has(ip);
}

export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  message: { error: 'Muitas requisições deste IP, tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: isWhitelisted,
});

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Muitas tentativas de cadastro. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Muitas tentativas de reset de senha. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const boletoCreateRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Limite de criação de boletos atingido. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const sendEmailCodeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitos códigos solicitados. Aguarde 15 minutos para tentar novamente.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const marketplaceCheckoutRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { error: 'Limite de checkouts atingido. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});

export const marketplaceActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas ações. Aguarde alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isWhitelisted,
});
