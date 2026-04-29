import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configurações de brute force
const MAX_ATTEMPTS_PER_EMAIL = 5; // Máximo de tentativas por email
const MAX_ATTEMPTS_PER_IP = 10; // Máximo de tentativas por IP
const LOCKOUT_DURATION_MINUTES = 15; // Tempo de bloqueio em minutos

/**
 * Middleware de proteção contra brute force para login
 * Verifica tentativas anteriores e bloqueia se necessário
 */
export const bruteForceProtection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;
    const ip = req.ip || 'unknown';
    const now = new Date();
    const lockoutThreshold = new Date(now.getTime() - LOCKOUT_DURATION_MINUTES * 60 * 1000);

    // Verificar tentativas por email (se email fornecido)
    if (email) {
      const emailAttempts = await prisma.loginAttempt.count({
        where: {
          email,
          success: false,
          createdAt: { gte: lockoutThreshold }
        }
      });

      if (emailAttempts >= MAX_ATTEMPTS_PER_EMAIL) {
        return res.status(429).json({
          error: `Muitas tentativas de login para este email. Tente novamente em ${LOCKOUT_DURATION_MINUTES} minutos.`
        });
      }
    }

    // Verificar tentativas por IP
    const ipAttempts = await prisma.loginAttempt.count({
      where: {
        ip,
        success: false,
        createdAt: { gte: lockoutThreshold }
      }
    });

    if (ipAttempts >= MAX_ATTEMPTS_PER_IP) {
      return res.status(429).json({
        error: `Muitas tentativas de login deste IP. Tente novamente em ${LOCKOUT_DURATION_MINUTES} minutos.`
      });
    }

    // Adicionar função para registrar tentativa após o login
    (req as any).registerLoginAttempt = async (success: boolean, email?: string) => {
      await prisma.loginAttempt.create({
        data: {
          email: email || null,
          ip,
          success
        }
      });

      // Limpar tentativas antigas (mais de 1 hora)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      await prisma.loginAttempt.deleteMany({
        where: {
          createdAt: { lt: oneHourAgo }
        }
      });
    };

    next();
  } catch (error) {
    console.error('Erro no middleware de brute force:', error);
    // Em caso de erro, permite continuar (fail open)
    next();
  }
};
