/**
 * Entrega para o modelo novo: OrderItem / SellerOrder.
 * Por OrderItem: FILE, CODE ou LINK.
 */

import { prisma } from '../../prisma';
import { generateDownloadToken, getDownloadLinkExpiry, DEFAULT_DOWNLOAD_LIMIT } from './downloadLink.service';

const SETTLEMENT_DIGITAL_DAYS = 1;

export async function deliverOrderItemsForSellerOrder(
  sellerOrderId: string
): Promise<{ success: boolean; delivered: number; errors: string[] }> {
  const sellerOrder = await prisma.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: {
      items: {
        include: {
          product: {
            include: {
              files: { where: { virusScanStatus: { in: ['clean', 'pending'] } }, take: 1 },
              codes: { where: { isUsed: false }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!sellerOrder) return { success: false, delivered: 0, errors: ['SellerOrder não encontrado'] };
  if (sellerOrder.status !== 'PAID' && sellerOrder.status !== 'PROCESSING') {
    return { success: false, delivered: 0, errors: ['Pedido do vendedor não está pago'] };
  }

  const errors: string[] = [];
  let delivered = 0;

  for (const item of sellerOrder.items) {
    if (item.deliveryStatus === 'delivered') {
      delivered++;
      continue;
    }

    const product = item.product;

    try {
      if (product.deliveryType === 'FILE') {
        const file = product.files[0];
        if (!file) {
          errors.push(`Produto ${product.title} sem arquivo aprovado`);
          continue;
        }
        const token = generateDownloadToken(item.id, file.id);
        const baseUrl = process.env.APP_URL || 'http://localhost:3001';
        const downloadLink = `${baseUrl}/api/marketplace/download?token=${token}`;
        const expiry = getDownloadLinkExpiry();
        await prisma.orderItem.update({
          where: { id: item.id },
          data: {
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
            downloadLink,
            downloadLinkExpiry: expiry,
            downloadLimit: product.downloadLimit ?? DEFAULT_DOWNLOAD_LIMIT,
          },
        });
        delivered++;
      } else if (product.deliveryType === 'CODE') {
        const codeRecord = product.codes[0];
        if (!codeRecord) {
          errors.push(`Produto ${product.title} sem códigos disponíveis`);
          continue;
        }
        await prisma.$transaction([
          prisma.productCode.update({
            where: { id: codeRecord.id },
            data: { isUsed: true, usedByOrderItemId: item.id, usedAt: new Date() },
          }),
          prisma.orderItem.update({
            where: { id: item.id },
            data: {
              deliveryStatus: 'delivered',
              deliveredAt: new Date(),
              deliveredCode: codeRecord.code,
            },
          }),
        ]);
        delivered++;
      } else if (product.deliveryType === 'LINK' && product.deliveryLink) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: {
            deliveryStatus: 'delivered',
            deliveredAt: new Date(),
            downloadLink: product.deliveryLink,
          },
        });
        delivered++;
      } else {
        errors.push(`Produto ${product.title}: tipo de entrega não configurado`);
      }
    } catch (e) {
      errors.push(`Erro ao entregar ${product.title}: ${(e as Error).message}`);
    }
  }

  const settlementDays = SETTLEMENT_DIGITAL_DAYS;
  const settlementAt = new Date();
  settlementAt.setDate(settlementAt.getDate() + settlementDays);

  await prisma.sellerOrder.update({
    where: { id: sellerOrderId },
    data: {
      status: delivered === sellerOrder.items.length ? 'COMPLETED' : 'PROCESSING',
      settlementStatus: 'locked',
      settlementAvailableAt: settlementAt,
    },
  });

  return { success: errors.length === 0, delivered, errors };
}
