import { Request, Response } from 'express';
import { prisma } from '../prisma';

// Acesso aos modelos de suporte (garantir que prisma generate foi rodado após add_support_chat)
const db = prisma as any;

// ========================================
// USUÁRIO: meus tickets
// ========================================

/** Lista tickets do usuário logado. */
export const listMyTickets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const tickets = await db.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const list = tickets.map((t: { id: string; status: string; priority: string | null; createdAt: Date; updatedAt: Date; messages: { content: string; createdAt: Date }[] }) => ({
      id: t.id,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessage: t.messages[0]
        ? { content: t.messages[0].content.slice(0, 80), createdAt: t.messages[0].createdAt }
        : null,
    }));

    return res.json({ tickets: list });
  } catch (e) {
    console.error('listMyTickets:', e);
    return res.status(500).json({ error: 'Erro ao listar tickets' });
  }
};

/** Cria um novo ticket (usuário). */
export const createTicket = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    if (!userId) return res.status(401).json({ error: 'Não autorizado' });

    const ticket = await db.supportTicket.create({
      data: { userId, status: 'OPEN' },
      include: { messages: true },
    });

    return res.status(201).json({ ticket });
  } catch (e) {
    console.error('createTicket:', e);
    return res.status(500).json({ error: 'Erro ao criar ticket' });
  }
};

/** Mensagens de um ticket (usuário só vê os próprios). */
export const getTicketMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const ticketId = req.params.id;
    if (!userId || !ticketId) return res.status(400).json({ error: 'ID do ticket é obrigatório' });

    const ticket = await db.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    return res.json({
      ticket: {
        id: ticket.id,
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
      messages: ticket.messages,
    });
  } catch (e) {
    console.error('getTicketMessages:', e);
    return res.status(500).json({ error: 'Erro ao carregar mensagens' });
  }
};

/** Envia mensagem no ticket (usuário). */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string;
    const ticketId = req.params.id;
    const { content } = req.body as { content?: string };
    if (!userId || !ticketId) return res.status(400).json({ error: 'ID do ticket é obrigatório' });
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }

    const ticket = await db.supportTicket.findFirst({
      where: { id: ticketId, userId },
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });
    if (ticket.status === 'RESOLVED') {
      return res.status(400).json({ error: 'Este ticket já foi encerrado' });
    }

    const message = await db.supportMessage.create({
      data: {
        ticketId,
        senderId: userId,
        isStaff: false,
        content: content.trim().slice(0, 5000),
      },
    });

    await db.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    });

    return res.status(201).json({ message });
  } catch (e) {
    console.error('sendMessage:', e);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

// ========================================
// ADMIN: todos os tickets
// ========================================

/** Lista todos os tickets (admin), com filtros. */
export const listAllTickets = async (req: Request, res: Response) => {
  try {
    const role = (req as any).userRole;
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const { status, search, page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(String(page || '1'), 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(String(limit || '20'), 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status && String(status) !== 'ALL') where.status = String(status);
    if (search && String(search).trim()) {
      where.user = {
        OR: [
          { name: { contains: String(search).trim(), mode: 'insensitive' } },
          { email: { contains: String(search).trim(), mode: 'insensitive' } },
          { telegram: { contains: String(search).trim(), mode: 'insensitive' } },
        ],
      };
    }

    const [tickets, total] = await Promise.all([
      db.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
        include: {
          user: { select: { id: true, name: true, email: true, telegram: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      db.supportTicket.count({ where }),
    ]);

    const list = tickets.map((t: { id: string; status: string; priority: string | null; createdAt: Date; updatedAt: Date; user: any; messages: { content: string; isStaff: boolean; createdAt: Date }[] }) => ({
      id: t.id,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      user: t.user,
      lastMessage: t.messages[0]
        ? { content: t.messages[0].content.slice(0, 80), isStaff: t.messages[0].isStaff, createdAt: t.messages[0].createdAt }
        : null,
    }));

    return res.json({ tickets: list, total, page: pageNum, limit: limitNum });
  } catch (e) {
    console.error('listAllTickets:', e);
    return res.status(500).json({ error: 'Erro ao listar tickets' });
  }
};

/** Detalhes do ticket + mensagens (admin). */
export const getTicketForAdmin = async (req: Request, res: Response) => {
  try {
    const role = (req as any).userRole;
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const ticketId = req.params.id;
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    return res.json({ ticket });
  } catch (e) {
    console.error('getTicketForAdmin:', e);
    return res.status(500).json({ error: 'Erro ao carregar ticket' });
  }
};

/** Atualiza status do ticket (admin). */
export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const role = (req as any).userRole;
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const ticketId = req.params.id;
    const { status } = req.body as { status?: string };
    const allowed = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use: OPEN, IN_PROGRESS, RESOLVED' });
    }

    const ticket = await db.supportTicket.update({
      where: { id: ticketId },
      data: { status },
      include: { user: { select: { id: true, name: true, email: true, telegram: true } }, messages: true },
    });

    return res.json({ ticket });
  } catch (e) {
    console.error('updateTicketStatus:', e);
    return res.status(500).json({ error: 'Erro ao atualizar status' });
  }
};

/** Admin envia mensagem no ticket (isStaff = true). */
export const sendMessageAsStaff = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId as string;
    const role = (req as any).userRole;
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const ticketId = req.params.id;
    const { content } = req.body as { content?: string };
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Mensagem não pode ser vazia' });
    }

    const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: 'Ticket não encontrado' });

    const message = await db.supportMessage.create({
      data: {
        ticketId,
        senderId: adminId,
        isStaff: true,
        content: content.trim().slice(0, 5000),
      },
    });

    await db.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date(), status: 'IN_PROGRESS' },
    });

    return res.status(201).json({ message });
  } catch (e) {
    console.error('sendMessageAsStaff:', e);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

/** Contagem de tickets abertos / em andamento (admin, para badge). */
export const getSupportCounts = async (req: Request, res: Response) => {
  try {
    const role = (req as any).userRole;
    if (role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const [open, inProgress] = await Promise.all([
      db.supportTicket.count({ where: { status: 'OPEN' } }),
      db.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
    ]);

    return res.json({ open, inProgress, total: open + inProgress });
  } catch (e) {
    console.error('getSupportCounts:', e);
    return res.status(500).json({ error: 'Erro ao obter contagem' });
  }
};
