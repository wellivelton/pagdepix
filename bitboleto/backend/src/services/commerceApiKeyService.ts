import { randomBytes, createHash } from 'crypto';
import { prisma } from '../prisma';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateKey(): string {
  return 'bbcm_' + randomBytes(24).toString('hex');
}

function generateSecret(): string {
  return 'bbcmsec_' + randomBytes(32).toString('hex');
}

export async function createCommerceApiKey(
  partnerId: string,
  label: string,
  isSandbox: boolean = false
) {
  const rawKey = generateKey();
  const rawSecret = generateSecret();

  const keyHash = sha256(rawKey);
  const secretHash = sha256(rawSecret);
  const keyPrefix = rawKey.substring(0, 12);

  const apiKey = await prisma.commerceApiKey.create({
    data: {
      partnerId,
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
    warning: 'Guarde a chave e o secret com segurança. O secret não será exibido novamente.',
  };
}

export async function revokeCommerceApiKey(apiKeyId: string, partnerId: string) {
  const apiKey = await prisma.commerceApiKey.findFirst({
    where: { id: apiKeyId, partnerId },
  });

  if (!apiKey) throw new Error('API key não encontrada');

  await prisma.commerceApiKey.delete({
    where: { id: apiKeyId },
  });
}

export async function listCommerceApiKeys(partnerId: string) {
  return prisma.commerceApiKey.findMany({
    where: { partnerId },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      isSandbox: true,
      isActive: true,
      ipWhitelist: true,
      lastUsedAt: true,
      requestCount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}
