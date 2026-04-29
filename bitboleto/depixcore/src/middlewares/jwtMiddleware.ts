import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
}

// Augmenta o tipo Request para incluir o usuário autenticado
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Middleware de autenticação JWT.
 * Aceita token via: Authorization: Bearer <token>
 * Fallback: X-DepixCore-Key ou ?apiKey= (para acesso programático)
 */
export function jwtMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // --- Tentativa 1: JWT via Authorization: Bearer ---
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      res.status(500).json({ error: 'Servidor mal configurado (JWT_SECRET ausente)' });
      return;
    }

    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      req.user = payload;
      next();
      return;
    } catch {
      res.status(401).json({ error: 'Token inválido ou expirado' });
      return;
    }
  }

  // --- Tentativa 2: API Key (fallback para acesso programático) ---
  const expectedKey = process.env.DEPIXCORE_API_KEY;
  const providedKey =
    (req.headers['x-depixcore-key'] as string | undefined) ||
    (req.query.apiKey as string | undefined);

  if (expectedKey && providedKey && providedKey.trim() === expectedKey.trim()) {
    req.user = { sub: 'api-key', email: 'api@depixcore', name: 'API Key', role: 'admin' };
    next();
    return;
  }

  res.status(401).json({ error: 'Não autorizado' });
}
