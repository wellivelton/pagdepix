import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Deve ser usado após authMiddleware em rotas protegidas.
 * Se modo manutenção estiver ativo e o usuário não for ADMIN, retorna 503 com mensagem.
 */
export const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await prisma.config.findUnique({
      where: { id: 'config' },
      select: { maintenanceMode: true, maintenanceMessage: true }
    });
    const active = config?.maintenanceMode ?? false;
    if (!active) return next();

    const role = (req as any).userRole;
    if (role === 'ADMIN') return next();

    const message = config?.maintenanceMessage?.trim() || 'Sistema em manutenção. Tente novamente em breve.';
    return res.status(503).json({
      maintenance: true,
      error: 'maintenance',
      message
    });
  } catch (error) {
    console.error('Erro no middleware de manutenção:', error);
    return next();
  }
};
