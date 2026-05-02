import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = new PrismaClient();

/** GET público - status do modo manutenção (sem auth) */
export const getMaintenanceStatusPublic = async (_req: Request, res: Response) => {
  try {
    const config = await prisma.config.findUnique({
      where: { id: 'config' },
      select: { maintenanceMode: true, maintenanceMessage: true }
    });
    const active = config?.maintenanceMode ?? false;
    const message = config?.maintenanceMessage ?? null;
    return res.status(200).json({ active, message });
  } catch (error) {
    console.error('Erro ao obter status de manutenção:', error);
    return res.status(500).json({ active: false, message: null });
  }
};

/** GET admin - status do modo manutenção (para o painel) */
export const getAdminMaintenance = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const config = await prisma.config.findUnique({
      where: { id: 'config' },
      select: {
        maintenanceMode: true,
        maintenanceMessage: true,
        maintenanceUpdatedAt: true,
        maintenanceUpdatedBy: true
      }
    });
    return res.status(200).json({
      active: config?.maintenanceMode ?? false,
      message: config?.maintenanceMessage ?? null,
      updatedAt: config?.maintenanceUpdatedAt ?? null,
      updatedBy: config?.maintenanceUpdatedBy ?? null
    });
  } catch (error) {
    console.error('Erro ao obter status de manutenção:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

/** POST admin - ativar/desativar modo manutenção */
export const setMaintenance = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const { active, message } = req.body as { active: boolean; message?: string | null };
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'Campo "active" é obrigatório (boolean)' });
    }

    const now = new Date();
    const updateData: any = {
      maintenanceMode: active,
      maintenanceMessage: active && message != null && String(message).trim() !== '' ? String(message).trim() : null,
      maintenanceUpdatedAt: now,
      maintenanceUpdatedBy: adminId
    };

    await prisma.config.upsert({
      where: { id: 'config' },
      update: updateData,
      create: {
        id: 'config',
        walletAddress: env.LIQUID_WALLET_ADDRESS,
        qrCodeUrl: '/qr-code.png',
        ...updateData
      }
    });

    await prisma.log.create({
      data: {
        action: active ? 'maintenance_mode_activated' : 'maintenance_mode_deactivated',
        details: JSON.stringify({
          adminId,
          message: updateData.maintenanceMessage,
          at: now.toISOString()
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId
      }
    });

    return res.status(200).json({
      message: active ? 'Modo manutenção ativado' : 'Modo manutenção desativado',
      active: updateData.maintenanceMode,
      maintenanceMessage: updateData.maintenanceMessage
    });
  } catch (error: any) {
    console.error('Erro ao definir modo manutenção:', error);
    const isPrisma = error?.code === 'P2010' || error?.code === 'P2002' || (error?.message && String(error.message).toLowerCase().includes('unknown arg'));
    const hint = isPrisma || (error?.message && String(error.message).includes('maintenance'))
      ? ' As colunas de manutenção podem não existir na tabela Config. Rode no backend: npx prisma migrate deploy'
      : '';
    return res.status(500).json({
      error: 'Erro ao atualizar modo manutenção.' + hint,
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};
