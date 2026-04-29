import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Gera um fingerprint único do dispositivo baseado em headers HTTP
 */
export function generateDeviceFingerprint(req: Request): string {
  const userAgent = req.get('user-agent') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const acceptEncoding = req.get('accept-encoding') || '';
  const ip = req.ip || req.socket.remoteAddress || '';

  // Combina informações para criar um fingerprint único
  const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${ip}`;
  
  // Gera hash SHA-256
  return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

/**
 * Middleware para adicionar device fingerprint ao request
 */
export function deviceFingerprintMiddleware(req: Request, res: any, next: any) {
  (req as any).deviceFingerprint = generateDeviceFingerprint(req);
  next();
}
