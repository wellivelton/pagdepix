import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

/**
 * Exige que o usuário tenha CommercePartner APPROVED ou seja ADMIN.
 * Compatível com role COMMERCE legado e com o novo fluxo (USER + CommercePartner).
 */
export async function checkSellerRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  const role = (req as any).userRole;
  const userId = (req as any).userId;

  if (role === 'ADMIN') {
    next();
    return;
  }

  const partner = await prisma.commercePartner.findUnique({
    where: { userId },
    select: { status: true }
  });

  if (partner?.status === 'APPROVED') {
    next();
    return;
  }

  res.status(403).json({ error: 'Apenas comerciantes podem acessar esta área' });
}
