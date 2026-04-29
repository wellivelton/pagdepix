import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

const requestCounts = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = 60_000;

export const apiRateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.apiKey) return next();

  const { apiKeyId } = req.apiKey;

  const now = Date.now();
  let entry = requestCounts.get(apiKeyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    requestCounts.set(apiKeyId, entry);
  }

  entry.count++;

  const rateLimit = await getRateLimit(apiKeyId);

  if (entry.count > rateLimit) {
    const retryAfterSec = Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', String(Math.max(1, retryAfterSec)));
    res.setHeader('X-RateLimit-Limit', String(rateLimit));
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)));
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Número máximo de tentativas atingido. Aguarde e tente novamente.',
      retryAfter: retryAfterSec,
      limit: rateLimit,
    });
  }

  res.setHeader('X-RateLimit-Limit', String(rateLimit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rateLimit - entry.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + WINDOW_MS) / 1000)));

  next();
};

const rateLimitCache = new Map<string, { limit: number; fetchedAt: number }>();
const CACHE_TTL = 300_000;

async function getRateLimit(apiKeyId: string): Promise<number> {
  const cached = rateLimitCache.get(apiKeyId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.limit;
  }

  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { rateLimit: true },
    });
    const limit = apiKey?.rateLimit || 60;
    rateLimitCache.set(apiKeyId, { limit, fetchedAt: Date.now() });
    return limit;
  } catch {
    return 60;
  }
}

export const apiRequestLogger = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.apiKey) return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    prisma.apiRequestLog.create({
      data: {
        apiKeyId: req.apiKey!.apiKeyId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || null,
        duration,
      },
    }).catch((err) => {
      console.error('[API Logger] Failed to log request:', err.message);
    });
  });

  next();
};

setInterval(() => {
  const now = Date.now();
  requestCounts.forEach((entry, key) => {
    if (now - entry.windowStart >= WINDOW_MS * 2) {
      requestCounts.delete(key);
    }
  });
}, WINDOW_MS * 5);
