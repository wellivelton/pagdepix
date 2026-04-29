import { Request, Response } from 'express';
import { prisma } from '../../prisma';

function param(id: string | string[] | undefined): string | undefined {
  return Array.isArray(id) ? id[0] : id;
}

/**
 * Listar banners ativos (público - vitrine).
 */
export const listBanners = async (req: Request, res: Response) => {
  try {
    const banners = await prisma.marketplaceBanner.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    res.json(banners);
  } catch (error) {
    console.error('Erro ao listar banners:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: listar todos os banners.
 */
export const adminListBanners = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    const banners = await prisma.marketplaceBanner.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(banners);
  } catch (error) {
    console.error('Erro ao listar banners:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: criar banner.
 */
export const createBanner = async (req: Request, res: Response) => {
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const body = req.body as {
      desktopImageUrl?: string;
      desktopLinkType?: string;
      desktopLinkTarget?: string;
      mobileImageUrl?: string;
      mobileLinkType?: string;
      mobileLinkTarget?: string;
      isActive?: boolean;
      displayOrder?: number;
    };

    const banner = await prisma.marketplaceBanner.create({
      data: {
        desktopImageUrl: body.desktopImageUrl || '',
        desktopLinkType: body.desktopLinkType || 'none',
        desktopLinkTarget: body.desktopLinkTarget || null,
        mobileImageUrl: body.mobileImageUrl || body.desktopImageUrl || '',
        mobileLinkType: body.mobileLinkType || 'none',
        mobileLinkTarget: body.mobileLinkTarget || null,
        isActive: body.isActive !== false,
        displayOrder: typeof body.displayOrder === 'number' ? body.displayOrder : 0,
      },
    });
    res.status(201).json({ success: true, banner });
  } catch (error) {
    console.error('Erro ao criar banner:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: atualizar banner.
 */
export const updateBanner = async (req: Request, res: Response) => {
  const bannerId = param(req.params.bannerId);
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!bannerId) return res.status(400).json({ error: 'bannerId obrigatório' });

    const body = req.body as Record<string, unknown>;
    const data: any = {};
    if (body.desktopImageUrl != null) data.desktopImageUrl = String(body.desktopImageUrl);
    if (body.desktopLinkType != null) data.desktopLinkType = String(body.desktopLinkType);
    if (body.desktopLinkTarget != null) data.desktopLinkTarget = body.desktopLinkTarget ? String(body.desktopLinkTarget) : null;
    if (body.mobileImageUrl != null) data.mobileImageUrl = String(body.mobileImageUrl);
    if (body.mobileLinkType != null) data.mobileLinkType = String(body.mobileLinkType);
    if (body.mobileLinkTarget != null) data.mobileLinkTarget = body.mobileLinkTarget ? String(body.mobileLinkTarget) : null;
    if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
    if (typeof body.displayOrder === 'number') data.displayOrder = body.displayOrder;

    const banner = await prisma.marketplaceBanner.update({
      where: { id: bannerId },
      data,
    });
    res.json({ success: true, banner });
  } catch (error) {
    console.error('Erro ao atualizar banner:', error);
    res.status(500).json({ error: 'Erro' });
  }
};

/**
 * Admin: remover banner.
 */
export const deleteBanner = async (req: Request, res: Response) => {
  const bannerId = param(req.params.bannerId);
  try {
    if ((req as any).userRole !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });
    if (!bannerId) return res.status(400).json({ error: 'bannerId obrigatório' });
    await prisma.marketplaceBanner.delete({ where: { id: bannerId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao remover banner:', error);
    res.status(500).json({ error: 'Erro' });
  }
};
