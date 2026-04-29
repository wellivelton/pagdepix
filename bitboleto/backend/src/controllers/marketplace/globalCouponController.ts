import { Request, Response } from 'express';
import { prisma } from '../../prisma';

/**
 * Admin: listar cupons globais.
 */
export const adminListGlobalCoupons = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const coupons = await prisma.globalCoupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(coupons);
  } catch (error) {
    console.error('Erro ao listar cupons globais:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: criar cupom global.
 */
export const adminCreateGlobalCoupon = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const { code, discountPercent, discountFixed, maxUsage, expiresAt, isActive } = req.body as {
      code?: string;
      discountPercent?: number;
      discountFixed?: number;
      maxUsage?: number | null;
      expiresAt?: string | null;
      isActive?: boolean;
    };

    const codeStr = (code || '').trim().toUpperCase();
    if (!codeStr || codeStr.length < 2) {
      return res.status(400).json({ error: 'Código obrigatório' });
    }

    const existing = await prisma.globalCoupon.findUnique({ where: { code: codeStr } });
    if (existing) return res.status(400).json({ error: 'Código já existe' });

    if ((discountPercent != null && discountPercent < 0) || (discountFixed != null && discountFixed < 0)) {
      return res.status(400).json({ error: 'Desconto inválido' });
    }

    const coupon = await prisma.globalCoupon.create({
      data: {
        code: codeStr,
        discountPercent: discountPercent != null ? discountPercent / 100 : null,
        discountFixed: discountFixed ?? null,
        maxUsage: maxUsage ?? null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(coupon);
  } catch (error) {
    console.error('Erro ao criar cupom:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: atualizar cupom global.
 */
export const adminUpdateGlobalCoupon = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { discountPercent, discountFixed, maxUsage, expiresAt, isActive } = req.body as {
      discountPercent?: number;
      discountFixed?: number;
      maxUsage?: number | null;
      expiresAt?: string | null;
      isActive?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (discountPercent != null) data.discountPercent = discountPercent / 100;
    if (discountFixed != null) data.discountFixed = discountFixed;
    if (maxUsage !== undefined) data.maxUsage = maxUsage;
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (isActive !== undefined) data.isActive = isActive;

    const coupon = await prisma.globalCoupon.update({
      where: { id },
      data,
    });
    res.json(coupon);
  } catch (error) {
    console.error('Erro ao atualizar cupom:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: excluir cupom global.
 */
export const adminDeleteGlobalCoupon = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await prisma.globalCoupon.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir cupom:', error);
    res.status(500).json({ error: 'Erro' });
  }
};
