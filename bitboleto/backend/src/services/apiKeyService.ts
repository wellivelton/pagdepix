import { randomBytes, createHash } from 'crypto';
import { prisma } from '../prisma';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateKey(): string {
  return 'bb_' + randomBytes(24).toString('hex');
}

function generateSecret(): string {
  return 'bbs_' + randomBytes(32).toString('hex');
}

export async function createApiKey(
  affiliateId: string,
  label: string,
  isSandbox: boolean = false
) {
  const rawKey = generateKey();
  const rawSecret = generateSecret();

  const keyHash = sha256(rawKey);
  const secretHash = sha256(rawSecret);
  const keyPrefix = rawKey.substring(0, 10);

  const apiKey = await prisma.apiKey.create({
    data: {
      affiliateId,
      label,
      keyHash,
      secretHash,
      keyPrefix,
      isSandbox,
    },
  });

  return {
    id: apiKey.id,
    key: rawKey,
    secret: rawSecret,
    keyPrefix,
    label,
    isSandbox,
    createdAt: apiKey.createdAt,
    warning: 'Store the key and secret securely. The secret will NOT be shown again.',
  };
}

export async function revokeApiKey(apiKeyId: string, affiliateId: string) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, affiliateId },
  });

  if (!apiKey) throw new Error('API key not found');

  return prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { isActive: false, suspendedAt: new Date(), suspendedReason: 'Revoked by user' },
  });
}

export async function listApiKeys(affiliateId: string) {
  return prisma.apiKey.findMany({
    where: { affiliateId },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      isSandbox: true,
      isActive: true,
      suspendedAt: true,
      suspendedReason: true,
      ipWhitelist: true,
      rateLimit: true,
      lastUsedAt: true,
      requestCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateApiKeyIpWhitelist(
  apiKeyId: string,
  affiliateId: string,
  ipWhitelist: string[]
) {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: apiKeyId, affiliateId },
  });

  if (!apiKey) throw new Error('API key not found');

  return prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { ipWhitelist },
  });
}

export async function adminSuspendApiKey(
  apiKeyId: string,
  reason: string
) {
  return prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      isActive: false,
      suspendedAt: new Date(),
      suspendedReason: reason,
    },
  });
}

export async function adminReactivateApiKey(apiKeyId: string) {
  return prisma.apiKey.update({
    where: { id: apiKeyId },
    data: {
      isActive: true,
      suspendedAt: null,
      suspendedReason: null,
    },
  });
}
