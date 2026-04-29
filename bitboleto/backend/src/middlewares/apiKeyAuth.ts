import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../prisma';

export interface ApiKeyPayload {
  apiKeyId: string;
  affiliateId: string;
  isSandbox: boolean;
}

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKeyPayload;
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const apiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const apiSecretHeader = req.headers['x-api-secret'] as string | undefined;

  if (!apiKeyHeader || !apiSecretHeader) {
    return res.status(401).json({ error: 'Missing X-API-Key or X-API-Secret headers' });
  }

  try {
    const keyHash = sha256(apiKeyHeader);

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { affiliate: true },
    });

    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid API credentials' });
    }

    if (!apiKey.isActive) {
      return res.status(403).json({
        error: 'API key suspended',
        reason: apiKey.suspendedReason || 'Contact support',
      });
    }

    if (!apiKey.affiliate.isActive) {
      return res.status(403).json({ error: 'Affiliate account is inactive' });
    }

    const secretHash = sha256(apiSecretHeader);
    if (!safeCompare(secretHash, apiKey.secretHash)) {
      return res.status(401).json({ error: 'Invalid API credentials' });
    }

    if (apiKey.ipWhitelist.length > 0) {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      const normalizedIp = clientIp.replace(/^::ffff:/, '');
      const allowed = apiKey.ipWhitelist.some(
        (ip) => ip === normalizedIp || ip === clientIp
      );
      if (!allowed) {
        return res.status(403).json({ error: 'IP not whitelisted' });
      }
    }

    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 },
      },
    });

    req.apiKey = {
      apiKeyId: apiKey.id,
      affiliateId: apiKey.affiliateId,
      isSandbox: apiKey.isSandbox,
    };

    next();
  } catch (error: any) {
    console.error('[apiKeyAuth] Error:', error.message);
    return res.status(500).json({ error: 'Authentication error' });
  }
};
