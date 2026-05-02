import * as crypto from 'crypto';
import * as path from 'path';
import { env } from '../../config/env';

const DOWNLOAD_LINK_EXPIRY_MINUTES = 60;
const DEFAULT_DOWNLOAD_LIMIT = 3;

/**
 * Gera token assinado para download temporário (evita URL pública permanente).
 * entityId pode ser MarketplaceOrder.id ou OrderItem.id.
 */
export function generateDownloadToken(entityId: string, fileId: string): string {
  const payload = `${entityId}:${fileId}:${Date.now() + DOWNLOAD_LINK_EXPIRY_MINUTES * 60 * 1000}`;
  const secret = env.JWT_SECRET;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const signature = hmac.digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

/**
 * Valida token e retorna orderId e fileId se válido.
 */
export function validateDownloadToken(token: string): { orderId: string; fileId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [orderId, fileId, expiryStr, signature] = decoded.split(':');
    if (!orderId || !fileId || !expiryStr || !signature) return null;
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() > expiry) return null;
    const secret = env.JWT_SECRET;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${orderId}:${fileId}:${expiryStr}`);
    const expected = hmac.digest('hex');
    if (signature !== expected) return null;
    return { orderId, fileId };
  } catch {
    return null;
  }
}

export function getDownloadLinkExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + DOWNLOAD_LINK_EXPIRY_MINUTES);
  return d;
}

export { DEFAULT_DOWNLOAD_LIMIT, DOWNLOAD_LINK_EXPIRY_MINUTES };
