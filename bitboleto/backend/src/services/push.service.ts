import webpush from 'web-push';
import { prisma } from '../prisma';

let initialized = false;

interface UserVars {
  name: string;
  email: string;
  telegram?: string | null;
  balance?: number | null;
}

function substituteVars(text: string, user: UserVars): string {
  return text
    .replace(/\{\{nome\}\}/gi, user.name || '')
    .replace(/\{\{email\}\}/gi, user.email || '')
    .replace(/\{\{telegram\}\}/gi, user.telegram ? `@${user.telegram}` : '')
    .replace(/\{\{saldo\}\}/gi, user.balance != null ? `${Number(user.balance).toFixed(4)} DEPIX` : '');
}

export function initPushService(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:contato@pagdepix.com';

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys não definidas. Push notifications desabilitadas.');
    return;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  initialized = true;
  console.log('[Push] Serviço inicializado com VAPID.');
}

export function isPushConfigured(): boolean {
  return initialized;
}

export interface NotificationPayload {
  title: string;
  body: string;
  link?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

/**
 * Salva notificação no histórico e envia Web Push para todos os dispositivos do usuário.
 * Retorna o registro salvo no banco (sempre), independente do push.
 */
export async function sendNotification(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const { title, body, link, icon, badge, tag } = payload;
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';

  // Sempre salvar no histórico
  await prisma.userNotification.create({
    data: { userId, title, body, link: link ?? null },
  });

  if (!initialized) return;

  // Buscar todas as assinaturas do usuário
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify({
    title,
    body,
    icon: icon ?? `${frontendUrl}/android-chrome-192x192.png`,
    badge: badge ?? `${frontendUrl}/favicon-32x32.png`,
    url: link ?? frontendUrl,
    tag,
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
          { TTL: 86400 } // 24h TTL
        );
      } catch (err: any) {
        // 410 Gone / 404 = subscription expirada, remover
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        } else {
          console.error('[Push] Erro ao enviar para dispositivo:', err?.message);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/**
 * Envia notificação push para múltiplos usuários de forma eficiente.
 * Salva histórico em bulk e processa envios em paralelo com concorrência controlada.
 */
export async function sendBulkNotification(
  userIds: string[],
  payload: NotificationPayload,
  concurrency = 20
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const { title, body, link, icon, badge, tag } = payload;
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';

  // Salvar histórico para todos os usuários de uma vez
  await prisma.userNotification.createMany({
    data: userIds.map((userId) => ({ userId, title, body, link: link ?? null })),
    skipDuplicates: true,
  });

  if (!initialized) return { sent: 0, failed: 0 };

  // Buscar assinaturas e dados de usuário em paralelo
  const [allSubs, userMap] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    }),
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, telegram: true },
    }).then((users) => new Map(users.map((u) => [u.id, u]))),
  ]);

  if (allSubs.length === 0) return { sent: 0, failed: 0 };

  const staleIds: string[] = [];
  let sent = 0;
  let failed = 0;

  // Processar em chunks para controlar concorrência
  for (let i = 0; i < allSubs.length; i += concurrency) {
    const chunk = allSubs.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map(async (sub) => {
        // Substituir variáveis com dados deste usuário específico
        const userData = userMap.get(sub.userId) as UserVars | undefined;
        const resolvedTitle = userData ? substituteVars(title, userData) : title;
        const resolvedBody = userData ? substituteVars(body, userData) : body;
        const pushPayload = JSON.stringify({
          title: resolvedTitle,
          body: resolvedBody,
          icon: icon ?? `${frontendUrl}/android-chrome-192x192.png`,
          badge: badge ?? `${frontendUrl}/favicon-32x32.png`,
          url: link ?? frontendUrl,
          tag,
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          pushPayload,
          { TTL: 86400 }
        );
      })
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        const err = result.reason as any;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(chunk[idx].id);
        } else {
          failed++;
        }
      }
    });
  }

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    failed += staleIds.length;
  }

  return { sent, failed };
}

/**
 * Envia notificação de boleto aprovado.
 */
export async function notifyBoletoApproved(
  userId: string,
  amount: number,
  receiptUrl?: string | null
): Promise<void> {
  const valor = amount.toFixed(2).replace('.', ',');
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
  await sendNotification(userId, {
    title: '✅ Boleto liquidado!',
    body: `Seu boleto de R$ ${valor} foi aprovado. Toque para ver o comprovante.`,
    link: receiptUrl ?? `${frontendUrl}/historico`,
    tag: 'boleto-approved',
  });
}

/**
 * Envia notificação de recarga aprovada.
 */
export async function notifyRechargeApproved(
  userId: string,
  amount: number,
  receiptUrl?: string | null
): Promise<void> {
  const valor = amount.toFixed(2).replace('.', ',');
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
  await sendNotification(userId, {
    title: '📱 Recarga aprovada!',
    body: `Sua recarga de R$ ${valor} foi processada com sucesso.`,
    link: receiptUrl ?? `${frontendUrl}/historico`,
    tag: 'recharge-approved',
  });
}

/**
 * Envia notificação de comissão de afiliado.
 */
export async function notifyAffiliateCommission(
  userId: string,
  commission: number
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
  const valor = commission.toFixed(4);
  await sendNotification(userId, {
    title: '💰 Nova comissão!',
    body: `Você ganhou ${valor} DEPIX de comissão de afiliado.`,
    link: `${frontendUrl}/afiliado/ganhos`,
    tag: 'affiliate-commission',
  });
}

/**
 * Envia notificação de PIX confirmado.
 */
export async function notifyPixConfirmed(
  userId: string,
  amount: number
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
  const valor = amount.toFixed(2).replace('.', ',');
  await sendNotification(userId, {
    title: '⚡ Pagamento confirmado!',
    body: `Seu pagamento de R$ ${valor} foi confirmado via Depix.`,
    link: `${frontendUrl}/historico`,
    tag: 'pix-confirmed',
  });
}

/**
 * Envia notificação de saque processado.
 */
export async function notifyWithdrawalProcessed(
  userId: string,
  amount: number
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'https://pagdepix.com';
  const valor = amount.toFixed(4);
  await sendNotification(userId, {
    title: '💸 Saque enviado!',
    body: `Seu saque de ${valor} DEPIX foi processado.`,
    link: `${frontendUrl}/afiliado/ganhos`,
    tag: 'withdrawal-processed',
  });
}
