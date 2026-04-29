import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../../prisma';

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB - limite de tamanho

function param(id: string | string[] | undefined): string | undefined {
  return Array.isArray(id) ? id[0] : id;
}

/**
 * Listar mensagens do chat de um pedido.
 * Comprador, vendedor ou admin podem acessar.
 */
export const listOrderChatMessages = async (req: Request, res: Response) => {
  const orderId = param(req.params.orderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;

  try {
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });

    const order = await prisma.marketplaceOrder.findFirst({
      where: {
        id: orderId,
        OR: [{ buyerId: userId }, { sellerId: userId }, role === 'ADMIN' ? {} : { id: 'never' }],
      },
    });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const messages = await prisma.orderChatMessage.findMany({
      where: { orderId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages });
  } catch (error) {
    console.error('Erro ao listar mensagens:', error);
    res.status(500).json({ error: 'Erro ao listar mensagens' });
  }
};

/**
 * Enviar mensagem de texto no chat do pedido.
 */
export const sendOrderChatMessage = async (req: Request, res: Response) => {
  const orderId = param(req.params.orderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const { content, adminIntervention } = req.body as { content?: string; adminIntervention?: boolean };

  try {
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return res.status(400).json({ error: 'Mensagem não pode ser vazia' });

    const order = await prisma.marketplaceOrder.findFirst({
      where: {
        id: orderId,
        OR: [{ buyerId: userId }, { sellerId: userId }, role === 'ADMIN' ? {} : { id: 'never' }],
      },
    });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const isAdmin = role === 'ADMIN';
    if (adminIntervention && !isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem enviar intervenções' });
    }

    const message = await prisma.orderChatMessage.create({
      data: {
        orderId,
        senderId: userId,
        messageType: 'TEXT',
        content: text,
        isFromAdmin: isAdmin,
        adminIntervention: !!adminIntervention,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

/**
 * Enviar mensagem com anexo no chat do pedido.
 */
export const sendOrderChatAttachment = async (req: Request, res: Response) => {
  const orderId = param(req.params.orderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const file = (req as any).file as Express.Multer.File | undefined;

  try {
    if (!orderId) return res.status(400).json({ error: 'orderId obrigatório' });
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return res.status(400).json({ error: 'Arquivo muito grande. Máximo 20MB.' });
    }

    const order = await prisma.marketplaceOrder.findFirst({
      where: {
        id: orderId,
        OR: [{ buyerId: userId }, { sellerId: userId }, role === 'ADMIN' ? {} : { id: 'never' }],
      },
    });
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const relativePath = `uploads/chat-attachments/${file.filename}`;

    const message = await prisma.orderChatMessage.create({
      data: {
        orderId,
        senderId: userId,
        messageType: 'ATTACHMENT',
        content: file.originalname || file.filename,
        attachmentPath: relativePath,
        attachmentName: file.originalname || file.filename,
        attachmentSize: file.size,
        attachmentMime: file.mimetype,
        isFromAdmin: role === 'ADMIN',
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Erro ao enviar anexo:', error);
    res.status(500).json({ error: 'Erro ao enviar anexo' });
  }
};

/**
 * Download de anexo do chat (apenas participantes do pedido).
 */
export const downloadChatAttachment = async (req: Request, res: Response) => {
  const messageId = param(req.params.messageId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;

  try {
    if (!messageId) return res.status(400).json({ error: 'messageId obrigatório' });

    const message = await prisma.orderChatMessage.findUnique({
      where: { id: messageId },
      include: { order: true },
    });
    if (!message || !message.attachmentPath) {
      return res.status(404).json({ error: 'Anexo não encontrado' });
    }

    const canAccess =
      message.order.buyerId === userId ||
      message.order.sellerId === userId ||
      role === 'ADMIN';
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });

    const fullPath = path.isAbsolute(message.attachmentPath!)
      ? message.attachmentPath
      : path.resolve(process.cwd(), message.attachmentPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    }

    res.download(fullPath, message.attachmentName || 'anexo');
  } catch (error) {
    console.error('Erro ao baixar anexo:', error);
    res.status(500).json({ error: 'Erro ao baixar' });
  }
};

// ---- Chat SellerOrder (novo modelo) ----

export const listSellerOrderChatMessages = async (req: Request, res: Response) => {
  const sellerOrderId = param(req.params.sellerOrderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  try {
    if (!sellerOrderId) return res.status(400).json({ error: 'sellerOrderId obrigatório' });
    const so = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { marketOrder: { select: { buyerId: true } } },
    });
    if (!so) return res.status(404).json({ error: 'Pedido não encontrado' });
    const canAccess = so.marketOrder.buyerId === userId || so.sellerId === userId || role === 'ADMIN';
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });
    const messages = await prisma.sellerOrderChatMessage.findMany({
      where: { sellerOrderId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ messages });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};

export const sendSellerOrderChatMessage = async (req: Request, res: Response) => {
  const sellerOrderId = param(req.params.sellerOrderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const { content, adminIntervention } = req.body as { content?: string; adminIntervention?: boolean };
  try {
    if (!sellerOrderId) return res.status(400).json({ error: 'sellerOrderId obrigatório' });
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    const so = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { marketOrder: { select: { buyerId: true } } },
    });
    if (!so) return res.status(404).json({ error: 'Pedido não encontrado' });
    const canAccess = so.marketOrder.buyerId === userId || so.sellerId === userId || role === 'ADMIN';
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });
    const message = await prisma.sellerOrderChatMessage.create({
      data: {
        sellerOrderId,
        senderId: userId,
        messageType: 'TEXT',
        content: text,
        isFromAdmin: role === 'ADMIN',
        adminIntervention: !!adminIntervention,
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    return res.status(201).json({ message });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};

export const sendSellerOrderChatAttachment = async (req: Request, res: Response) => {
  const sellerOrderId = param(req.params.sellerOrderId);
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    if (!sellerOrderId) return res.status(400).json({ error: 'sellerOrderId obrigatório' });
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    if (file.size > MAX_ATTACHMENT_SIZE) return res.status(400).json({ error: 'Arquivo muito grande. Máximo 20MB.' });
    const so = await prisma.sellerOrder.findUnique({
      where: { id: sellerOrderId },
      include: { marketOrder: { select: { buyerId: true } } },
    });
    if (!so) return res.status(404).json({ error: 'Pedido não encontrado' });
    const canAccess = so.marketOrder.buyerId === userId || so.sellerId === userId || role === 'ADMIN';
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });
    const relativePath = `uploads/chat-attachments/${file.filename}`;
    const message = await prisma.sellerOrderChatMessage.create({
      data: {
        sellerOrderId,
        senderId: userId,
        messageType: 'ATTACHMENT',
        content: file.originalname || file.filename,
        attachmentPath: relativePath,
        attachmentName: file.originalname || file.filename,
        attachmentSize: file.size,
        attachmentMime: file.mimetype,
        isFromAdmin: role === 'ADMIN',
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    return res.status(201).json({ message });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};

export const downloadSellerOrderChatAttachment = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  const messageId = param(req.params.messageId);
  try {
    if (!messageId) return res.status(400).json({ error: 'messageId obrigatório' });
    const message = await prisma.sellerOrderChatMessage.findUnique({
      where: { id: messageId },
      include: { sellerOrder: { include: { marketOrder: { select: { buyerId: true } } } } },
    });
    if (!message || !message.attachmentPath) return res.status(404).json({ error: 'Anexo não encontrado' });
    const canAccess = message.sellerOrder.marketOrder.buyerId === userId || message.sellerOrder.sellerId === userId || role === 'ADMIN';
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });
    const fullPath = path.isAbsolute(message.attachmentPath) ? message.attachmentPath : path.resolve(process.cwd(), message.attachmentPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    return res.download(fullPath, message.attachmentName || 'anexo');
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};

export const markSellerOrderChatAsRead = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const messageId = param(req.params.messageId);
  try {
    if (!messageId) return res.status(400).json({ error: 'messageId obrigatório' });
    const msg = await prisma.sellerOrderChatMessage.findUnique({
      where: { id: messageId },
      include: { sellerOrder: { include: { marketOrder: { select: { buyerId: true } } } } },
    });
    if (!msg || msg.senderId === userId) return res.status(404).json({ error: 'Mensagem não encontrada' });
    const canAccess = msg.sellerOrder.marketOrder.buyerId === userId || msg.sellerOrder.sellerId === userId;
    if (!canAccess) return res.status(403).json({ error: 'Acesso negado' });
    if (!msg.readAt) {
      await prisma.sellerOrderChatMessage.update({ where: { id: messageId }, data: { readAt: new Date() } });
    }
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro' });
  }
};
