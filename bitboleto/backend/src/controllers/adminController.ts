import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { calculateTax, costForAmount, getAffiliateCommissionFromProfit, REFERRAL_RATE } from '../utils/taxConfig';

const telegramService = require('../services/telegram.service') as { notifyUserByTelegram?: (userId: string, text: string) => Promise<void> };
const notifyUserByTelegram = telegramService.notifyUserByTelegram ?? (async () => {});

import { dispatchWebhook } from '../services/webhookService';
import { env } from '../config/env';
import { notifyBoletoApproved, notifyAffiliateCommission, notifyWithdrawalProcessed } from '../services/push.service';
import { approveBoletoService } from '../services/approveBoleto';

// Re-exportar funções de manutenção (definidas em maintenanceController para evitar dependência circular)
export { getMaintenanceStatusPublic, getAdminMaintenance, setMaintenance } from './maintenanceController';

// ========================================
// CONFIGURAÇÕES DA CARTEIRA (ADMIN)
// ========================================

// GET - Obter configurações da carteira
export const getWalletConfig = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buscar ou criar configuração padrão
    let config = await prisma.config.findUnique({
      where: { id: 'config' }
    });

    if (!config) {
      // Criar configuração padrão se não existir
      config = await prisma.config.create({
        data: {
          id: 'config',
          walletAddress: env.LIQUID_WALLET_ADDRESS,
          qrCodeUrl: '/qr-code.png'
        }
      });
    }

    return res.status(200).json({
      walletAddress: config.walletAddress,
      qrCodeUrl: config.qrCodeUrl,
      walletAddressUsdt: config.walletAddressUsdt || '',
      qrCodeUrlUsdt: config.qrCodeUrlUsdt || '',
      walletAddressBtc: config.walletAddressBtc || '',
      qrCodeUrlBtc: config.qrCodeUrlBtc || '',
      rateLockMinutes: config.rateLockMinutes,
      commerceWalletDepix: (config as any).commerceWalletDepix || '',
      updatedAt: config.updatedAt
    });

  } catch (error) {
    console.error('Erro ao obter configurações da carteira:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao obter configurações' 
    });
  }
};

// PUT - Atualizar configurações da carteira
export const updateWalletConfig = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { walletAddress, qrCodeUrl, walletAddressUsdt, qrCodeUrlUsdt, walletAddressBtc, qrCodeUrlBtc, rateLockMinutes } = req.body;

    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Endereço da carteira Depix é obrigatório' 
      });
    }

    if (!qrCodeUrl || typeof qrCodeUrl !== 'string' || qrCodeUrl.trim().length === 0) {
      return res.status(400).json({ 
        error: 'URL do QR Code Depix é obrigatória' 
      });
    }

    const updateData: any = {
      walletAddress: walletAddress.trim(),
      qrCodeUrl: qrCodeUrl.trim(),
      updatedBy: adminId,
    };

    if (walletAddressUsdt !== undefined) updateData.walletAddressUsdt = walletAddressUsdt?.trim() || null;
    if (qrCodeUrlUsdt !== undefined) updateData.qrCodeUrlUsdt = qrCodeUrlUsdt?.trim() || null;
    if (walletAddressBtc !== undefined) updateData.walletAddressBtc = walletAddressBtc?.trim() || null;
    if (qrCodeUrlBtc !== undefined) updateData.qrCodeUrlBtc = qrCodeUrlBtc?.trim() || null;
    if (rateLockMinutes !== undefined) updateData.rateLockMinutes = Math.max(1, Math.min(60, parseInt(rateLockMinutes) || 10));
    const { commerceWalletDepix } = req.body;
    if (commerceWalletDepix !== undefined) updateData.commerceWalletDepix = commerceWalletDepix?.trim() || null;

    const config = await prisma.config.upsert({
      where: { id: 'config' },
      update: updateData,
      create: {
        id: 'config',
        ...updateData,
      }
    });

    await prisma.log.create({
      data: {
        action: 'wallet_config_updated',
        details: JSON.stringify({ 
          walletAddress: config.walletAddress,
          qrCodeUrl: config.qrCodeUrl,
          walletAddressUsdt: config.walletAddressUsdt,
          walletAddressBtc: config.walletAddressBtc,
          rateLockMinutes: config.rateLockMinutes,
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId
      }
    });

    return res.status(200).json({
      message: 'Configurações atualizadas com sucesso',
      walletAddress: config.walletAddress,
      qrCodeUrl: config.qrCodeUrl,
      walletAddressUsdt: config.walletAddressUsdt || '',
      qrCodeUrlUsdt: config.qrCodeUrlUsdt || '',
      walletAddressBtc: config.walletAddressBtc || '',
      qrCodeUrlBtc: config.qrCodeUrlBtc || '',
      rateLockMinutes: config.rateLockMinutes,
      commerceWalletDepix: (config as any).commerceWalletDepix || '',
      updatedAt: config.updatedAt
    });

  } catch (error) {
    console.error('Erro ao atualizar configurações da carteira:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao atualizar configurações' 
    });
  }
};

// ========================================
// LISTAR USUÁRIOS (ADMIN)
// ========================================
export const listUsers = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { page = 1, limit = 50, search, role } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (role === 'USER' || role === 'COMMERCE' || role === 'AFFILIATE') {
      where.role = role;
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { telegram: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          telegram: true,
          role: true,
          isActive: true,
          isBlocked: true,
          totalPaid: true,
          createdAt: true,
          lastLoginAt: true,
          lastLoginIp: true,
          lastLoginCity: true,
          lastLoginCountry: true,
          lastLoginIsVpn: true,
          commercePartner: { select: { id: true, status: true, createdByAdmin: true, businessType: true, documentType: true, createdAt: true } },
        } as any,
      }),
      prisma.user.count({ where }),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      }
    });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro interno ao listar usuários' });
  }
};

// ========================================
// AÇÕES EM USUÁRIO (ADMIN)
// ========================================
const paramId = (p: string | string[] | undefined): string =>
  (Array.isArray(p) ? p[0] : p) ?? '';

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const { action } = req.body as {
      action: 'block' | 'unblock' | 'activate' | 'deactivate' | 'set_limit' | 'set_max_boleto' | 'delete' | 'approve_commerce' | 'reject_commerce';
    };
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { commercePartner: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const data: any = {};
    let logAction = '';
    const details: any = { targetUserId: id };

    if (action === 'approve_commerce' || action === 'reject_commerce') {
      if (!(user as any).commercePartner) {
        return res.status(400).json({ error: 'Usuário não é parceiro Modo Comércio' });
      }
      const status = action === 'approve_commerce' ? 'APPROVED' : 'REJECTED';
      await (prisma as any).commercePartner.update({
        where: { userId: id },
        data: { status },
      });
      logAction = action === 'approve_commerce' ? 'admin_commerce_approved' : 'admin_commerce_rejected';
      details.status = status;
      const updatedUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true, name: true, email: true, telegram: true, role: true,
          isActive: true, isBlocked: true, totalPaid: true,
          lastLoginAt: true, lastLoginIp: true, lastLoginCity: true, lastLoginCountry: true, lastLoginIsVpn: true,
        },
      });
      await prisma.log.create({
        data: { action: logAction, details: JSON.stringify(details), ip: req.ip || 'unknown', userAgent: req.get('user-agent') || 'unknown', userId: adminId },
      });
      return res.status(200).json({
        message: action === 'approve_commerce' ? 'Comerciante aprovado.' : 'Comerciante rejeitado.',
        user: updatedUser,
      });
    }

    switch (action) {
      case 'block':
        data.isBlocked = true;
        logAction = 'admin_user_blocked';
        break;
      case 'unblock':
        data.isBlocked = false;
        logAction = 'admin_user_unblocked';
        break;
      case 'activate':
        data.isActive = true;
        logAction = 'admin_user_activated';
        break;
      case 'deactivate':
        data.isActive = false;
        logAction = 'admin_user_deactivated';
        break;
      case 'set_limit':
      case 'set_max_boleto':
        return res.status(410).json({ error: 'Limites máximos foram removidos do sistema.' });
      case 'delete':
        // "Excluir para sempre": manter integridade referencial,
        // mas tornar a conta inutilizável e anonimizada.
        data.isActive = false;
        data.isBlocked = true;
        data.email = `deleted+${user.id}@pagdepix.local`;
        data.telegram = `@deleted_${user.id.slice(0, 8)}`;
        data.name = 'Conta excluída';
        logAction = 'admin_user_deleted';
        break;
      default:
        return res.status(400).json({ error: 'Ação inválida' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        telegram: true,
        role: true,
        isActive: true,
        isBlocked: true,
        totalPaid: true,
        lastLoginAt: true,
        lastLoginIp: true,
        lastLoginCity: true,
        lastLoginCountry: true,
        lastLoginIsVpn: true,
      }
    });

    // Registrar log da ação do admin
    await prisma.log.create({
      data: {
        action: logAction,
        details: JSON.stringify(details),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId,
      }
    });

    return res.status(200).json({
      message: 'Usuário atualizado com sucesso',
      user: updated,
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
  }
};

// ========================================
// APROVAR BOLETO
// ========================================
export const approveBoleto = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    // @ts-ignore
    const adminId = req.userId;
    const file = (req as any).file as { filename?: string } | undefined;

    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let receiptUrl: string | undefined;
    if (file) {
      const baseUrl = process.env.APP_URL || 'http://localhost:3001';
      receiptUrl = `${baseUrl}/uploads/boletos/${file.filename}`;
    }

    const result = await approveBoletoService(id, {
      receiptUrl,
      adminNotes: req.body?.adminNotes?.trim() || undefined,
    });

    if (!result.success) {
      const status = result.error === 'Boleto não encontrado.' ? 404 : 400;
      return res.status(status).json({ error: result.error });
    }

    await prisma.log.create({
      data: {
        action: 'boleto_approved',
        details: JSON.stringify({ boletoId: id, adminId, amount: result.boleto?.totalAmount }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId,
      },
    });

    return res.status(200).json({ message: 'Boleto aprovado com sucesso', boleto: result.boleto });
  } catch (error) {
    console.error('Erro ao aprovar boleto:', error);
    return res.status(500).json({ error: 'Erro interno ao aprovar boleto' });
  }
};

// ========================================
// REJEITAR BOLETO
// ========================================
export const rejectBoleto = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const { reason } = req.body;
    // @ts-ignore
    const adminId = req.userId;

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Motivo é obrigatório' });
    }

    // Buscar boleto
    const boleto = await prisma.boleto.findUnique({
      where: { id }
    });

    if (!boleto) {
      return res.status(404).json({ error: 'Boleto não encontrado' });
    }

    if (boleto.status !== 'PENDING') {
      return res.status(400).json({ error: 'Boleto já processado' });
    }

    // Atualizar boleto para PROBLEM
    const boletoAtualizado = await prisma.boleto.update({
      where: { id },
      data: {
        status: 'PROBLEM',
        problemReason: reason
      }
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'boleto_rejected',
        details: JSON.stringify({
          boletoId: boleto.id,
          adminId,
          reason
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId
      }
    });

    // Webhook para API White-Label
    if ((boleto as any).apiKeyId) {
      dispatchWebhook('payment.refused', boleto.id, 'boleto', {
        amount: boleto.amount,
        totalAmount: boleto.totalAmount,
        status: 'PROBLEM',
        reason,
        externalRef: (boleto as any).externalRef,
      }, (boleto as any).apiKeyId, (boleto as any).isSandbox).catch(() => {});
    }

    return res.status(200).json({
      message: 'Boleto rejeitado',
      boleto: boletoAtualizado
    });

  } catch (error) {
    console.error('Erro ao rejeitar boleto:', error);
    return res.status(500).json({ error: 'Erro interno ao rejeitar boleto' });
  }
};

// ========================================
// LISTAR TODOS OS BOLETOS (ADMIN)
// ========================================
export const listAllBoletos = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    // Verificar se é admin
    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { status, page = 1, limit = 50 } = req.query;

    // Exibir apenas boletos onde o usuário confirmou o pagamento:
    // - boleto individual com TXID enviado, OU
    // - boleto de lote onde o lote tem TXID enviado
    const where: any = {
      OR: [
        { txid: { not: null } },
        { batch: { txid: { not: null } } },
      ],
    };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [boletos, total] = await Promise.all([
      prisma.boleto.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              telegram: true
            }
          },
          coupon: true
        }
      }),
      prisma.boleto.count({ where })
    ]);

    return res.status(200).json({
      boletos,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('Erro ao listar boletos:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// TORNAR USUÁRIO AFILIADO / CONFIGURAR CUPOM
// ========================================
export const makeAffiliateForUser = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const { discountPercent, commissionPercent, couponCode, maxUsage } = req.body as {
      discountPercent: number;
      commissionPercent: number;
      couponCode?: string;
      maxUsage?: number | null;
    };
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (discountPercent < 0 || commissionPercent < 0) {
      return res.status(400).json({ error: 'Percentuais inválidos' });
    }

    if (maxUsage !== null && maxUsage !== undefined && maxUsage < 0) {
      return res.status(400).json({ error: 'MaxUsage inválido' });
    }

    const discount = discountPercent / 100;
    const commission = commissionPercent / 100;

    // Usar código fornecido ou gerar a partir do telegram/nome
    let finalCouponCode = couponCode?.toUpperCase().trim();
    if (!finalCouponCode || finalCouponCode === '') {
      const baseCode =
        (user.telegram || user.name || 'AFILIADO')
          .replace('@', '')
          .replace(/\s+/g, '')
          .toUpperCase()
          .slice(0, 10) || 'AFILIADO';
      finalCouponCode = `${baseCode}`;
    }

    // Verificar se o código já existe (se não for o mesmo afiliado)
    const existingCoupon = await prisma.coupon.findUnique({
      where: { code: finalCouponCode },
      include: { affiliate: true }
    });

    if (existingCoupon && existingCoupon.affiliate?.userId !== user.id) {
      return res.status(400).json({ error: 'Código de cupom já existe' });
    }

    // Criar ou atualizar Affiliate
    let affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
    });

    if (!affiliate) {
      affiliate = await prisma.affiliate.create({
        data: {
          userId: user.id,
          couponCode: finalCouponCode,
          isActive: true,
        },
      });
    } else {
      // Se o código mudou, atualizar
      if (affiliate.couponCode !== finalCouponCode) {
        affiliate = await prisma.affiliate.update({
          where: { id: affiliate.id },
          data: { couponCode: finalCouponCode },
        });
      }
    }

    // Criar ou atualizar Coupon ligado a esse afiliado
    const coupon = await prisma.coupon.upsert({
      where: { code: finalCouponCode },
      update: {
        discount,
        commission,
        affiliateId: affiliate.id,
        isActive: true,
        maxUsage: maxUsage === null || maxUsage === undefined ? null : maxUsage,
      },
      create: {
        code: finalCouponCode,
        discount,
        commission,
        affiliateId: affiliate.id,
        isActive: true,
        maxUsage: maxUsage === null || maxUsage === undefined ? null : maxUsage,
      },
    });

    // Atualizar role do usuário para AFFILIATE (mantém permissões normais de usuário)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'AFFILIATE',
      },
    });

    // Logar ação
    await prisma.log.create({
      data: {
        action: 'admin_user_made_affiliate',
        details: JSON.stringify({
          targetUserId: user.id,
          couponCode: coupon.code,
          discountPercent,
          commissionPercent,
          maxUsage: coupon.maxUsage,
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId,
      },
    });

    return res.status(200).json({
      message: 'Afiliado configurado com sucesso',
      affiliate: {
        id: affiliate.id,
        couponCode: affiliate.couponCode,
        discountPercent,
        commissionPercent,
        maxUsage: coupon.maxUsage,
      },
    });
  } catch (error) {
    console.error('Erro ao configurar afiliado:', error);
    return res.status(500).json({ error: 'Erro interno ao configurar afiliado' });
  }
};

// ========================================
// VERIFICAR EMAIL/TELEGRAM DO USUÁRIO (ADMIN)
// ========================================
export const verifyUser = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const { type, verified } = req.body as {
      type: 'email' | 'telegram';
      verified: boolean;
    };
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const user = await prisma.user.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const updateData: any = {};
    if (type === 'email') {
      updateData.emailVerified = verified;
    } else if (type === 'telegram') {
      updateData.telegramVerified = verified;
    } else {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: `admin_verify_${type}`,
        details: JSON.stringify({
          targetUserId: id,
          verified,
          adminId
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId
      }
    });

    return res.status(200).json({
      message: `${type === 'email' ? 'Email' : 'Telegram'} ${verified ? 'verificado' : 'desverificado'} com sucesso`,
      user: updated
    });

  } catch (error) {
    console.error('Erro ao verificar usuário:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// LISTAR AFILIADOS (ADMIN)
// ========================================
export const listAffiliates = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const affiliates = await prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegram: true,
            role: true,
            isActive: true,
            isBlocked: true,
            createdAt: true,
          }
        },
        coupons: {
          select: {
            id: true,
            code: true,
            isActive: true,
            usageCount: true,
            maxUsage: true,
            discount: true,
            commission: true,
          }
        },
        apiConfig: {
          select: {
            id: true,
            status: true,
            globalDailyLimitPerUser: true,
            maxDailyVolumeAffiliate: true,
            activatedAt: true,
            blockedAt: true,
            blockedReason: true,
          }
        },
        apiKeys: {
          select: {
            id: true,
            keyPrefix: true,
            isActive: true,
            suspendedAt: true,
            requestCount: true,
            lastUsedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    // Buscar breakdown de ganhos (cupom vs API) de todos os afiliados de uma vez
    const allTx = await prisma.affiliateTransaction.findMany({
      where: { affiliateId: { in: affiliates.map(a => a.id) } },
      select: { affiliateId: true, commission: true, boletoId: true, mobileRechargeId: true, depixOrderId: true,
                boleto: { select: { apiKeyId: true } } },
    });

    // Agrupar por affiliateId
    const earningsByAffiliate: Record<string, { coupon: number; api: number; recharge: number; total: number }> = {};
    for (const tx of allTx) {
      if (!earningsByAffiliate[tx.affiliateId]) {
        earningsByAffiliate[tx.affiliateId] = { coupon: 0, api: 0, recharge: 0, total: 0 };
      }
      const e = earningsByAffiliate[tx.affiliateId];
      const c = tx.commission ?? 0;
      e.total += c;
      if (tx.mobileRechargeId) {
        e.recharge += c;
      } else if (tx.boletoId && (tx.boleto as any)?.apiKeyId) {
        e.api += c;
      } else {
        e.coupon += c;
      }
    }

    const enriched = affiliates.map(a => {
      const e = earningsByAffiliate[a.id] ?? { coupon: 0, api: 0, recharge: 0, total: 0 };
      return {
        ...a,
        apiStatus: a.apiConfig?.status ?? 'inactive',
        apiKeysCount: a.apiKeys.length,
        hasApiIntegration: !!a.apiConfig && a.apiConfig.status !== 'inactive',
        earningsSummary: {
          coupon:   round2(e.coupon),
          api:      round2(e.api),
          recharge: round2(e.recharge),
          total:    round2(e.total),
        },
      };
    });

    return res.status(200).json({ affiliates: enriched ?? [] });
  } catch (error: any) {
    console.error('Erro ao listar afiliados:', error);
    const hint = error?.code || (error?.message && String(error.message).includes('Affiliate'))
      ? ' Verifique se as migrations foram aplicadas no backend (npx prisma migrate deploy).'
      : '';
    return res.status(500).json({
      error: 'Erro ao listar afiliados.' + hint,
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
};

// ========================================
// REMOVER AFILIAÇÃO (ADMIN)
// ========================================
export const removeAffiliate = async (req: Request, res: Response) => {
  try {
    const id = paramId(req.params.id);
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: { affiliate: { include: { coupons: true } } }
    });
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    type UserWithAffiliate = typeof user & { affiliate: { id: string; coupons: { id: string }[] } };
    const u = user as UserWithAffiliate;
    if (user.role !== 'AFFILIATE' || !u.affiliate) {
      return res.status(400).json({ error: 'Usuário não é afiliado' });
    }

    await prisma.user.update({
      where: { id },
      data: { role: 'USER' }
    });
    for (const c of u.affiliate.coupons) {
      await prisma.coupon.update({
        where: { id: c.id },
        data: { isActive: false }
      });
    }
    await prisma.affiliate.update({
      where: { id: u.affiliate.id },
      data: { isActive: false }
    });

    await prisma.log.create({
      data: {
        action: 'admin_affiliate_removed',
        details: JSON.stringify({ targetUserId: id, affiliateId: u.affiliate.id }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId
      }
    });

    return res.status(200).json({
      message: 'Afiliação removida com sucesso. Cupom desativado; usuário voltou a ser USER.'
    });
  } catch (error) {
    console.error('Erro ao remover afiliação:', error);
    return res.status(500).json({ error: 'Erro interno ao remover afiliação' });
  }
};

// ========================================
// AFFILIATE API INTEGRATION — ENDPOINTS ADMIN
// ========================================

export const getAffiliateApiIntegration = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: {
        user: { select: { name: true, email: true } },
        apiConfig: true,
        apiKeys: {
          select: {
            id: true, keyPrefix: true, isActive: true,
            suspendedAt: true, suspendedReason: true,
            requestCount: true, lastUsedAt: true, createdAt: true,
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!affiliate) return res.status(404).json({ error: 'Afiliado não encontrado' });

    // Ganhos dos últimos 30 dias
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const allTransactions = await prisma.affiliateTransaction.findMany({
      where: { affiliateId, createdAt: { gte: thirtyDaysAgo } },
      include: { boleto: { select: { apiKeyId: true } } }
    });

    const apiTx    = allTransactions.filter((t: any) => t.boleto?.apiKeyId != null);
    const couponTx = allTransactions.filter((t: any) => !t.boleto?.apiKeyId);

    return res.status(200).json({
      affiliate: { id: affiliate.id, user: affiliate.user },
      config: affiliate.apiConfig,
      apiKeys: affiliate.apiKeys,
      earnings: {
        period: '30_days',
        coupon: {
          total: round2(couponTx.reduce((s: number, t: any) => s + t.commission, 0)),
          count: couponTx.length,
        },
        api: {
          total: round2(apiTx.reduce((s: number, t: any) => s + t.commission, 0)),
          count: apiTx.length,
        },
        summary: {
          totalEarnings: round2(allTransactions.reduce((s: number, t: any) => s + t.commission, 0)),
        }
      }
    });
  } catch (error: any) {
    console.error('getAffiliateApiIntegration:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getAffiliateEarnings = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const { period } = req.query as { period?: string };

    let startDate: Date;
    let endDate: Date;

    if (period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      startDate = new Date(y, m - 1, 1);
      endDate   = new Date(y, m, 1);
    } else {
      endDate   = new Date();
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const allTx = await prisma.affiliateTransaction.findMany({
      where: { affiliateId, createdAt: { gte: startDate, lt: endDate } },
      include: {
        boleto: { select: { apiKeyId: true, amount: true } },
        mobileRecharge: { select: { affiliateId: true } },
      }
    });

    const apiTx      = allTx.filter((t: any) => t.boleto?.apiKeyId != null);
    const couponTx   = allTx.filter((t: any) => t.boletoId && !t.boleto?.apiKeyId);
    const rechargeTx = allTx.filter((t: any) => t.mobileRechargeId);
    const depixTx    = allTx.filter((t: any) => t.depixOrderId);

    const apiTotal      = round2(apiTx.reduce((s: number, t: any) => s + t.commission, 0));
    const couponTotal   = round2(couponTx.reduce((s: number, t: any) => s + t.commission, 0));
    const rechargeTotal = round2(rechargeTx.reduce((s: number, t: any) => s + t.commission, 0));
    const depixTotal    = round2(depixTx.reduce((s: number, t: any) => s + t.commission, 0));
    const totalEarnings = round2(allTx.reduce((s: number, t: any) => s + t.commission, 0));

    return res.status(200).json({
      period: period ?? 'last_30_days',
      coupon:   { total: couponTotal,   count: couponTx.length },
      api:      { total: apiTotal,      count: apiTx.length },
      recharge: { total: rechargeTotal, count: rechargeTx.length },
      depix:    { total: depixTotal,    count: depixTx.length },
      summary:  { totalEarnings }
    });
  } catch (error: any) {
    console.error('getAffiliateEarnings:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const updateAffiliateApiStatus = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const { status, reason } = req.body as { status: string; reason: string };

    const validStatuses = ['inactive', 'beta', 'active', 'blocked'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status inválido. Use: ${validStatuses.join(', ')}` });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo é obrigatório' });

    let config = await prisma.affiliateApiConfig.findUnique({ where: { affiliateId } });

    if (!config) {
      config = await prisma.affiliateApiConfig.create({
        data: { affiliateId }
      });
    }

    const oldStatus = config.status;

    const updatedConfig = await prisma.$transaction(async (tx: any) => {
      const updated = await tx.affiliateApiConfig.update({
        where: { affiliateId },
        data: {
          status,
          ...(status === 'blocked' ? {
            blockedAt: new Date(),
            blockedByAdminId: adminId,
            blockedByAdminEmail: admin.email,
            blockedReason: reason,
          } : {}),
          ...(status === 'active' || status === 'beta' ? {
            activatedAt: new Date(),
            activatedByAdminId: adminId,
            activatedByAdminEmail: admin.email,
          } : {}),
        }
      });

      // Se bloqueado, suspender TODAS as API keys do afiliado
      if (status === 'blocked') {
        await tx.apiKey.updateMany({
          where: { affiliateId },
          data: {
            isActive: false,
            suspendedAt: new Date(),
            suspendedReason: `Integração bloqueada pelo admin: ${reason}`,
          }
        });
      }

      return updated;
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'affiliate_api_config',
        entityId: affiliateId,
        action: 'update_status',
        details: { oldStatus, newStatus: status, reason } as any,
        userId: adminId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      }
    });

    return res.status(200).json({ success: true, config: updatedConfig });
  } catch (error: any) {
    console.error('updateAffiliateApiStatus:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const updateAffiliateApiLimits = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const { globalDailyLimitPerUser, maxDailyVolumeAffiliate, reason } = req.body;

    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo é obrigatório' });
    if (globalDailyLimitPerUser !== undefined && globalDailyLimitPerUser <= 0) {
      return res.status(400).json({ error: 'globalDailyLimitPerUser deve ser maior que 0' });
    }

    let config = await prisma.affiliateApiConfig.findUnique({ where: { affiliateId } });
    if (!config) {
      config = await prisma.affiliateApiConfig.create({ data: { affiliateId } });
    }

    const oldValues = {
      globalDailyLimitPerUser: config.globalDailyLimitPerUser,
      maxDailyVolumeAffiliate: config.maxDailyVolumeAffiliate,
    };

    const updated = await prisma.affiliateApiConfig.update({
      where: { affiliateId },
      data: {
        ...(globalDailyLimitPerUser !== undefined ? { globalDailyLimitPerUser } : {}),
        ...(maxDailyVolumeAffiliate !== undefined ? { maxDailyVolumeAffiliate: maxDailyVolumeAffiliate || null } : {}),
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'affiliate_api_config',
        entityId: affiliateId,
        action: 'update_limits',
        details: { oldValues, newValues: { globalDailyLimitPerUser, maxDailyVolumeAffiliate }, reason } as any,
        userId: adminId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      }
    });

    return res.status(200).json({ success: true, config: updated });
  } catch (error: any) {
    console.error('updateAffiliateApiLimits:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const getAffiliateAuditLog = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const offset = parseInt(String(req.query.offset ?? '0'));

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entityType: 'affiliate_api_config', entityId: affiliateId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({
        where: { entityType: 'affiliate_api_config', entityId: affiliateId as string },
      }),
    ]);

    return res.status(200).json({ data: logs, pagination: { total, limit, offset } });
  } catch (error: any) {
    console.error('getAffiliateAuditLog:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// AFFILIATE API END USERS — ENDPOINTS ADMIN
// ========================================

export const getAffiliateApiUsers = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const limit  = Math.min(parseInt(String(req.query.limit ?? '50')), 100);
    const offset = parseInt(String(req.query.offset ?? '0'));

    const [users, total] = await Promise.all([
      prisma.apiEndUserLimit.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.apiEndUserLimit.count({ where: { affiliateId } }),
    ]);

    return res.status(200).json({ data: users, pagination: { total, limit, offset } });
  } catch (error: any) {
    console.error('getAffiliateApiUsers:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const updateEndUserLimit = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const userRef     = String(req.params.userRef);
    const { dailyLimit, reason } = req.body;

    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo é obrigatório' });
    if (dailyLimit !== undefined && dailyLimit !== null && dailyLimit <= 0) {
      return res.status(400).json({ error: 'dailyLimit deve ser maior que 0' });
    }

    const endUser = await prisma.apiEndUserLimit.findUnique({
      where: { affiliateId_userRef: { affiliateId, userRef } }
    });
    if (!endUser) return res.status(404).json({ error: 'Usuário final não encontrado' });

    const updated = await prisma.apiEndUserLimit.update({
      where: { id: endUser.id },
      data: { dailyLimit: dailyLimit ?? null, customLimitReason: reason }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'api_end_user_limit',
        entityId: endUser.id,
        action: 'update_daily_limit',
        details: { affiliateId, userRef, oldValue: endUser.dailyLimit, newValue: dailyLimit, reason } as any,
        userId: adminId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      }
    });

    return res.status(200).json({ success: true, endUser: updated });
  } catch (error: any) {
    console.error('updateEndUserLimit:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const blockEndUser = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const userRef     = String(req.params.userRef);
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo é obrigatório' });

    const endUser = await prisma.apiEndUserLimit.findUnique({
      where: { affiliateId_userRef: { affiliateId, userRef } }
    });
    if (!endUser) return res.status(404).json({ error: 'Usuário final não encontrado' });

    const updated = await prisma.apiEndUserLimit.update({
      where: { id: endUser.id },
      data: {
        isActive: false,
        blockedAt: new Date(),
        blockedReason: reason,
        blockedByAdminId: adminId,
        blockedByAdminEmail: admin.email,
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'api_end_user_limit',
        entityId: endUser.id,
        action: 'block_user',
        details: { affiliateId, userRef, reason } as any,
        userId: adminId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      }
    });

    return res.status(200).json({ success: true, endUser: updated });
  } catch (error: any) {
    console.error('blockEndUser:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

export const unblockEndUser = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const affiliateId = String(req.params.id);
    const userRef     = String(req.params.userRef);
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Motivo é obrigatório' });

    const endUser = await prisma.apiEndUserLimit.findUnique({
      where: { affiliateId_userRef: { affiliateId, userRef } }
    });
    if (!endUser) return res.status(404).json({ error: 'Usuário final não encontrado' });

    const updated = await prisma.apiEndUserLimit.update({
      where: { id: endUser.id },
      data: {
        isActive: true,
        blockedAt: null,
        blockedReason: null,
        blockedByAdminId: null,
        blockedByAdminEmail: null,
      }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'api_end_user_limit',
        entityId: endUser.id,
        action: 'unblock_user',
        details: { affiliateId, userRef, reason } as any,
        userId: adminId,
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      }
    });

    return res.status(200).json({ success: true, endUser: updated });
  } catch (error: any) {
    console.error('unblockEndUser:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ========================================
// DASHBOARD ADMIN (KPIs, FILTROS, POR OPERAÇÃO)
// ========================================
export const getAdminDashboard = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { startDate, endDate, period } = req.query as { startDate?: string; endDate?: string; period?: string };
    const now = new Date();

    let dateStart: Date;
    let dateEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (startDate && endDate) {
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
    } else if (period === 'today') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      dateStart = new Date(now);
      dateStart.setDate(dateStart.getDate() - 7);
    } else if (period === 'month') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      dateStart = new Date(now.getFullYear(), 0, 1);
    } else {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const whereDate = { createdAt: { gte: dateStart, lte: dateEnd } };

    // === BOLETOS (PAID) ===
    const paidBoletos = await prisma.boleto.findMany({
      where: { status: 'PAID', ...whereDate },
      select: { amount: true, fee: true, couponId: true, affiliateId: true, createdAt: true },
    });

    let boletosVolume = 0;
    let boletosReceita = 0;
    let boletosCusto = 0;
    let boletosDescontos = 0;
    let boletosComissoes = 0;

    for (const b of paidBoletos) {
      boletosVolume += b.amount;
      boletosReceita += b.fee;
      boletosCusto += costForAmount(b.amount);
      if (b.couponId) {
        const semCupom = calculateTax(b.amount, 0);
        if (semCupom.isValid && semCupom.taxAmount > b.fee) {
          boletosDescontos += semCupom.taxAmount - b.fee;
        }
      }
    }

    const affiliateEarnedFromBoletos = await prisma.affiliateTransaction.aggregate({
      where: {
        boleto: { status: 'PAID', ...whereDate },
      },
      _sum: { commission: true },
    }).then((r) => r._sum.commission ?? 0);
    boletosComissoes = affiliateEarnedFromBoletos;

    // === RECARGAS (PAID) ===
    const paidRecharges = await (prisma as any).mobileRecharge?.findMany?.({
      where: { status: 'PAID', ...whereDate },
      select: { amount: true, fee: true, affiliateId: true },
    }) || [];

    const recargasVolume = paidRecharges.reduce((s: number, r: any) => s + r.amount, 0);
    const recargasReceita = paidRecharges.reduce((s: number, r: any) => s + r.fee, 0);
    const recargasCusto = 0;
    const recargasComissoes = 0;

    // === PIX/DEPIX COMÉRCIO (depix_sent) ===
    const commercePayments = await (prisma as any).depixOrder?.findMany?.({
      where: { status: 'depix_sent', ...whereDate },
      select: {
        grossAmount: true,
        fixedFeePaid: true,
        variableFeePaid: true,
        pagdepixProfit: true,
        swapverseFee: true,
      },
    }) || [];

    const commerceVolume = commercePayments.reduce((s: number, p: any) => s + (p.grossAmount || p.amount || 0), 0);
    const commerceReceita = commercePayments.reduce((s: number, p: any) => s + (p.pagdepixProfit || 0), 0);
    const commerceCusto = commercePayments.reduce((s: number, p: any) => s + (p.swapverseFee || 0), 0);

    // === TOTAIS CONSOLIDADOS ===
    const volumeTotal = boletosVolume + recargasVolume + commerceVolume;
    const receitaTotal = boletosReceita + recargasReceita + commerceReceita;
    const custoTotal = boletosCusto + recargasCusto + commerceCusto;
    const descontosTotal = boletosDescontos;
    const comissoesTotal = boletosComissoes + recargasComissoes;
    const lucroLiquido = receitaTotal - descontosTotal - comissoesTotal - custoTotal;

    const countBoletos = paidBoletos.length;
    const countRecargas = paidRecharges.length;
    const countCommerce = commercePayments.length;
    const countTransacoes = countBoletos + countRecargas + countCommerce;

    // === RECEITA POR MÊS (últimos 12 meses para contabilidade) ===
    const monthlyRevenue: { month: string; receita: number; volume: number; lucro: number; transacoes: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

      const [bMonth, rMonth, cMonth, affMonth] = await Promise.all([
        prisma.boleto.findMany({
          where: { status: 'PAID', createdAt: { gte: monthStart, lte: monthEnd } },
          select: { amount: true, fee: true, couponId: true },
        }),
        (prisma as any).mobileRecharge?.findMany?.({
          where: { status: 'PAID', createdAt: { gte: monthStart, lte: monthEnd } },
          select: { amount: true, fee: true },
        }) || [],
        (prisma as any).depixOrder?.findMany?.({
          where: { status: 'depix_sent', createdAt: { gte: monthStart, lte: monthEnd } },
          select: { grossAmount: true, pagdepixProfit: true, swapverseFee: true },
        }) || [],
        prisma.affiliateTransaction.aggregate({
          where: {
            boleto: { status: 'PAID', createdAt: { gte: monthStart, lte: monthEnd } },
          },
          _sum: { commission: true },
        }),
      ]);

      let rec = 0;
      let vol = 0;
      let custo = 0;
      let desc = 0;
      bMonth.forEach((b) => {
        rec += b.fee;
        vol += b.amount;
        custo += costForAmount(b.amount);
        if (b.couponId) {
          const s = calculateTax(b.amount, 0);
          if (s.isValid && s.taxAmount > b.fee) desc += s.taxAmount - b.fee;
        }
      });
      rMonth.forEach((r: any) => { rec += r.fee; vol += r.amount; });
      cMonth.forEach((c: any) => {
        rec += c.pagdepixProfit || 0;
        vol += c.grossAmount || 0;
        custo += c.swapverseFee || 0;
      });
      const aff = affMonth._sum.commission ?? 0;
      const lucro = rec - desc - aff - custo;

      monthlyRevenue.push({
        month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
        receita: Math.round(rec * 100) / 100,
        volume: Math.round(vol * 100) / 100,
        lucro: Math.round(lucro * 100) / 100,
        transacoes: bMonth.length + rMonth.length + cMonth.length,
      });
    }

    return res.status(200).json({
      period: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
      kpis: {
        volumeTotal: Math.round(volumeTotal * 100) / 100,
        receitaTotal: Math.round(receitaTotal * 100) / 100,
        custoTotal: Math.round(custoTotal * 100) / 100,
        descontosTotal: Math.round(descontosTotal * 100) / 100,
        comissoesTotal: Math.round(comissoesTotal * 100) / 100,
        lucroLiquido: Math.round(lucroLiquido * 100) / 100,
        countTransacoes,
      },
      porOperacao: {
        boletos: {
          volume: Math.round(boletosVolume * 100) / 100,
          receita: Math.round(boletosReceita * 100) / 100,
          custo: Math.round(boletosCusto * 100) / 100,
          descontos: Math.round(boletosDescontos * 100) / 100,
          comissoes: Math.round(boletosComissoes * 100) / 100,
          lucro: Math.round((boletosReceita - boletosDescontos - boletosComissoes - boletosCusto) * 100) / 100,
          count: countBoletos,
        },
        recargas: {
          volume: Math.round(recargasVolume * 100) / 100,
          receita: Math.round(recargasReceita * 100) / 100,
          custo: recargasCusto,
          comissoes: recargasComissoes,
          lucro: Math.round(recargasReceita * 100) / 100,
          count: countRecargas,
        },
        pixDepix: {
          volume: Math.round(commerceVolume * 100) / 100,
          receita: Math.round(commerceReceita * 100) / 100,
          custo: Math.round(commerceCusto * 100) / 100,
          lucro: Math.round((commerceReceita - commerceCusto) * 100) / 100,
          count: countCommerce,
        },
      },
      monthlyRevenue,
    });
  } catch (error) {
    console.error('Erro ao obter dashboard admin:', error);
    return res.status(500).json({ error: 'Erro interno ao obter dashboard' });
  }
};

// ========================================
// DRILL-DOWN: TRANSAÇÕES (ADMIN)
// ========================================
export const listAdminTransactions = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { operation, startDate, endDate, period, page = 1, limit = 50, userId } = req.query as {
      operation?: 'boletos' | 'recargas' | 'pixDepix' | 'all';
      startDate?: string;
      endDate?: string;
      period?: string;
      page?: string;
      limit?: string;
      userId?: string;
    };

    const now = new Date();
    let dateStart: Date;
    let dateEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (startDate && endDate) {
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
    } else if (period === 'today') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      dateStart = new Date(now);
      dateStart.setDate(dateStart.getDate() - 7);
    } else if (period === 'month') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      dateStart = new Date(now.getFullYear(), 0, 1);
    } else {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const whereDate = { createdAt: { gte: dateStart, lte: dateEnd } };
    const skip = (Number(page) - 1) * Number(limit);
    const transactions: Array<{
      id: string;
      tipo: 'boleto' | 'recarga' | 'pixDepix';
      valorBruto: number;
      taxa: number;
      custo: number;
      lucro: number;
      createdAt: string;
      user?: { id: string; name: string; email: string; telegram: string };
      merchant?: { id: string; name: string };
      affiliate?: { id: string; couponCode: string; userName: string };
    }> = [];

    if (!operation || operation === 'boletos' || operation === 'all') {
      const whereBoleto: any = { status: 'PAID', ...whereDate };
      if (userId) whereBoleto.userId = userId;
      const boletos = await prisma.boleto.findMany({
        where: whereBoleto,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, telegram: true } },
          affiliate: { include: { user: { select: { name: true } } } },
        },
      });
      for (const b of boletos) {
        const custo = costForAmount(b.amount);
        let desconto = 0;
        if (b.couponId) {
          const semCupom = calculateTax(b.amount, 0);
          if (semCupom.isValid && semCupom.taxAmount > b.fee) desconto = semCupom.taxAmount - b.fee;
        }
        const comissao = await prisma.affiliateTransaction.aggregate({
          where: { boletoId: b.id },
          _sum: { commission: true },
        }).then(r => r._sum.commission ?? 0);
        transactions.push({
          id: b.id,
          tipo: 'boleto',
          valorBruto: b.amount,
          taxa: b.fee,
          custo,
          lucro: b.fee - desconto - comissao - custo,
          createdAt: b.createdAt.toISOString(),
          user: b.user,
          affiliate: b.affiliate ? { id: b.affiliate.id, couponCode: b.affiliate.couponCode, userName: b.affiliate.user?.name || '' } : undefined,
        });
      }
    }

    if (!operation || operation === 'recargas' || operation === 'all') {
      const whereRec: any = { status: 'PAID', ...whereDate };
      if (userId) whereRec.userId = userId;
      const recargas = await (prisma as any).mobileRecharge?.findMany?.({
        where: whereRec,
        take: 5000,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true, telegram: true } } },
      }) || [];
      for (const r of recargas) {
        transactions.push({
          id: r.id,
          tipo: 'recarga',
          valorBruto: r.amount,
          taxa: r.fee,
          custo: 0,
          lucro: r.fee,
          createdAt: r.createdAt.toISOString(),
          user: r.user,
        });
      }
    }

    if (!operation || operation === 'pixDepix' || operation === 'all') {
      const whereDepix: any = { status: 'depix_sent', ...whereDate };
      if (userId) whereDepix.userId = userId;
      const depix = await (prisma as any).depixOrder?.findMany?.({
        where: whereDepix,
        take: 5000,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, telegram: true } },
          commerceLink: { select: { titulo: true } },
          commercePage: { select: { titulo: true } },
        },
      }) || [];
      for (const d of depix) {
        const gross = d.grossAmount || d.amount || 0;
        const receita = d.pagdepixProfit || 0;
        const custo = d.swapverseFee || 0;
        transactions.push({
          id: d.id,
          tipo: 'pixDepix',
          valorBruto: gross,
          taxa: (d.fixedFeePaid || 0) + (d.variableFeePaid || 0),
          custo,
          lucro: receita - custo,
          createdAt: d.createdAt.toISOString(),
          user: d.user,
          merchant: (d.commerceLink || d.commercePage) ? { id: d.commerceLink?.id || d.commercePage?.id || '', name: d.commerceLink?.titulo || d.commercePage?.titulo || 'Comércio' } : undefined,
        });
      }
    }

    transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const paginated = transactions.slice(skip, skip + Number(limit));

    return res.status(200).json({
      transactions: paginated,
      period: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: transactions.length,
        totalPages: Math.ceil(transactions.length / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Erro ao listar transações admin:', error);
    return res.status(500).json({ error: 'Erro interno ao listar transações' });
  }
};

// ========================================
// CONTABILIDADE DETALHADA (ADMIN)
// ========================================
export const getAdminAccounting = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { startDate, endDate, period } = req.query as { startDate?: string; endDate?: string; period?: string };
    const now = new Date();
    let dateStart: Date;
    let dateEnd: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (startDate && endDate) {
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
    } else if (period === 'today') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      dateStart = new Date(now);
      dateStart.setDate(dateStart.getDate() - 7);
    } else if (period === 'month') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'year') {
      dateStart = new Date(now.getFullYear(), 0, 1);
    } else {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const whereDate = { createdAt: { gte: dateStart, lte: dateEnd } };

    const [paidBoletos, paidRecharges, commercePayments, affiliateCommissions] = await Promise.all([
      prisma.boleto.findMany({ where: { status: 'PAID', ...whereDate }, select: { amount: true, fee: true, couponId: true } }),
      (prisma as any).mobileRecharge?.findMany?.({ where: { status: 'PAID', ...whereDate }, select: { amount: true, fee: true } }) || [],
      (prisma as any).depixOrder?.findMany?.({ where: { status: 'depix_sent', ...whereDate }, select: { grossAmount: true, fixedFeePaid: true, variableFeePaid: true, pagdepixProfit: true, swapverseFee: true } }) || [],
      prisma.affiliateTransaction.aggregate({
        where: { boleto: { status: 'PAID', ...whereDate } },
        _sum: { commission: true },
      }),
    ]);

    let receitaBrutaTaxas = 0;
    let custosOperacionais = 0;
    let descontos = 0;
    paidBoletos.forEach(b => {
      receitaBrutaTaxas += b.fee;
      custosOperacionais += costForAmount(b.amount);
      if (b.couponId) {
        const s = calculateTax(b.amount, 0);
        if (s.isValid && s.taxAmount > b.fee) descontos += s.taxAmount - b.fee;
      }
    });
    paidRecharges.forEach((r: any) => { receitaBrutaTaxas += r.fee; });
    commercePayments.forEach((c: any) => {
      receitaBrutaTaxas += c.pagdepixProfit || 0;
      custosOperacionais += c.swapverseFee || 0;
    });

    const comissoesAfiliados = affiliateCommissions._sum.commission ?? 0;
    const receitaLiquidaReal = receitaBrutaTaxas - descontos - comissoesAfiliados - custosOperacionais;
    const volumeBruto = paidBoletos.reduce((s, b) => s + b.amount, 0) +
      paidRecharges.reduce((s: number, r: any) => s + r.amount, 0) +
      commercePayments.reduce((s: number, c: any) => s + (c.grossAmount || 0), 0);

    return res.status(200).json({
      period: { start: dateStart.toISOString(), end: dateEnd.toISOString() },
      contabilidade: {
        volumeBruto: Math.round(volumeBruto * 100) / 100,
        receitaBrutaTaxas: Math.round(receitaBrutaTaxas * 100) / 100,
        descontos: Math.round(descontos * 100) / 100,
        custosOperacionais: Math.round(custosOperacionais * 100) / 100,
        comissoesAfiliados: Math.round(comissoesAfiliados * 100) / 100,
        receitaLiquidaReal: Math.round(receitaLiquidaReal * 100) / 100,
      },
    });
  } catch (error) {
    console.error('Erro ao obter contabilidade:', error);
    return res.status(500).json({ error: 'Erro interno ao obter contabilidade' });
  }
};

// ========================================
// MÉTRICAS FINANCEIRAS (ADMIN)
// ========================================
export const getAdminMetrics = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const paidBoletos = await prisma.boleto.findMany({
      where: { status: 'PAID' },
      select: {
        amount: true,
        fee: true,
        couponId: true,
      }
    });

    let totalFaturado = 0;
    let totalDescontos = 0;
    let custosOperacionais = 0;

    for (const b of paidBoletos) {
      totalFaturado += b.fee;
      custosOperacionais += costForAmount(b.amount);
      if (b.couponId) {
        const semCupom = calculateTax(b.amount, 0);
        if (semCupom.isValid && semCupom.taxAmount > b.fee) {
          totalDescontos += semCupom.taxAmount - b.fee;
        }
      }
    }

    const totalComissoes = await prisma.affiliate.aggregate({
      _sum: { totalEarned: true }
    }).then(r => r._sum.totalEarned ?? 0);

    const lucro = totalFaturado - totalDescontos - totalComissoes - custosOperacionais;

    return res.status(200).json({
      totalFaturado,
      totalDescontos,
      totalComissoes,
      custosOperacionais,
      lucro,
      isLucrativo: lucro >= 0,
    });
  } catch (error) {
    console.error('Erro ao obter métricas:', error);
    return res.status(500).json({ error: 'Erro interno ao obter métricas' });
  }
};

// ========================================
// LISTAR LOGS (ADMIN - AUDITORIA)
// ========================================
export const listLogs = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { 
      page = 1, 
      limit = 50, 
      action, 
      userId,
      startDate,
      endDate 
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (action) {
      where.action = { contains: action as string, mode: 'insensitive' };
    }

    if (userId) {
      where.userId = userId as string;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate as string);
      }
    }

    const [logs, total] = await Promise.all([
      prisma.log.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              telegram: true
            }
          }
        }
      }),
      prisma.log.count({ where })
    ]);

    return res.status(200).json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('Erro ao listar logs:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// APROVAR LOTE DE BOLETOS (Batch)
// ========================================
export const approveBatch = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { receiptUrl: receiptUrlParam } = req.body;
    // @ts-ignore
    const adminId = req.userId;

    const batch = await (prisma as any).boletoBatch.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, telegram: true } },
        boletos: true,
      },
    });

    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
    if (batch.status === 'PAID') return res.status(400).json({ error: 'Lote já aprovado.' });

    const now = new Date();

    // Atualizar batch para PAID
    await (prisma as any).boletoBatch.update({
      where: { id },
      data: { status: 'PAID', confirmedAt: now, receiptUrl: receiptUrlParam || null },
    });

    // Aprovar cada boleto do lote
    for (const boleto of batch.boletos) {
      await prisma.boleto.update({
        where: { id: boleto.id },
        data: { status: 'PAID', confirmedAt: now, receiptUrl: receiptUrlParam || null },
      });

      // Atualizar totalPaid do usuário (por boleto)
      await prisma.user.update({
        where: { id: boleto.userId },
        data: { totalPaid: { increment: boleto.totalAmount } },
      });

      // Comissão de afiliado por boleto
      if (boleto.affiliateId && boleto.couponId) {
        const commissionAmount = getAffiliateCommissionFromProfit(boleto.fee, boleto.amount);
        if (commissionAmount > 0) {
          try {
            const existing = await prisma.affiliateTransaction.findFirst({ where: { affiliateId: boleto.affiliateId, boletoId: boleto.id } });
            if (!existing) {
              await prisma.affiliateTransaction.create({
                data: { affiliateId: boleto.affiliateId, boletoId: boleto.id, amount: boleto.totalAmount, commission: commissionAmount, status: 'AVAILABLE', availableAt: now },
              });
              await prisma.affiliate.update({
                where: { id: boleto.affiliateId },
                data: { balance: { increment: commissionAmount }, totalEarned: { increment: commissionAmount } },
              });
            }
            await prisma.coupon.update({ where: { id: boleto.couponId }, data: { usageCount: { increment: 1 } } });
          } catch (err) {
            console.error(`[AFFILIATE] Erro na comissão do batch boleto ${boleto.id}:`, err);
          }
        }
      }

      // Comissão de indicação (referral) por boleto
      try {
        const owner = await prisma.user.findUnique({ where: { id: boleto.userId }, select: { referredByCode: true } });
        if (owner?.referredByCode) {
          const referrer = await prisma.user.findUnique({ where: { referralCode: owner.referredByCode }, select: { id: true } });
          if (referrer) {
            // Comissão = 20% da taxa ORIGINAL (sem desconto de referral)
            const originalTaxBatch = calculateTax(boleto.amount, 0);
            const originalFeeBatch = originalTaxBatch.isValid ? originalTaxBatch.taxAmount : boleto.fee;
            const rc = Math.floor(originalFeeBatch * REFERRAL_RATE * 100) / 100;
            if (rc > 0) {
              await prisma.referralEarning.create({
                data: { earnerId: referrer.id, sourceUserId: boleto.userId, boletoId: boleto.id, feeAmount: originalFeeBatch, commission: rc },
              });
              notifyAffiliateCommission(referrer.id, rc).catch(() => {});
              try {
                const { notifyUserByTelegram: nTg } = require('../services/telegram.service');
                nTg(referrer.id, `🎉 Nova comissão de indicação!\n\nVocê ganhou R$ ${rc.toFixed(2)} pela aprovação de um boleto do seu indicado.`).catch(() => {});
              } catch (_e) {}
            }
          }
        }
      } catch (err) {
        console.error(`[REFERRAL] Erro na comissão de indicação do batch boleto ${boleto.id}:`, err);
      }
    }

    // Log
    await prisma.log.create({
      data: {
        action: 'boleto_batch_approved',
        details: JSON.stringify({ batchId: id, adminId, itemCount: batch.itemCount, grandTotal: batch.grandTotal }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId,
      },
    });

    // Notificar usuário
    const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
    notifyUserByTelegram(
      batch.userId,
      `✅ PagDepix liquidou seu lote de ${batch.itemCount} boleto${batch.itemCount > 1 ? 's' : ''}!\nTotal: ${fmtBRL(batch.grandTotal)}\nAcesse o site para ver os detalhes.`,
    ).catch(() => {});

    return res.status(200).json({ message: `Lote aprovado com sucesso. ${batch.boletos.length} boleto(s) marcado(s) como PAGO.` });

  } catch (error) {
    console.error('Erro ao aprovar batch:', error);
    return res.status(500).json({ error: 'Erro interno ao aprovar lote' });
  }
};

// ========================================
// REJEITAR LOTE DE BOLETOS (Batch)
// ========================================
export const rejectBatch = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const batch = await (prisma as any).boletoBatch.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ error: 'Lote não encontrado.' });
    if (batch.status !== 'PENDING') return res.status(400).json({ error: 'Lote já processado.' });

    await (prisma as any).boletoBatch.update({ where: { id: String(id) }, data: { status: 'PROBLEM' } });
    await prisma.boleto.updateMany({ where: { batchId: String(id) }, data: { status: 'PROBLEM', problemReason: reason || 'Lote rejeitado pelo admin.' } });

    notifyUserByTelegram(batch.userId, `❌ Problema no seu lote de boletos.\nMotivo: ${reason || 'Verificar com o suporte.'}`).catch(() => {});

    return res.status(200).json({ message: 'Lote rejeitado.' });
  } catch (error) {
    console.error('Erro ao rejeitar batch:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// LISTAR LOTES DE BOLETOS (Batch)
// ========================================
export const listBatches = async (req: Request, res: Response) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const where: any = {};
    if (status) where.status = status;

    const [batches, total] = await Promise.all([
      (prisma as any).boletoBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          user: { select: { id: true, name: true, email: true, telegram: true } },
          boletos: { select: { id: true, barcode: true, amount: true, fee: true, totalAmount: true, dueDate: true, status: true } },
        },
      }),
      (prisma as any).boletoBatch.count({ where }),
    ]);

    return res.json({ batches, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error('Erro ao listar batches:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
