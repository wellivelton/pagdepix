import { prisma } from '../../prisma';
import { generateDownloadToken, getDownloadLinkExpiry, DEFAULT_DOWNLOAD_LIMIT } from './downloadLink.service';

/**
 * Entrega automática após confirmação de pagamento.
 * - FILE: gera link de download assinado
 * - CODE: atribui primeiro código não usado ao pedido
 * - LINK: copia deliveryLink do produto para o pedido
 */
export async function deliverOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
  const order = await prisma.marketplaceOrder.findUnique({
    where: { id: orderId },
    include: {
      product: {
        include: {
          files: { where: { virusScanStatus: { in: ['clean', 'pending'] } }, take: 1 },
          codes: { where: { isUsed: false }, take: 1 },
        },
      },
    },
  });

  if (!order) return { success: false, error: 'Pedido não encontrado' };
  if (order.paymentStatus !== 'paid') return { success: false, error: 'Pagamento não confirmado' };
  if (order.deliveryStatus === 'delivered') return { success: true };

  const product = order.product;

  try {
    if (product.deliveryType === 'FILE') {
      const file = product.files[0];
      if (!file) {
        await prisma.marketplaceOrder.update({
          where: { id: orderId },
          data: { deliveryStatus: 'pending' },
        });
        return { success: false, error: 'Produto sem arquivo aprovado para download' };
      }
      const token = generateDownloadToken(orderId, file.id);
      const baseUrl = process.env.APP_URL || 'http://localhost:3001';
      const downloadLink = `${baseUrl}/api/marketplace/download?token=${token}`;
      const expiry = getDownloadLinkExpiry();
      await prisma.marketplaceOrder.update({
        where: { id: orderId },
        data: {
          deliveryStatus: 'delivered',
          deliveredAt: new Date(),
          downloadLink,
          downloadLinkExpiry: expiry,
          downloadLimit: DEFAULT_DOWNLOAD_LIMIT,
        },
      });
      return { success: true };
    }

    if (product.deliveryType === 'CODE') {
      const codeRecord = product.codes[0];
      if (!codeRecord) {
        return { success: false, error: 'Produto sem códigos disponíveis' };
      }
      await prisma.$transaction([
        prisma.productCode.update({
          where: { id: codeRecord.id },
          data: { isUsed: true, usedByOrderId: orderId, usedAt: new Date() },
        }),
        prisma.marketplaceOrder.update({
          where: { id: orderId },
          data: {
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
            deliveredCode: codeRecord.code,
          },
        }),
      ]);
      return { success: true };
    }

    if (product.deliveryType === 'LINK' && product.deliveryLink) {
      await prisma.marketplaceOrder.update({
        where: { id: orderId },
        data: {
          deliveryStatus: 'delivered',
          deliveredAt: new Date(),
          downloadLink: product.deliveryLink,
        },
      });
      return { success: true };
    }

    return { success: false, error: 'Tipo de entrega não configurado' };
  } catch (e) {
    console.error('[Marketplace] Erro ao entregar pedido:', orderId, e);
    return { success: false, error: 'Erro ao processar entrega' };
  }
}
