import { Request, Response, NextFunction } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import { prisma } from '../prisma';

export interface CommerceApiKeyPayload {
  apiKeyId: string;
  partnerId: string;
  userId: string;
  isSandbox: boolean;
}

declare global {
  namespace Express {
    interface Request {
      commerceApiKey?: CommerceApiKeyPayload;
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

export const commerceApiKeyAuth = async (req: Request, res: Response, next: NextFunction) => {
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const apiSecretHeader = req.headers['x-api-secret'] as string | undefined;

  // Suporta Bearer (api_key:api_secret em base64) ou headers separados
  let rawKey = apiKeyHeader;
  let rawSecret = apiSecretHeader;

  const authHeader = req.headers.authorization;
  if (!rawKey && !rawSecret && authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = Buffer.from(authHeader.slice(7), 'base64').toString('utf8');
      const [k, s] = decoded.split(':');
      if (k && s) {
        rawKey = k;
        rawSecret = s;
      }
    } catch {
      // ignorar
    }
  }

  if (!rawKey || !rawSecret) {
    return res.status(401).json({ error: 'Autenticação necessária. Use X-API-Key e X-API-Secret ou Bearer (base64 de api_key:api_secret)' });
  }

  try {
    const keyHash = sha256(rawKey);

    const apiKey = await prisma.commerceApiKey.findUnique({
      where: { keyHash },
      include: { partner: { include: { user: true } } },
    });

    if (!apiKey) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!apiKey.isActive) {
      return res.status(403).json({ error: 'API key revogada' });
    }

    if (apiKey.partner.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Modo Comércio não aprovado. Verifique sua ativação.' });
    }

    const secretHash = sha256(rawSecret);
    if (!safeCompare(secretHash, apiKey.secretHash)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (apiKey.ipWhitelist.length > 0) {
      const clientIp = req.ip || req.socket.remoteAddress || '';
      const normalizedIp = clientIp.replace(/^::ffff:/, '');
      const allowed = apiKey.ipWhitelist.some(
        (ip) => ip === normalizedIp || ip === clientIp
      );
      if (!allowed) {
        return res.status(403).json({ error: 'IP não permitido' });
      }
    }

    await prisma.commerceApiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 },
      },
    });

    (req as any).commerceApiKey = {
      apiKeyId: apiKey.id,
      partnerId: apiKey.partnerId,
      userId: apiKey.partner.userId,
      isSandbox: apiKey.isSandbox,
    };

    next();
  } catch (error: any) {
    console.error('[commerceApiKeyAuth]', error?.message);
    return res.status(500).json({ error: 'Erro de autenticação' });
  }
};
