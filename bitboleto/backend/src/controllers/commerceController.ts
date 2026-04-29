import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { prisma } from '../prisma';
import { generateDepixQr, getDepixOrderStatus } from '../services/swapverse';
import { sendPaymentNotificationEmail } from '../services/email.service';
import { onCommerceLinkPaymentPaid } from '../services/commerceWebhookService';
import { validateCnpjReceita } from '../services/cnpjValidation';
import { createAuditLog } from '../services/marketplace/auditLog.service';
import { randomUUID } from 'crypto';

/** Máximo de pedidos pendentes a sincronizar por vez (evita lentidão no dashboard). */
const SYNC_PENDING_LIMIT = 20;
/** Dias para trás ao buscar pedidos pendentes. */
const SYNC_PENDING_DAYS = 7;

/**
 * Sincroniza status de pagamentos de comércio pendentes com a SwapVerse.
 * Usado quando o comerciante abre Dashboard ou Histórico - garante que pagamentos
 * confirmados na SwapVerse (mas não atualizados no DB por polling interrompido) apareçam.
 */
async function syncPendingCommerceOrdersForMerchant(userId: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_PENDING_DAYS);

  const [merchantLinks, merchantPages] = await Promise.all([
    prisma.commerceLink.findMany({ where: { userId }, select: { id: true } }),
    (prisma as any).commercePage?.findMany?.({ where: { userId }, select: { id: true } }) || [],
  ]);
  const linkIds = merchantLinks.map((l) => l.id);
  const pageIds = merchantPages.map((p: any) => p.id);
  const orConditions: any[] = [];
  if (linkIds.length > 0) orConditions.push({ commerceLinkId: { in: linkIds } });
  if (pageIds.length > 0) orConditions.push({ commercePageId: { in: pageIds } });
  if (orConditions.length === 0) return 0;

  const pending = await prisma.depixOrder.findMany({
    where: {
      status: { not: 'depix_sent' },
      createdAt: { gte: cutoff },
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
    take: SYNC_PENDING_LIMIT,
    include: {
      commerceLink: { select: { id: true, titulo: true } },
      commercePage: { select: { id: true, titulo: true } },
      user: { include: { commercePartner: { include: { settings: true } } } },
    },
  });

  let updated = 0;
  for (const order of pending) {
    try {
      const result = await getDepixOrderStatus(order.orderId);
      if (!result.success || !result.order || result.order.status !== 'depix_sent') continue;

      const grossAmount = order.grossAmount ?? order.totalToPay ?? order.amount ?? 0;
      let fixedFeePaid = order.fixedFeePaid ?? 0.99;
      let variableFeePaid = order.variableFeePaid ?? 0;
      let pagdepixProfit = order.pagdepixProfit ?? 0;
      let swapverseFee = order.swapverseFee ?? 0;

      if (!order.grossAmount && (order.commerceLinkId || order.commercePageId)) {
        fixedFeePaid = 0.99;
        variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100;
        pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100;
        swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100;
      }

      await prisma.depixOrder.update({
        where: { id: order.id },
        data: {
          status: 'depix_sent',
          grossAmount: order.grossAmount ?? grossAmount,
          fixedFeePaid: order.fixedFeePaid ?? fixedFeePaid,
          variableFeePaid: order.variableFeePaid ?? variableFeePaid,
          pagdepixProfit: order.pagdepixProfit ?? pagdepixProfit,
          swapverseFee: order.swapverseFee ?? swapverseFee,
        },
      });

      const netAmount = grossAmount - fixedFeePaid - variableFeePaid;
      if (netAmount > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { totalPaid: { increment: netAmount } },
        });
      }

      const user = order.user as any;
      if (!order.emailNotifiedAt && user?.commercePartner?.settings?.emailNotificationsEnabled !== false) {
        const merchantEmail = user.email;
        const merchantName = user.commercePartner?.settings?.businessName || user.name;
        const paymentTitle = order.commerceLink?.titulo || order.commercePage?.titulo || 'Pagamento';
        sendPaymentNotificationEmail(merchantEmail, merchantName, {
          amount: netAmount,
          linkTitle: paymentTitle,
          orderId: order.orderId,
          paymentDate: order.createdAt.toISOString(),
        }).catch((e) => console.error('[syncPendingCommerce] Erro email:', e?.message));
          await prisma.depixOrder.update({
          where: { id: order.id },
          data: { emailNotifiedAt: new Date() },
        }).catch(() => {});
      }
      if (order.commerceLinkId) {
        const grossAmount = order.grossAmount ?? order.totalToPay ?? order.amount ?? 0;
        onCommerceLinkPaymentPaid(order.commerceLinkId, order.id, grossAmount, order.createdAt).catch((e) =>
          console.warn('[syncPendingCommerce] Webhook charge.paid:', e?.message)
        );
      }
      updated++;
      console.log(`[syncPendingCommerce] Pedido ${order.orderId.substring(0, 20)}... atualizado para depix_sent`);
    } catch (e: any) {
      console.warn('[syncPendingCommerce] Erro ao sincronizar pedido', order.orderId, e?.message);
    }
  }
  return updated;
}

/**
 * Sincroniza TODOS os pagamentos de comércio pendentes (para admin).
 * Chamado quando o admin abre o dashboard.
 */
export async function syncAllPendingCommerceOrders(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SYNC_PENDING_DAYS);

  const pending = await prisma.depixOrder.findMany({
    where: {
      status: { not: 'depix_sent' },
      createdAt: { gte: cutoff },
      OR: [
        { commerceLinkId: { not: null } },
        { commercePageId: { not: null } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      commerceLink: { select: { id: true, titulo: true, userId: true } },
      commercePage: { select: { id: true, titulo: true, userId: true } },
      user: { include: { commercePartner: { include: { settings: true } } } },
    },
  });

  let updated = 0;
  for (const order of pending) {
    try {
      const result = await getDepixOrderStatus(order.orderId);
      if (!result.success || !result.order || result.order.status !== 'depix_sent') continue;

      const grossAmount = order.grossAmount ?? order.totalToPay ?? order.amount ?? 0;
      let fixedFeePaid = order.fixedFeePaid ?? 0.99;
      let variableFeePaid = order.variableFeePaid ?? 0;
      let pagdepixProfit = order.pagdepixProfit ?? 0;
      let swapverseFee = order.swapverseFee ?? 0;

      if (!order.grossAmount && (order.commerceLinkId || order.commercePageId)) {
        fixedFeePaid = 0.99;
        variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100;
        pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100;
        swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100;
      }

      await prisma.depixOrder.update({
        where: { id: order.id },
        data: {
          status: 'depix_sent',
          grossAmount: order.grossAmount ?? grossAmount,
          fixedFeePaid: order.fixedFeePaid ?? fixedFeePaid,
          variableFeePaid: order.variableFeePaid ?? variableFeePaid,
          pagdepixProfit: order.pagdepixProfit ?? pagdepixProfit,
          swapverseFee: order.swapverseFee ?? swapverseFee,
        },
      });

      const netAmount = grossAmount - fixedFeePaid - variableFeePaid;
      if (netAmount > 0) {
        await prisma.user.update({
          where: { id: order.userId },
          data: { totalPaid: { increment: netAmount } },
        });
      }

      const user = order.user as any;
      if (!order.emailNotifiedAt && user?.commercePartner?.settings?.emailNotificationsEnabled !== false) {
        const merchantEmail = user.email;
        const merchantName = user.commercePartner?.settings?.businessName || user.name;
        const paymentTitle = order.commerceLink?.titulo || order.commercePage?.titulo || 'Pagamento';
        sendPaymentNotificationEmail(merchantEmail, merchantName, {
          amount: netAmount,
          linkTitle: paymentTitle,
          orderId: order.orderId,
          paymentDate: order.createdAt.toISOString(),
        }).catch((e) => console.error('[syncAllPendingCommerce] Erro email:', e?.message));
        await prisma.depixOrder.update({
          where: { id: order.id },
          data: { emailNotifiedAt: new Date() },
        }).catch(() => {});
      }
      if (order.commerceLinkId) {
        const grossAmount = order.grossAmount ?? order.totalToPay ?? order.amount ?? 0;
        onCommerceLinkPaymentPaid(order.commerceLinkId, order.id, grossAmount, order.createdAt).catch((e) =>
          console.warn('[syncAllPendingCommerce] Webhook charge.paid:', e?.message)
        );
      }
      updated++;
      console.log(`[syncAllPendingCommerce] Pedido ${order.orderId.substring(0, 20)}... atualizado`);
    } catch (e: any) {
      console.warn('[syncAllPendingCommerce] Erro pedido', order.orderId, e?.message);
    }
  }
  return updated;
}

/**
 * Função auxiliar: busca taxas do comerciante (personalizadas ou padrão)
 */
export async function getMerchantFees(userId: string): Promise<{
  fixedFee: number;
  variablePercent: number;
}> {
  const partner = await (prisma as any).commercePartner?.findUnique?.({
    where: { userId },
    select: {
      useCustomFees: true,
      customFixedFee: true,
      customVariablePercent: true,
    },
  });

  // Se tem taxas personalizadas ativadas, usar elas
  if (partner?.useCustomFees && partner.customFixedFee != null && partner.customVariablePercent != null) {
    return {
      fixedFee: partner.customFixedFee,
      variablePercent: partner.customVariablePercent,
    };
  }

  // Caso contrário, usar taxas padrão
  return {
    fixedFee: 0.99,
    variablePercent: 0.5, // 0.5%
  };
}

/**
 * Cadastro de comerciante (Modo Comércio) - Registro autônomo.
 * Cria User com role COMMERCE e CommercePartner com CNPJ validado.
 * Novo fluxo: exige CNPJ (sem CPF) + validação Receita Federal.
 */
export const registerCommerce = async (req: Request, res: Response) => {
  try {
    const maintenanceConfig = await prisma.config.findUnique({
      where: { id: 'config' },
      select: { maintenanceMode: true, maintenanceMessage: true }
    });
    if (maintenanceConfig?.maintenanceMode) {
      return res.status(503).json({
        error: 'maintenance',
        message: maintenanceConfig.maintenanceMessage?.trim() || 'Sistema em manutenção. Cadastros temporariamente indisponíveis.'
      });
    }

    const {
      nome,
      sobrenome,
      cnpj,
      email,
      telegram,
      password,
      tipoNegocio,
      businessName,
    } = req.body as {
      nome?: string;
      sobrenome?: string;
      cnpj?: string;
      email?: string;
      telegram?: string;
      password?: string;
      tipoNegocio?: string;
      businessName?: string;
    };

    if (!nome?.trim() || !sobrenome?.trim() || !cnpj || !email?.trim() || !telegram?.trim() || !password || !tipoNegocio?.trim() || !businessName?.trim()) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const cnpjDigits = cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Informe os 14 dígitos.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const cnpjResult = await validateCnpjReceita(cnpjDigits);
    if (!cnpjResult.valid) {
      return res.status(400).json({ error: cnpjResult.error || 'CNPJ inválido ou com situação irregular na Receita Federal.' });
    }

    const duplicateCnpj = await prisma.commercePartner.findFirst({
      where: { documentNumber: cnpjDigits, status: { in: ['APPROVED', 'AWAITING_DEPOSIT', 'VALIDATING'] } },
      select: { id: true },
    });
    if (duplicateCnpj) {
      return res.status(409).json({ error: 'Este CNPJ já está vinculado a outra conta na plataforma.' });
    }

    const telegramFormatted = telegram.trim().startsWith('@') ? telegram.trim() : `@${telegram.trim()}`;

    const existingEmail = await prisma.user.findUnique({ where: { email: email.trim() }, select: { id: true } });
    if (existingEmail) return res.status(409).json({ error: 'E-mail já cadastrado' });

    const existingTelegram = await prisma.user.findUnique({ where: { telegram: telegramFormatted }, select: { id: true } });
    if (existingTelegram) return res.status(409).json({ error: 'Telegram já cadastrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const fullName = `${nome.trim()} ${sobrenome.trim()}`;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: fullName,
          email: email.trim(),
          telegram: telegramFormatted,
          passwordHash,
          role: 'COMMERCE',
          isActive: true,
          isBlocked: true,
          emailVerified: false,
          telegramVerified: false,
          dailyLimit: 500,
          totalPaid: 0
        } as any,
        select: { id: true }
      });
      await (tx as any).commercePartner.create({
        data: {
          userId: user.id,
          documentType: 'CNPJ',
          documentNumber: cnpjDigits,
          businessName: businessName.trim(),
          businessType: tipoNegocio.trim(),
          status: 'AWAITING_DEPOSIT',
          cnpjRazaoSocial: cnpjResult.data?.razao_social || null,
          cnpjSituacao: cnpjResult.data?.situacao_cadastral || null,
          cnpjValidatedAt: new Date(),
          transactionLimit: 500,
          dailyPayerLimit: 500,
        }
      });
    });

    return res.status(201).json({
      status: 'AWAITING_DEPOSIT',
      cnpjInfo: {
        razaoSocial: cnpjResult.data?.razao_social,
        situacao: cnpjResult.data?.situacao_cadastral,
      },
      message: 'Cadastro realizado! Faça login e realize o depósito inicial de R$ 5,00 para ativar o Modo Comércio.',
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    const code = error?.code;
    console.error('Erro ao registrar comerciante:', { message: msg, code, stack: error?.stack });
    if (code === 'P2010' || /enum|COMMERCE|CommercePartner|invalid input value|does not exist/i.test(msg)) {
      return res.status(500).json({ error: 'Banco desatualizado. Na VPS rode: npx prisma db push && npx prisma generate' });
    }
    return res.status(500).json({ error: 'Erro ao cadastrar comerciante', message: msg });
  }
};

/**
 * Ativação do Modo Comércio para um usuário já logado.
 * Novo fluxo antifraude: exige CNPJ válido (Receita Federal) + depósito inicial.
 * Status: AWAITING_DEPOSIT -> (depósito confirmado) -> APPROVED automaticamente.
 */
export const activateCommerce = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const existing = await prisma.commercePartner.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === 'APPROVED') {
        return res.status(400).json({ error: 'Modo Comércio já está ativo na sua conta.' });
      }
      if (existing.status === 'AWAITING_DEPOSIT') {
        return res.status(200).json({
          status: 'AWAITING_DEPOSIT',
          partnerId: existing.id,
          message: 'Você precisa realizar o depósito inicial de R$ 5,00 para concluir a ativação.',
        });
      }
      if (existing.status === 'SUSPENDED') {
        return res.status(403).json({ error: 'Seu Modo Comércio está suspenso. Entre em contato com o suporte.' });
      }
      return res.status(400).json({ error: 'Você já possui uma solicitação em andamento.' });
    }

    const { cnpj, tipoNegocio, businessName } = req.body;

    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido. Informe os 14 dígitos.' });
    }
    if (!tipoNegocio || tipoNegocio.trim().length < 2) {
      return res.status(400).json({ error: 'Tipo de negócio é obrigatório.' });
    }
    if (!businessName || businessName.trim().length < 2) {
      return res.status(400).json({ error: 'Nome do negócio é obrigatório.' });
    }

    const cnpjDigits = cnpj.replace(/\D/g, '');

    const cnpjResult = await validateCnpjReceita(cnpjDigits);
    if (!cnpjResult.valid) {
      return res.status(400).json({ error: cnpjResult.error || 'CNPJ inválido ou com situação irregular na Receita Federal.' });
    }

    const duplicateCnpj = await prisma.commercePartner.findFirst({
      where: { documentNumber: cnpjDigits, status: { in: ['APPROVED', 'AWAITING_DEPOSIT', 'VALIDATING'] } },
      select: { id: true },
    });
    if (duplicateCnpj) {
      return res.status(409).json({ error: 'Este CNPJ já está vinculado a outra conta na plataforma.' });
    }

    const partner = await prisma.commercePartner.create({
      data: {
        userId,
        status: 'AWAITING_DEPOSIT',
        documentType: 'CNPJ',
        documentNumber: cnpjDigits,
        businessName: businessName.trim(),
        businessType: tipoNegocio.trim(),
        cnpjRazaoSocial: cnpjResult.data?.razao_social || null,
        cnpjSituacao: cnpjResult.data?.situacao_cadastral || null,
        cnpjValidatedAt: new Date(),
        transactionLimit: 500,
        dailyPayerLimit: 500,
      }
    });

    return res.status(201).json({
      status: 'AWAITING_DEPOSIT',
      partnerId: partner.id,
      cnpjInfo: {
        razaoSocial: cnpjResult.data?.razao_social,
        situacao: cnpjResult.data?.situacao_cadastral,
        nomeFantasia: cnpjResult.data?.nome_fantasia,
      },
      message: 'CNPJ validado com sucesso! Agora realize o depósito inicial de R$ 5,00 via Pix para concluir a ativação.',
    });
  } catch (error: any) {
    console.error('Erro ao ativar modo comércio:', error);
    return res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
};

/**
 * Gera QR Code Pix para o depósito inicial de R$ 5,00 via SwapVerse.
 * O pagamento deve ser feito de uma conta bancária vinculada ao CNPJ.
 */
export const generateInitialDeposit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner) return res.status(404).json({ error: 'Solicitação de comércio não encontrada.' });
    if (partner.status === 'APPROVED') return res.status(400).json({ error: 'Modo Comércio já está ativo.' });
    if (partner.status !== 'AWAITING_DEPOSIT') {
      return res.status(400).json({ error: 'Status inválido para depósito inicial.' });
    }

    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    const adminWallet = (config as any)?.commerceWalletDepix || config?.walletAddress;
    if (!adminWallet || adminWallet.length < 20) {
      return res.status(500).json({ error: 'Carteira de recebimento não configurada. Entre em contato com o suporte.' });
    }

    const DEPOSIT_AMOUNT = 5.00;

    const result = await generateDepixQr({
      amount: DEPOSIT_AMOUNT.toFixed(2),
      depix_wallet_address: adminWallet,
      fee: '0.2',
    });

    if (!result.success || !('order' in result)) {
      const errorMsg = 'error' in result ? result.error : 'Não foi possível gerar o QR Code.';
      return res.status(400).json({ error: errorMsg });
    }

    await prisma.commercePartner.update({
      where: { userId },
      data: {
        initialDepositOrderId: result.order.id,
        initialDepositStatus: 'pending',
        initialDepositAt: new Date(),
      },
    });

    return res.json({
      orderId: result.order.id,
      qr_image_url: result.order.qr_image_url,
      qr_copy_paste: result.order.qr_copy_paste,
      amount: DEPOSIT_AMOUNT.toFixed(2),
      message: 'Pague R$ 5,00 via Pix. Use uma conta bancária vinculada ao CNPJ informado.',
    });
  } catch (error: any) {
    console.error('[generateInitialDeposit] Erro:', error);
    return res.status(500).json({ error: 'Erro ao gerar depósito inicial.' });
  }
};

/**
 * Verifica status do depósito inicial via SwapVerse.
 * Se confirmado, ativa o Modo Comércio automaticamente.
 */
export const checkInitialDepositStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (partner.status === 'APPROVED') {
      return res.json({ status: 'APPROVED', message: 'Modo Comércio já está ativo.' });
    }
    if (!partner.initialDepositOrderId) {
      return res.json({ status: 'AWAITING_DEPOSIT', message: 'Depósito inicial ainda não gerado.' });
    }

    const swapResult = await getDepixOrderStatus(partner.initialDepositOrderId);
    if (!swapResult.success || !swapResult.order) {
      return res.json({
        status: 'PENDING',
        message: 'Aguardando confirmação do pagamento...',
      });
    }

    if (swapResult.order.status === 'depix_sent') {
      const INITIAL_DEPOSIT_AMOUNT = 5.00;
      const BASE_LIMIT = 500;
      const newCollateral = INITIAL_DEPOSIT_AMOUNT;
      const newLimit = BASE_LIMIT + newCollateral;

      await prisma.$transaction([
        (prisma as any).collateralDeposit.create({
          data: {
            partnerId: partner.id,
            type: 'DEPOSIT',
            amount: INITIAL_DEPOSIT_AMOUNT,
            method: 'PIX',
            status: 'CONFIRMED',
            orderId: partner.initialDepositOrderId,
            processedAt: new Date(),
            note: 'Depósito inicial de validação bancária convertido em colateral.',
          },
        }),
        prisma.commercePartner.update({
          where: { userId },
          data: {
            status: 'APPROVED',
            initialDepositStatus: 'confirmed',
            collateralBalance: newCollateral,
            transactionLimit: newLimit,
            dailyPayerLimit: newLimit,
          },
        }),
      ]);

      return res.json({
        status: 'APPROVED',
        message: 'Depósito confirmado! Modo Comércio ativado. Os R$ 5,00 já foram creditados como colateral.',
        collateralBalance: newCollateral,
        transactionLimit: newLimit,
      });
    }

    return res.json({
      status: 'PENDING',
      swapVerseStatus: swapResult.order.status,
      message: 'Aguardando confirmação do pagamento...',
    });
  } catch (error: any) {
    console.error('[checkInitialDepositStatus] Erro:', error);
    return res.status(500).json({ error: 'Erro ao verificar depósito.' });
  }
};

/**
 * Retorna status atual da ativação do comércio (para o frontend saber em que etapa está).
 */
export const getCommerceActivationStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({
      where: { userId },
      select: {
        id: true,
        status: true,
        createdByAdmin: true,
        documentNumber: true,
        businessName: true,
        businessType: true,
        cnpjRazaoSocial: true,
        cnpjSituacao: true,
        initialDepositOrderId: true,
        initialDepositStatus: true,
        collateralBalance: true,
        transactionLimit: true,
        dailyPayerLimit: true,
      },
    });

    if (!partner) {
      return res.json({ status: 'NOT_STARTED' });
    }

    // Contas criadas pelo admin já estão totalmente aprovadas – sem CNPJ/depósito
    const effectiveStatus = (partner.createdByAdmin ?? false) ? 'APPROVED' : partner.status;

    return res.json({
      status: effectiveStatus,
      createdByAdmin: partner.createdByAdmin ?? false,
      partnerId: partner.id,
      cnpj: partner.documentNumber,
      businessName: partner.businessName,
      businessType: partner.businessType,
      razaoSocial: partner.cnpjRazaoSocial,
      hasDeposit: !!partner.initialDepositOrderId,
      depositStatus: partner.initialDepositStatus,
      collateralBalance: partner.collateralBalance,
      transactionLimit: partner.transactionLimit,
      dailyPayerLimit: partner.dailyPayerLimit,
    });
  } catch (error: any) {
    console.error('[getCommerceActivationStatus] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar status.' });
  }
};

/**
 * Gera QR Code Pix para depósito de colateral (aumento de limite) via SwapVerse.
 */
export const generateCollateralDeposit = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner || partner.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Modo Comércio não está ativo.' });
    }

    const { amount, method } = req.body;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 5) {
      return res.status(400).json({ error: 'Valor mínimo para depósito de colateral é R$ 5,00.' });
    }

    if (method === 'DEPIX') {
      const config = await prisma.config.findUnique({ where: { id: 'config' } });
      const adminWallet = (config as any)?.commerceWalletDepix || config?.walletAddress;

      const deposit = await (prisma as any).collateralDeposit.create({
        data: {
          partnerId: partner.id,
          type: 'DEPOSIT',
          amount: amountNum,
          method: 'DEPIX',
          status: 'PENDING',
        },
      });

      return res.json({
        depositId: deposit.id,
        method: 'DEPIX',
        amount: amountNum.toFixed(2),
        walletAddress: adminWallet || '',
        message: 'Envie o valor em DePix para a carteira indicada. O admin confirmará manualmente.',
      });
    }

    const config = await prisma.config.findUnique({ where: { id: 'config' } });
    const adminWallet = (config as any)?.commerceWalletDepix || config?.walletAddress;
    if (!adminWallet || adminWallet.length < 20) {
      return res.status(500).json({ error: 'Carteira de recebimento não configurada.' });
    }

    const result = await generateDepixQr({
      amount: amountNum.toFixed(2),
      depix_wallet_address: adminWallet,
      fee: '0.2',
    });

    if (!result.success || !('order' in result)) {
      const errorMsg = 'error' in result ? result.error : 'Não foi possível gerar o QR Code.';
      return res.status(400).json({ error: errorMsg });
    }

    const deposit = await (prisma as any).collateralDeposit.create({
      data: {
        partnerId: partner.id,
        type: 'DEPOSIT',
        amount: amountNum,
        method: 'PIX',
        status: 'PENDING',
        orderId: result.order.id,
      },
    });

    return res.json({
      depositId: deposit.id,
      orderId: result.order.id,
      method: 'PIX',
      qr_image_url: result.order.qr_image_url,
      qr_copy_paste: result.order.qr_copy_paste,
      amount: amountNum.toFixed(2),
      message: 'Pague via Pix. Após confirmação, o limite será aumentado automaticamente.',
    });
  } catch (error: any) {
    console.error('[generateCollateralDeposit] Erro:', error?.message, error?.stack);
    return res.status(500).json({ error: error?.message || 'Erro ao gerar depósito de colateral.' });
  }
};

/**
 * Verifica status de um depósito de colateral via SwapVerse (Pix).
 * Se confirmado, aumenta o limite do comerciante automaticamente.
 */
export const checkCollateralDepositStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado.' });

    const depositId = req.params.depositId;
    const deposit = await (prisma as any).collateralDeposit.findUnique({ where: { id: depositId } });
    if (!deposit || deposit.partnerId !== partner.id) {
      return res.status(404).json({ error: 'Depósito não encontrado.' });
    }

    if (deposit.status === 'CONFIRMED') {
      return res.json({ status: 'CONFIRMED', message: 'Depósito já confirmado.' });
    }

    if (deposit.method === 'DEPIX') {
      return res.json({ status: 'PENDING', message: 'Aguardando confirmação manual do admin.' });
    }

    if (!deposit.orderId) {
      return res.json({ status: 'PENDING', message: 'Sem orderId para verificar.' });
    }

    const swapResult = await getDepixOrderStatus(deposit.orderId);
    if (!swapResult.success || !swapResult.order) {
      return res.json({ status: 'PENDING', message: 'Aguardando confirmação...' });
    }

    if (swapResult.order.status === 'depix_sent') {
      const BASE_LIMIT = 500;
      const newCollateral = partner.collateralBalance + deposit.amount;
      const newLimit = BASE_LIMIT + newCollateral;

      await prisma.$transaction([
        (prisma as any).collateralDeposit.update({
          where: { id: depositId },
          data: { status: 'CONFIRMED', processedAt: new Date() },
        }),
        prisma.commercePartner.update({
          where: { userId },
          data: {
            collateralBalance: newCollateral,
            transactionLimit: newLimit,
            dailyPayerLimit: newLimit,
          },
        }),
      ]);

      return res.json({
        status: 'CONFIRMED',
        newCollateralBalance: newCollateral,
        newTransactionLimit: newLimit,
        message: `Colateral confirmado! Novo limite: R$ ${newLimit.toFixed(2)}.`,
      });
    }

    return res.json({ status: 'PENDING', swapVerseStatus: swapResult.order.status });
  } catch (error: any) {
    console.error('[checkCollateralDepositStatus] Erro:', error);
    return res.status(500).json({ error: 'Erro ao verificar depósito.' });
  }
};

/**
 * Solicita saque de colateral. Reduz o limite imediatamente.
 * Admin processa o envio manual via DePix.
 */
export const requestCollateralWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner || partner.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Modo Comércio não está ativo.' });
    }

    const { amount } = req.body;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'Valor inválido.' });
    }
    if (amountNum > partner.collateralBalance) {
      return res.status(400).json({
        error: `Saldo de colateral insuficiente. Disponível: R$ ${partner.collateralBalance.toFixed(2)}.`,
      });
    }

    const BASE_LIMIT = 500;
    const newCollateral = partner.collateralBalance - amountNum;
    const newLimit = BASE_LIMIT + newCollateral;

    await prisma.$transaction(async (tx) => {
      await (tx as any).collateralDeposit.create({
        data: {
          partnerId: partner.id,
          type: 'WITHDRAWAL',
          amount: amountNum,
          method: 'DEPIX',
          status: 'PENDING',
          note: 'Saque solicitado pelo comerciante',
        },
      });
      await tx.commercePartner.update({
        where: { userId },
        data: {
          collateralBalance: newCollateral,
          transactionLimit: newLimit,
          dailyPayerLimit: newLimit,
        },
      });
    });

    return res.json({
      newCollateralBalance: newCollateral,
      newTransactionLimit: newLimit,
      message: `Saque de R$ ${amountNum.toFixed(2)} solicitado. O limite foi reduzido para R$ ${newLimit.toFixed(2)}. O admin processará o envio.`,
    });
  } catch (error: any) {
    console.error('[requestCollateralWithdrawal] Erro:', error);
    return res.status(500).json({ error: 'Erro ao solicitar saque.' });
  }
};

/**
 * Lista histórico de depósitos/saques de colateral do comerciante.
 */
export const getCollateralHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    const partner = await prisma.commercePartner.findUnique({ where: { userId } });
    if (!partner) return res.status(404).json({ error: 'Comerciante não encontrado.' });

    const deposits = await (prisma as any).collateralDeposit.findMany({
      where: { partnerId: partner.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({
      collateralBalance: partner.collateralBalance,
      transactionLimit: partner.transactionLimit,
      dailyPayerLimit: partner.dailyPayerLimit,
      history: deposits,
    });
  } catch (error: any) {
    console.error('[getCollateralHistory] Erro:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
};

function slugAleatorio(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function requireCommerce(req: Request, res: Response): Promise<string | null> {
  const userId = (req as any).userId;
  const role = (req as any).userRole;
  if (role === 'ADMIN') return userId;

  const partner = await prisma.commercePartner.findUnique({
    where: { userId },
    select: { status: true }
  });
  if (partner?.status !== 'APPROVED') {
    res.status(403).json({ error: 'Modo Comércio não ativado' });
    return null;
  }
  return userId;
}

/** Limite em reais acima do qual a SwapVerse exige identificação do pagador (CPF/CNPJ + nome). */
export const SWAPVERSE_PAYER_DOC_THRESHOLD = 500;

/**
 * Verifica limites antifraude do comerciante:
 * 1. Valor da transação vs limite por transação (baseado em colateral)
 * 2. Total já pago pelo mesmo pagador (CPF/CNPJ) hoje vs limite diário por pagador
 */
export async function checkMerchantLimits(
  merchantUserId: string,
  grossAmount: number,
  payerTaxNumber?: string,
): Promise<{ allowed: boolean; error?: string }> {
  const partner = await prisma.commercePartner.findUnique({
    where: { userId: merchantUserId },
    select: { transactionLimit: true, dailyPayerLimit: true, collateralBalance: true },
  });
  if (!partner) return { allowed: false, error: 'Comerciante não encontrado.' };

  if (grossAmount > partner.transactionLimit) {
    return {
      allowed: false,
      error: `Valor excede o limite por transação deste comerciante (R$ ${partner.transactionLimit.toFixed(2)}). O comerciante precisa aumentar seu limite via colateral.`,
    };
  }

  if (payerTaxNumber && payerTaxNumber.length >= 11) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = await prisma.depixOrder.findMany({
      where: {
        payerTaxNumber,
        createdAt: { gte: todayStart },
        status: { not: 'cancelled' },
        OR: [
          { commerceLinkId: { not: null } },
          { commercePageId: { not: null } },
        ],
      },
      select: { grossAmount: true, amount: true },
    });

    const todayTotal = todayOrders.reduce((sum, o) => sum + (o.grossAmount || o.amount || 0), 0);
    if (todayTotal + grossAmount > partner.dailyPayerLimit) {
      const remaining = Math.max(0, partner.dailyPayerLimit - todayTotal);
      return {
        allowed: false,
        error: `Limite diário de R$ ${partner.dailyPayerLimit.toFixed(2)} por pagador atingido. Restante hoje: R$ ${remaining.toFixed(2)}.`,
      };
    }
  }

  return { allowed: true };
}

/** Validação completa de CPF com dígitos verificadores. */
function validateCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(digits[10], 10)) return false;
  return true;
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador. */
export function validatePayerTaxNumber(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
}

/** Validação completa de CNPJ com dígitos verificadores. */
function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  
  // Verificar se todos os dígitos são iguais (CNPJ inválido)
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Calcular primeiro dígito verificador
  let size = digits.length - 2;
  let numbers = digits.substring(0, size);
  const digits_verificadores = digits.substring(size);
  let sum = 0;
  let pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits_verificadores.charAt(0))) return false;
  
  // Calcular segundo dígito verificador
  size = size + 1;
  numbers = digits.substring(0, size);
  sum = 0;
  pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits_verificadores.charAt(1))) return false;
  
  return true;
}

/** Valida URL. */
function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Valida email. */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Lista links do comerciante logado. */
export const listLinks = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    
    try {
      const links = await prisma.commerceLink.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, titulo: true, amount: true, slug: true, isActive: true, createdAt: true },
    });
      return res.json({ links });
    } catch (dbError: any) {
      // Se a tabela não existir, retornar array vazio
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.warn('listLinks: Tabela CommerceLink não encontrada. Aplique a migration.');
        return res.json({ links: [] });
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('listLinks:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao listar links', links: [] });
  }
};

/** Cria link de pagamento (comerciante logado). */
export const createLink = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    const { titulo, valor } = req.body as { titulo?: string; valor?: number };
    const amount = typeof valor === 'number' ? valor : parseFloat(String(valor || '0').replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0.01) {
      return res.status(400).json({ error: 'Valor inválido. Mínimo R$ 0,01.' });
    }
    
    try {
    let slug = slugAleatorio();
      let attempts = 0;
      // Tentar até encontrar um slug único (máximo 5 tentativas)
      while (attempts < 5) {
        const existing = await prisma.commerceLink.findUnique({ where: { slug } });
        if (!existing) break;
        slug = slugAleatorio() + Date.now().toString(36);
        attempts++;
      }
      
      const link = await prisma.commerceLink.create({
      data: {
        userId,
        titulo: (titulo && String(titulo).trim()) || `Link R$ ${amount.toFixed(2)}`,
        amount: Math.round(amount * 100) / 100,
        slug,
        isActive: true,
      },
    });
    return res.status(201).json({ link });
    } catch (dbError: any) {
      // Se a tabela não existir, informar ao usuário
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.error('createLink: Tabela CommerceLink não encontrada. Aplique a migration.');
        return res.status(500).json({ error: 'Tabela de links não encontrada. Contate o suporte.' });
      }
      // Se slug duplicado, tentar novamente
      if (dbError?.code === 'P2002' && dbError?.meta?.target?.includes('slug')) {
        // Tentar criar com slug diferente
        const newSlug = slugAleatorio() + Date.now().toString(36);
        try {
          const link = await prisma.commerceLink.create({
            data: {
              userId,
              titulo: (titulo && String(titulo).trim()) || `Link R$ ${amount.toFixed(2)}`,
              amount: Math.round(amount * 100) / 100,
              slug: newSlug,
              isActive: true,
            },
          });
          return res.status(201).json({ link });
        } catch (retryError: any) {
          throw retryError;
        }
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('createLink:', e?.message, e?.stack);
    return res.status(500).json({ error: e?.message || 'Erro ao criar link' });
  }
};

/** Remove link (comerciante dono). */
export const deleteLink = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    const rawId = req.params.id;
    const id: string = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? String(rawId[0] ?? '') : '';
    if (!id) return res.status(400).json({ error: 'ID inválido' });
    
    try {
      const link = await prisma.commerceLink.findFirst({ where: { id, userId } });
    if (!link) return res.status(404).json({ error: 'Link não encontrado' });
      await prisma.commerceLink.delete({ where: { id } });
    return res.json({ message: 'Link removido' });
    } catch (dbError: any) {
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.warn('deleteLink: Tabela CommerceLink não encontrada.');
        return res.status(404).json({ error: 'Link não encontrado' });
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('deleteLink:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao remover link' });
  }
};

/** Público: dados do link por slug (para página /pay/:slug). */
export const getLinkBySlug = async (req: Request, res: Response) => {
  try {
    const raw = req.params.slug;
    const slug = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    console.log('[getLinkBySlug] Slug recebido:', slug);
    
    if (!slug) {
      console.warn('[getLinkBySlug] Slug inválido');
      return res.status(400).json({ error: 'Slug inválido' });
    }
    
    let link;
    try {
      console.log('[getLinkBySlug] Buscando link no banco...');
      link = await prisma.commerceLink.findFirst({
      where: { slug, isActive: true },
      select: { id: true, titulo: true, amount: true, slug: true, userId: true },
    });
      console.log('[getLinkBySlug] Link encontrado:', link ? 'Sim' : 'Não');
    } catch (dbError: any) {
      console.error('[getLinkBySlug] Erro ao buscar link:', dbError?.message);
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.warn('getLinkBySlug: Tabela CommerceLink não encontrada.');
        return res.status(404).json({ error: 'Link não encontrado ou inativo' });
      }
      throw dbError;
    }
    
    if (!link) {
      console.warn('[getLinkBySlug] Link não encontrado para slug:', slug);
      return res.status(404).json({ error: 'Link não encontrado ou inativo' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: link.userId },
      select: { name: true },
    }).catch(() => null);
    const merchantName = (user as any)?.name ?? 'Comerciante';

    // Buscar configurações do comerciante
    let settings: any = null;
    try {
      const partner = await (prisma as any).commercePartner?.findUnique?.({
        where: { userId: link.userId },
        select: { id: true },
      });
      if (partner) {
        settings = await (prisma as any).commerceSettings?.findUnique?.({
          where: { partnerId: partner.id },
          select: {
            businessName: true,
            cnpj: true,
            logoUrl: true,
            primaryColor: true,
            accentColor: true,
            backgroundColor: true,
            textColor: true,
            useCustomBranding: true,
            contactPhone: true,
            supportEmail: true,
            businessDescription: true,
            redirectUrl: true,
            faviconUrl: true,
          },
        }).catch(() => null);
      }
    } catch (settingsError: any) {
      // Se não conseguir buscar settings, continuar sem elas
      console.warn('getLinkBySlug: Erro ao buscar settings:', settingsError?.message);
    }

    const responseData = {
      id: link.id,
      titulo: link.titulo,
      amount: link.amount,
      slug: link.slug,
      needsPayerDoc: link.amount >= SWAPVERSE_PAYER_DOC_THRESHOLD,
      merchantName: settings?.businessName || merchantName,
      settings: settings ? {
        logoUrl: settings.logoUrl,
        cnpj: settings.cnpj,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        useCustomBranding: settings.useCustomBranding,
        contactPhone: settings.contactPhone,
        supportEmail: settings.supportEmail,
        businessDescription: settings.businessDescription,
        redirectUrl: settings.redirectUrl,
        faviconUrl: settings.faviconUrl,
      } : null,
    };
    
    console.log('[getLinkBySlug] Retornando dados:', { id: responseData.id, titulo: responseData.titulo, amount: responseData.amount });
    return res.json(responseData);
  } catch (e: any) {
    console.error('[getLinkBySlug] Erro geral:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao buscar link', message: e?.message });
  }
};

/** Público: gera QR Pix para pagamento do link (SwapVerse). Valor mínimo R$ 5. */
export const generatePixForLink = async (req: Request, res: Response) => {
  try {
    const raw = req.params.slug;
    const slug = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    
    if (!slug) {
      return res.status(400).json({ error: 'Slug inválido' });
    }

    const link = await prisma.commerceLink.findFirst({
      where: { slug, isActive: true },
      select: { id: true, userId: true, titulo: true, amount: true },
    });
    
    if (!link) {
      return res.status(404).json({ error: 'Link não encontrado ou inativo' });
    }

    if (link.amount < 5) {
      return res.status(400).json({ error: 'Valor mínimo para pagamento via Pix é R$ 5,00.' });
    }

    const partner = await prisma.commercePartner.findUnique({
      where: { userId: link.userId },
      select: { id: true },
    });
    if (!partner) return res.status(400).json({ error: 'Comerciante não configurado.' });

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: partner.id },
      select: { liquidWallet: true, redirectUrl: true },
    });
    const liquidWallet = settings?.liquidWallet?.trim();
    if (!liquidWallet || liquidWallet.length < 20) {
      return res.status(400).json({
        error: 'Este comerciante ainda não configurou a carteira para receber pagamentos. Entre em contato com o estabelecimento.',
      });
    }

    const grossAmount = Math.round(link.amount * 100) / 100;
    const needsPayerDoc = grossAmount >= SWAPVERSE_PAYER_DOC_THRESHOLD;

    const { payer_name: bodyPayerName, payer_tax_number: bodyPayerTaxNumber } = (req.body as { payer_name?: string; payer_tax_number?: string }) || {};
    const payerName = bodyPayerName != null ? String(bodyPayerName).trim() : '';
    const payerTaxNumberRaw = bodyPayerTaxNumber != null ? String(bodyPayerTaxNumber).replace(/\D/g, '') : '';

    if (needsPayerDoc) {
      if (!payerName || payerName.length < 2) {
        return res.status(400).json({ error: 'Para valores a partir de R$ 500,00 é obrigatório informar o nome completo do pagador (exigência do processador de pagamento).' });
      }
      if (!payerTaxNumberRaw || !validatePayerTaxNumber(payerTaxNumberRaw)) {
        return res.status(400).json({ error: 'Para valores a partir de R$ 500,00 é obrigatório informar CPF (11 dígitos) ou CNPJ (14 dígitos) válido do pagador.' });
      }
    }

    const limitsCheck = await checkMerchantLimits(link.userId, grossAmount, payerTaxNumberRaw || undefined);
    if (!limitsCheck.allowed) {
      return res.status(400).json({ error: limitsCheck.error });
    }

    const fees = await getMerchantFees(link.userId);
    const fixedFeePaid = fees.fixedFee;
    const variableFeePaid = Math.round(grossAmount * (fees.variablePercent / 100) * 100) / 100;
    const pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100;
    const swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100;
    const totalToPay = grossAmount;

    const result = await generateDepixQr({
      amount: totalToPay.toFixed(2),
      depix_wallet_address: liquidWallet,
      fee: '0.2',
      payer_name: payerName || undefined,
      payer_tax_number: payerTaxNumberRaw || undefined,
    });

    if (!result.success) {
      const errorMsg = 'error' in result ? result.error : 'Não foi possível gerar o QR Code Pix.';
      return res.status(400).json({ error: errorMsg });
    }

    if (!('order' in result)) {
      return res.status(400).json({ error: 'Não foi possível gerar o QR Code Pix.' });
    }

    const order = result.order;
    await (prisma as any).depixOrder?.create?.({
      data: {
        userId: link.userId,
        orderId: order.id,
        amount: grossAmount,
        totalToPay,
        status: order.status || 'pending',
        commerceLinkId: link.id,
        payerName: payerName || null,
        payerTaxNumber: payerTaxNumberRaw || null,
        grossAmount,
        fixedFeePaid,
        variableFeePaid,
        pagdepixProfit,
        swapverseFee,
      },
    });

    return res.json({
      orderId: order.id,
      qr_image_url: order.qr_image_url,
      qr_copy_paste: order.qr_copy_paste,
      totalToPay: grossAmount.toFixed(2),
      redirectUrl: settings?.redirectUrl || null,
    });
  } catch (e: any) {
    console.error('[generatePixForLink]', e?.message, e?.stack);
    return res.status(500).json({ error: e?.message || 'Erro ao gerar pagamento.' });
  }
};

/** Público: status do pedido Pix (para polling na página do link). */
export const getCommerceOrderStatus = async (req: Request, res: Response) => {
  try {
    const raw = req.params.orderId;
    const orderId = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    if (!orderId) return res.status(400).json({ error: 'ID do pedido inválido' });

    // Buscar o pedido no banco primeiro para comparar status
    const dbOrder: any = await prisma.depixOrder.findFirst({
      where: { orderId },
      select: {
        id: true,
        status: true,
        userId: true,
        totalToPay: true,
        amount: true,
        commerceLinkId: true,
        commercePageId: true,
        grossAmount: true,
        fixedFeePaid: true,
        variableFeePaid: true,
        emailNotifiedAt: true,
      },
    });

    if (!dbOrder) {
      return res.status(404).json({ error: 'Pedido não encontrado no banco de dados' });
    }

    // Consultar status na SwapVerse
    const result = await getDepixOrderStatus(orderId);
    if (!result.success) return res.status(400).json({ error: result.error || 'Pedido não encontrado na SwapVerse' });
    if (!result.order) return res.status(400).json({ error: 'Pedido não encontrado na SwapVerse' });

    const swapverseStatus = result.order.status;
    const dbStatus = dbOrder.status;
    const statusChanged = swapverseStatus !== dbStatus;
    const isDepixSent = swapverseStatus === 'depix_sent';
    const isCommercePayment = !!(dbOrder.commerceLinkId || dbOrder.commercePageId);

    // Se o status mudou para depix_sent, atualizar no banco e processar pagamento
    if (statusChanged && isDepixSent) {
      try {
        // Buscar dados completos do pedido para processar notificação
        const fullOrder: any = await prisma.depixOrder.findFirst({
          where: { orderId },
          include: {
            commerceLink: {
              select: {
                id: true,
                titulo: true,
                slug: true,
              },
            },
            commercePage: {
              select: {
                id: true,
                titulo: true,
                slug: true,
              },
            },
            user: {
              include: {
                commercePartner: {
                  include: {
                    settings: true,
                  },
                },
              },
            },
          },
        });

        // Calcular taxas se ainda não calculadas (para pagamentos de comércio)
        let grossAmount = dbOrder.grossAmount;
        let fixedFeePaid = dbOrder.fixedFeePaid;
        let variableFeePaid = dbOrder.variableFeePaid;
        let pagdepixProfit: number | null = null;
        let swapverseFee: number | null = null;

        if (isCommercePayment && (!grossAmount || grossAmount === null)) {
          grossAmount = dbOrder.totalToPay || dbOrder.amount || 0;
          fixedFeePaid = 0.99;
          variableFeePaid = Math.round(grossAmount * 0.005 * 100) / 100; // 0,5%
          pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100; // 0,3%
          swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100; // 0,2%
        }

        // Atualizar status e campos de taxas no banco
        const updateData: any = {
          status: swapverseStatus,
        };

        if (isCommercePayment && (!dbOrder.grossAmount || dbOrder.grossAmount === null)) {
          updateData.grossAmount = grossAmount;
          updateData.fixedFeePaid = fixedFeePaid;
          updateData.variableFeePaid = variableFeePaid;
          updateData.pagdepixProfit = pagdepixProfit;
          updateData.swapverseFee = swapverseFee;
        }

        await prisma.depixOrder.update({
          where: { id: dbOrder.id },
          data: updateData,
        });

        // Creditar valor líquido ao comerciante
        if (isCommercePayment) {
          const netAmount = grossAmount - fixedFeePaid - variableFeePaid;
          await prisma.user.update({
            where: { id: dbOrder.userId },
            data: {
              totalPaid: {
                increment: Math.max(0, netAmount),
              },
            },
          });
        } else {
          // Para pagamentos não-comércio, creditar totalToPay
          await prisma.user.update({
            where: { id: dbOrder.userId },
            data: {
              totalPaid: {
                increment: dbOrder.totalToPay || 0,
              },
            },
          });
        }

        // Enviar email de notificação se ainda não foi enviado (apenas para comércio)
        if (
          fullOrder &&
          isCommercePayment &&
          !dbOrder.emailNotifiedAt &&
          fullOrder.user?.commercePartner?.settings?.emailNotificationsEnabled !== false
        ) {
          const merchantEmail = fullOrder.user.email;
          const merchantName = fullOrder.user.commercePartner?.settings?.businessName || fullOrder.user.name;
          const paymentTitle = fullOrder.commerceLink?.titulo || fullOrder.commercePage?.titulo || 'Pagamento';
          const netAmount = grossAmount - fixedFeePaid - variableFeePaid;

          // Enviar email de notificação (não bloquear resposta se falhar)
          sendPaymentNotificationEmail(merchantEmail, merchantName, {
            amount: netAmount, // Valor líquido recebido
            linkTitle: paymentTitle,
            orderId: orderId,
            paymentDate: fullOrder.createdAt.toISOString(),
          }).catch((emailError) => {
            console.error('[getCommerceOrderStatus] Erro ao enviar email de notificação:', emailError);
          });

          // Marcar como notificado
          await prisma.depixOrder.update({
            where: { id: dbOrder.id },
            data: { emailNotifiedAt: new Date() },
          }).catch((updateError) => {
            console.error('[getCommerceOrderStatus] Erro ao atualizar emailNotifiedAt:', updateError);
          });
        }

        if (dbOrder.commerceLinkId) {
          const amt = grossAmount ?? dbOrder.totalToPay ?? dbOrder.amount ?? 0;
          onCommerceLinkPaymentPaid(dbOrder.commerceLinkId, dbOrder.id, amt, fullOrder?.createdAt ?? new Date()).catch((e) =>
            console.warn('[getCommerceOrderStatus] Webhook charge.paid:', e?.message)
          );
        }

        console.log(`[getCommerceOrderStatus] Status atualizado: ${dbStatus} -> ${swapverseStatus} (orderId: ${orderId})`);
      } catch (notificationError: any) {
        // Não bloquear resposta se houver erro na notificação
        console.error('[getCommerceOrderStatus] Erro ao processar atualização de status:', notificationError?.message);
      }
    }

    return res.json({ order: result.order });
  } catch (e: any) {
    console.error('[getCommerceOrderStatus]', e?.message);
    return res.status(500).json({ error: 'Erro ao consultar status.' });
  }
};

/** Obtém configurações do comerciante logado. */
export const getSettings = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    try {
      // Tentar buscar com todos os campos primeiro
      let settings: any = null;
      try {
        settings = await (prisma as any).commerceSettings?.findUnique?.({
          where: { partnerId: partner.id },
        });
      } catch (tableError: any) {
        // Se a tabela não existir, retornar valores padrão
        if (tableError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(tableError?.message || '')) {
          console.warn('getSettings: Tabela CommerceSettings não encontrada. Aplique a migration.');
          return res.json({
            settings: {
              businessName: null,
              cnpj: null,
              logoUrl: null,
              primaryColor: null,
              accentColor: null,
              backgroundColor: null,
              textColor: null,
              useCustomBranding: false,
              contactPhone: null,
              supportEmail: null,
              businessDescription: null,
              redirectUrl: null,
              faviconUrl: null,
              liquidWallet: null,
              emailNotificationsEnabled: true,
            },
          });
        }
        throw tableError;
      }

      // Se encontrou, retornar com todos os campos (mesmo que alguns sejam null)
      return res.json({
        settings: {
          businessName: settings?.businessName || null,
          cnpj: settings?.cnpj || null,
          logoUrl: settings?.logoUrl || null,
          primaryColor: settings?.primaryColor || null,
          accentColor: settings?.accentColor || null,
          backgroundColor: settings?.backgroundColor || null,
          textColor: settings?.textColor || null,
          useCustomBranding: settings?.useCustomBranding ?? false,
          contactPhone: settings?.contactPhone || null,
          supportEmail: settings?.supportEmail || null,
          businessDescription: settings?.businessDescription || null,
          redirectUrl: settings?.redirectUrl || null,
          faviconUrl: settings?.faviconUrl || null,
          liquidWallet: settings?.liquidWallet || null,
          emailNotificationsEnabled: settings?.emailNotificationsEnabled ?? true,
          storeSlug: settings?.storeSlug || null,
          showCnpjOnStore: settings?.showCnpjOnStore ?? false,
          showPhoneOnStore: settings?.showPhoneOnStore ?? false,
          showEmailOnStore: settings?.showEmailOnStore ?? false,
          onboardingCompleted: settings?.onboardingCompleted ?? false,
          onboardingStep: settings?.onboardingStep ?? 0,
        },
      });
    } catch (dbError: any) {
      // Se campos não existirem (migration parcial), retornar apenas campos básicos
      if (dbError?.code === 'P2010' || /column.*does not exist|Unknown column/i.test(dbError?.message || '')) {
        console.warn('getSettings: Alguns campos não existem. Aplique a migration completa.');
        // Tentar buscar apenas campos básicos
        try {
          const basicSettings = await (prisma as any).commerceSettings?.findUnique?.({
            where: { partnerId: partner.id },
            select: {
              businessName: true,
              cnpj: true,
              logoUrl: true,
              primaryColor: true,
              useCustomBranding: true,
            },
          });
          return res.json({
            settings: {
              businessName: basicSettings?.businessName || null,
              cnpj: basicSettings?.cnpj || null,
              logoUrl: basicSettings?.logoUrl || null,
              primaryColor: basicSettings?.primaryColor || null,
              accentColor: null,
              backgroundColor: null,
              textColor: null,
              useCustomBranding: basicSettings?.useCustomBranding ?? false,
              contactPhone: null,
              supportEmail: null,
              businessDescription: null,
              redirectUrl: null,
              faviconUrl: null,
              liquidWallet: null,
            },
          });
        } catch {
          // Se mesmo os básicos falharem, retornar padrão
          return res.json({
            settings: {
              businessName: null,
              cnpj: null,
              logoUrl: null,
              primaryColor: null,
              accentColor: null,
              backgroundColor: null,
              textColor: null,
              useCustomBranding: false,
              contactPhone: null,
              supportEmail: null,
              businessDescription: null,
              redirectUrl: null,
              faviconUrl: null,
              liquidWallet: null,
            },
          });
        }
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('getSettings:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao carregar configurações', message: e?.message });
  }
};

/** Atualiza configurações do comerciante logado. */
export const updateSettings = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    const {
      businessName,
      cnpj,
      logoUrl,
      primaryColor,
      accentColor,
      backgroundColor,
      textColor,
      useCustomBranding,
      contactPhone,
      supportEmail,
      businessDescription,
      redirectUrl,
      faviconUrl,
      liquidWallet,
      emailNotificationsEnabled,
      storeSlug,
      showCnpjOnStore,
      showPhoneOnStore,
      showEmailOnStore,
      onboardingCompleted,
      onboardingStep,
    } = req.body as {
      businessName?: string | null;
      cnpj?: string | null;
      logoUrl?: string | null;
      primaryColor?: string | null;
      accentColor?: string | null;
      backgroundColor?: string | null;
      textColor?: string | null;
      useCustomBranding?: boolean;
      contactPhone?: string | null;
      supportEmail?: string | null;
      businessDescription?: string | null;
      redirectUrl?: string | null;
      faviconUrl?: string | null;
      liquidWallet?: string | null;
      emailNotificationsEnabled?: boolean;
      storeSlug?: string | null;
      showCnpjOnStore?: boolean;
      showPhoneOnStore?: boolean;
      showEmailOnStore?: boolean;
      onboardingCompleted?: boolean;
      onboardingStep?: number;
    };

    // Validar CNPJ se fornecido (com dígitos verificadores)
    if (cnpj !== null && cnpj !== undefined && cnpj.trim()) {
      const cnpjDigits = cnpj.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) {
        return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
      }
      if (!validateCNPJ(cnpjDigits)) {
        return res.status(400).json({ error: 'CNPJ inválido (dígitos verificadores incorretos)' });
      }
    }

    // Validar cores se fornecidas
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const validateColor = (color: string | null | undefined, fieldName: string) => {
      if (color !== null && color !== undefined && color.trim()) {
        if (!colorRegex.test(color.trim())) {
          return `Cor ${fieldName} deve estar no formato hexadecimal (ex: #FF6B00)`;
        }
      }
      return null;
    };

    const colorErrors = [
      validateColor(primaryColor, 'principal'),
      validateColor(accentColor, 'de destaque'),
      validateColor(backgroundColor, 'de fundo'),
      validateColor(textColor, 'do texto'),
    ].filter(Boolean);

    if (colorErrors.length > 0) {
      return res.status(400).json({ error: colorErrors[0] });
    }

    // Validar email de suporte se fornecido
    if (supportEmail !== null && supportEmail !== undefined && supportEmail.trim()) {
      if (!isValidEmail(supportEmail.trim())) {
        return res.status(400).json({ error: 'E-mail de suporte inválido' });
      }
    }

    // Validar URLs se fornecidas
    if (logoUrl !== null && logoUrl !== undefined && logoUrl.trim()) {
      // Se não começar com /uploads/, deve ser URL válida
      if (!logoUrl.startsWith('/uploads/') && !isValidUrl(logoUrl.trim())) {
        return res.status(400).json({ error: 'URL da logo inválida' });
      }
    }

    if (redirectUrl !== null && redirectUrl !== undefined && redirectUrl.trim()) {
      if (!isValidUrl(redirectUrl.trim())) {
        return res.status(400).json({ error: 'URL de redirecionamento inválida' });
      }
    }

    if (faviconUrl !== null && faviconUrl !== undefined && faviconUrl.trim()) {
      if (!faviconUrl.startsWith('/uploads/') && !isValidUrl(faviconUrl.trim())) {
        return res.status(400).json({ error: 'URL do favicon inválida' });
      }
    }

    // Validar slug da loja se fornecido
    const SLUG_RESERVED = ['admin', 'dashboard', 'api', 'login', 'register', 'loja', 'pay', 'page', 'pagar', 'recarga'];
    if (storeSlug !== undefined && storeSlug !== null && storeSlug.trim()) {
      const slug = storeSlug.trim().toLowerCase();
      if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
        return res.status(400).json({ error: 'Slug deve ter 3-50 caracteres (letras minúsculas, números e hífens)' });
      }
      if (SLUG_RESERVED.includes(slug)) {
        return res.status(400).json({ error: 'Este slug é reservado e não pode ser utilizado' });
      }
    }

    const updateData: any = {};
    if (businessName !== undefined) updateData.businessName = businessName?.trim() || null;
    if (cnpj !== undefined) updateData.cnpj = cnpj?.trim() ? cnpj.replace(/\D/g, '') : null;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl?.trim() || null;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor?.trim() || null;
    if (accentColor !== undefined) updateData.accentColor = accentColor?.trim() || null;
    if (backgroundColor !== undefined) updateData.backgroundColor = backgroundColor?.trim() || null;
    if (textColor !== undefined) updateData.textColor = textColor?.trim() || null;
    if (useCustomBranding !== undefined) updateData.useCustomBranding = Boolean(useCustomBranding);
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone?.trim() || null;
    if (supportEmail !== undefined) updateData.supportEmail = supportEmail?.trim() || null;
    if (businessDescription !== undefined) updateData.businessDescription = businessDescription?.trim() || null;
    if (redirectUrl !== undefined) updateData.redirectUrl = redirectUrl?.trim() || null;
    if (faviconUrl !== undefined) updateData.faviconUrl = faviconUrl?.trim() || null;
    if (liquidWallet !== undefined) updateData.liquidWallet = liquidWallet?.trim() || null;
    if (emailNotificationsEnabled !== undefined) updateData.emailNotificationsEnabled = Boolean(emailNotificationsEnabled);
    if (storeSlug !== undefined) updateData.storeSlug = storeSlug?.trim().toLowerCase() || null;
    if (showCnpjOnStore !== undefined) updateData.showCnpjOnStore = Boolean(showCnpjOnStore);
    if (showPhoneOnStore !== undefined) updateData.showPhoneOnStore = Boolean(showPhoneOnStore);
    if (showEmailOnStore !== undefined) updateData.showEmailOnStore = Boolean(showEmailOnStore);
    if (onboardingCompleted !== undefined) updateData.onboardingCompleted = Boolean(onboardingCompleted);
    if (onboardingStep !== undefined) updateData.onboardingStep = Number(onboardingStep) || 0;

    // Verificar conflito de slug antes do upsert para dar mensagem clara
    if (updateData.storeSlug) {
      const existing = await (prisma as any).commerceSettings?.findFirst?.({
        where: { storeSlug: updateData.storeSlug, NOT: { partnerId: partner.id } },
        select: { id: true },
      });
      if (existing) {
        return res.status(409).json({ error: 'Este endereço já está em uso. Escolha outro slug para sua loja.' });
      }
    }

    const fullSelect = {
      id: true,
      businessName: true,
      cnpj: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      backgroundColor: true,
      textColor: true,
      useCustomBranding: true,
      contactPhone: true,
      supportEmail: true,
      businessDescription: true,
      redirectUrl: true,
      faviconUrl: true,
      liquidWallet: true,
      emailNotificationsEnabled: true,
      storeSlug: true,
      showCnpjOnStore: true,
      showPhoneOnStore: true,
      showEmailOnStore: true,
      onboardingCompleted: true,
      onboardingStep: true,
      updatedAt: true,
    };

    const baseSelect = {
      id: true,
      businessName: true,
      cnpj: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      backgroundColor: true,
      textColor: true,
      useCustomBranding: true,
      contactPhone: true,
      supportEmail: true,
      businessDescription: true,
      redirectUrl: true,
      faviconUrl: true,
      liquidWallet: true,
      emailNotificationsEnabled: true,
      updatedAt: true,
    };

    // Strip new fields from updateData if they may not exist in DB
    const safeUpdateData = { ...updateData };
    const newFields = ['storeSlug', 'showCnpjOnStore', 'showPhoneOnStore', 'showEmailOnStore', 'onboardingCompleted', 'onboardingStep'];

    let settings: any;
    try {
      settings = await (prisma as any).commerceSettings?.upsert?.({
        where: { partnerId: partner.id },
        update: updateData,
        create: { partnerId: partner.id, emailNotificationsEnabled: true, ...updateData },
        select: fullSelect,
      });
    } catch (upsertErr: any) {
      console.error('updateSettings upsert error — code:', upsertErr?.code, 'message:', upsertErr?.message);

      // P2002: unique constraint (slug conflict race condition)
      if (upsertErr?.code === 'P2002') {
        return res.status(409).json({ error: 'Este endereço já está em uso. Escolha outro slug para sua loja.' });
      }

      // P2010 / P2021 / PrismaClientValidationError: column missing or client not regenerated
      const isMissingColumn = upsertErr?.code === 'P2010' || upsertErr?.code === 'P2021' ||
        upsertErr?.name === 'PrismaClientValidationError' ||
        /column.*does not exist|Unknown column|does not exist|Unknown field|Invalid value for argument/i.test(upsertErr?.message || '');
      if (isMissingColumn) {
        console.warn('updateSettings: Novos campos não existem no banco. Tentando fallback sem campos novos.');
        newFields.forEach((f) => delete safeUpdateData[f]);
        settings = await (prisma as any).commerceSettings?.upsert?.({
          where: { partnerId: partner.id },
          update: safeUpdateData,
          create: { partnerId: partner.id, emailNotificationsEnabled: true, ...safeUpdateData },
          select: baseSelect,
        });
      } else {
        throw upsertErr;
      }
    }

    return res.json({ settings });
  } catch (e: any) {
    console.error('updateSettings error — code:', e?.code, 'message:', e?.message, 'stack:', e?.stack);
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'Este endereço já está em uso. Escolha outro slug para sua loja.' });
    }
    return res.status(500).json({ error: 'Erro ao salvar configurações. Tente novamente.' });
  }
};

/** Verifica disponibilidade de slug de loja. */
export const checkSlugAvailability = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const slug = String(req.params.slug || '').trim().toLowerCase();
    const SLUG_RESERVED = ['admin', 'dashboard', 'api', 'login', 'register', 'loja', 'pay', 'page', 'pagar', 'recarga'];

    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
      return res.json({ available: false, reason: 'Slug deve ter 3-50 caracteres (letras minúsculas, números e hífens)' });
    }
    if (SLUG_RESERVED.includes(slug)) {
      return res.json({ available: false, reason: 'Slug reservado' });
    }

    const existing = await (prisma as any).commerceSettings?.findUnique?.({ where: { storeSlug: slug }, select: { partnerId: true } });

    // Verificar se pertence ao próprio usuário (permitir manter o mesmo slug)
    if (existing) {
      const partner = await (prisma as any).commercePartner?.findUnique?.({ where: { userId }, select: { id: true } });
      if (partner && existing.partnerId === partner.id) {
        return res.json({ available: true });
      }
      return res.json({ available: false, reason: 'Slug já está em uso' });
    }

    return res.json({ available: true });
  } catch (e: any) {
    console.error('checkSlugAvailability:', e?.message);
    return res.status(500).json({ error: 'Erro ao verificar slug' });
  }
};

/** Página pública da loja por slug. */
export const getPublicStore = async (req: Request, res: Response) => {
  try {
    const storeSlug = String(req.params.storeSlug || '');
    if (!storeSlug) return res.status(400).json({ error: 'Slug não fornecido' });

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { storeSlug: storeSlug.toLowerCase() },
      select: {
        businessName: true,
        businessDescription: true,
        logoUrl: true,
        faviconUrl: true,
        primaryColor: true,
        accentColor: true,
        backgroundColor: true,
        textColor: true,
        useCustomBranding: true,
        showCnpjOnStore: true,
        showPhoneOnStore: true,
        showEmailOnStore: true,
        cnpj: true,
        contactPhone: true,
        supportEmail: true,
        storeSlug: true,
        partner: {
          select: {
            userId: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!settings) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const sellerId: string | null = settings.partner?.userId || null;

    const products = sellerId
      ? await prisma.product.findMany({
          where: { sellerId, status: 'APPROVED', isAdultContent: false },
          select: {
            id: true,
            title: true,
            slug: true,
            priceInDepix: true,
            category: true,
            deliveryType: true,
            coverImageUrl: true,
            description: true,
            averageRating: true,
            reviewCount: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return res.json({
      settings: {
        businessName: settings.businessName,
        businessDescription: settings.businessDescription,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        useCustomBranding: settings.useCustomBranding,
        storeSlug: settings.storeSlug,
        ...(settings.showCnpjOnStore ? { cnpj: settings.cnpj } : {}),
        ...(settings.showPhoneOnStore ? { contactPhone: settings.contactPhone } : {}),
        ...(settings.showEmailOnStore ? { supportEmail: settings.supportEmail } : {}),
        sellerName: settings.partner?.user?.name || null,
      },
      products,
    });
  } catch (e: any) {
    console.error('getPublicStore:', e?.message);
    return res.status(500).json({ error: 'Erro ao carregar loja' });
  }
};

/** Upload de logo do comerciante. */
export const uploadLogo = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    // Validar tipo de arquivo
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Formato inválido. Use PNG, JPG, JPEG ou SVG.',
      });
    }

    // Validar tamanho (5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Arquivo muito grande. Tamanho máximo: 5 MB.',
      });
    }

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    const logoUrl = `${baseUrl}/uploads/commerce-logos/${file.filename}`;

    // Atualizar ou criar settings com a logo
    await (prisma as any).commerceSettings?.upsert?.({
      where: { partnerId: partner.id },
      update: { logoUrl },
      create: {
        partnerId: partner.id,
        logoUrl,
      },
    });

    return res.status(201).json({ logoUrl });
  } catch (e: any) {
    console.error('uploadLogo:', e?.message);
    return res.status(500).json({ error: 'Erro ao fazer upload da logo' });
  }
};

/** Remove logo do comerciante. */
export const removeLogo = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: partner.id },
      select: { logoUrl: true },
    });

    if (settings?.logoUrl && settings.logoUrl.startsWith('/uploads/')) {
      // Remover arquivo físico apenas se for upload local
      const fs = require('fs');
      const path = require('path');
      const logoPath = path.resolve(__dirname, '..', '..', 'uploads', 'commerce-logos', settings.logoUrl.split('/').pop() || '');
      try {
        if (fs.existsSync(logoPath)) {
          fs.unlinkSync(logoPath);
        }
      } catch (err) {
        console.warn('Erro ao remover arquivo de logo:', err);
      }
    }

    await (prisma as any).commerceSettings?.update?.({
      where: { partnerId: partner.id },
      data: { logoUrl: null },
    });

    return res.json({ message: 'Logo removida' });
  } catch (e: any) {
    console.error('removeLogo:', e?.message);
    return res.status(500).json({ error: 'Erro ao remover logo' });
  }
};

/** Upload de favicon do comerciante. */
export const uploadFavicon = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    // Validar tipo de arquivo (favicon geralmente é .ico, mas aceitamos PNG também)
    const allowedMimes = ['image/png', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/ico'];
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Formato inválido. Use ICO ou PNG.',
      });
    }

    // Validar tamanho (1 MB para favicon)
    if (file.size > 1 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Arquivo muito grande. Tamanho máximo: 1 MB.',
      });
    }

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    const baseUrl = process.env.APP_URL || 'http://localhost:3001';
    const faviconUrl = `${baseUrl}/uploads/commerce-favicons/${file.filename}`;

    // Atualizar ou criar settings com o favicon
    await (prisma as any).commerceSettings?.upsert?.({
      where: { partnerId: partner.id },
      update: { faviconUrl },
      create: {
        partnerId: partner.id,
        faviconUrl,
      },
    });

    return res.status(201).json({ faviconUrl });
  } catch (e: any) {
    console.error('uploadFavicon:', e?.message);
    return res.status(500).json({ error: 'Erro ao fazer upload do favicon' });
  }
};

/** Remove favicon do comerciante. */
export const removeFavicon = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: partner.id },
      select: { faviconUrl: true },
    });

    if (settings?.faviconUrl && settings.faviconUrl.startsWith('/uploads/')) {
      const fs = require('fs');
      const path = require('path');
      const faviconPath = path.resolve(__dirname, '..', '..', 'uploads', 'commerce-favicons', settings.faviconUrl.split('/').pop() || '');
      try {
        if (fs.existsSync(faviconPath)) {
          fs.unlinkSync(faviconPath);
        }
      } catch (err) {
        console.warn('Erro ao remover arquivo de favicon:', err);
      }
    }

    await (prisma as any).commerceSettings?.update?.({
      where: { partnerId: partner.id },
      data: { faviconUrl: null },
    });

    return res.json({ message: 'Favicon removido' });
  } catch (e: any) {
    console.error('removeFavicon:', e?.message);
    return res.status(500).json({ error: 'Erro ao remover favicon' });
  }
};

/** Dashboard de estatísticas do comerciante. */
export const getStatistics = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Buscar todos os pagamentos confirmados (recebidos) pelo comerciante
    // DepixOrder.userId = cliente que pagou; CommerceLink/CommercePage.userId = comerciante dono
    // Buscar por links e páginas do comerciante, não por userId do pagamento
    let allPayments: any[] = [];
    try {
      const [merchantLinks, merchantPages] = await Promise.all([
        prisma.commerceLink.findMany({
          where: { userId },
          select: { id: true, titulo: true, slug: true, amount: true },
        }),
        (prisma as any).commercePage?.findMany?.({
          where: { userId },
          select: { id: true, titulo: true, slug: true },
        }) || [],
      ]);

      const linkIds = merchantLinks.map((l) => l.id);
      const pageIds = merchantPages.map((p: any) => p.id);
      const linksMap = new Map(merchantLinks.map((l) => [l.id, l]));
      const pagesMap = new Map(merchantPages.map((p: any) => [p.id, p]));

      const orConditions: any[] = [];
      if (linkIds.length > 0) orConditions.push({ commerceLinkId: { in: linkIds } });
      if (pageIds.length > 0) orConditions.push({ commercePageId: { in: pageIds } });
      if (orConditions.length === 0) {
        allPayments = [];
      } else {
        const commercePayments = await prisma.depixOrder.findMany({
          where: {
            status: 'depix_sent',
            OR: orConditions,
          },
          orderBy: { createdAt: 'desc' },
        });

        allPayments = commercePayments.map((p: any) => ({
          ...p,
          commerceLink: p.commerceLinkId ? linksMap.get(p.commerceLinkId) || null : null,
          commercePage: p.commercePageId ? pagesMap.get(p.commercePageId) || null : null,
        }));
      }
    } catch (dbError: any) {
      console.error('[getStatistics] Erro ao buscar pagamentos:', dbError?.message);
      // Se a tabela não existir ou houver erro, retornar array vazio
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.warn('[getStatistics] Tabela DepixOrder não encontrada. Aplique a migration.');
        allPayments = [];
      } else {
        throw dbError;
      }
    }

    console.log(`[getStatistics] Encontrados ${allPayments.length} pagamentos para userId: ${userId}`);

    // Calcular faturamento bruto (valor antes das taxas)
    const grossAll = allPayments.reduce((sum: number, p: any) => sum + (p.grossAmount || p.amount || 0), 0);
    const grossToday = allPayments
      .filter((p: any) => new Date(p.createdAt) >= todayStart)
      .reduce((sum: number, p: any) => sum + (p.grossAmount || p.amount || 0), 0);
    const grossWeek = allPayments
      .filter((p: any) => new Date(p.createdAt) >= weekStart)
      .reduce((sum: number, p: any) => sum + (p.grossAmount || p.amount || 0), 0);
    const grossMonth = allPayments
      .filter((p: any) => new Date(p.createdAt) >= monthStart)
      .reduce((sum: number, p: any) => sum + (p.grossAmount || p.amount || 0), 0);

    // Calcular total de taxas pagas pelo lojista
    const feesAll = allPayments.reduce((sum: number, p: any) => sum + ((p.fixedFeePaid || 0) + (p.variableFeePaid || 0)), 0);
    const feesToday = allPayments
      .filter((p: any) => new Date(p.createdAt) >= todayStart)
      .reduce((sum: number, p: any) => sum + ((p.fixedFeePaid || 0) + (p.variableFeePaid || 0)), 0);
    const feesWeek = allPayments
      .filter((p: any) => new Date(p.createdAt) >= weekStart)
      .reduce((sum: number, p: any) => sum + ((p.fixedFeePaid || 0) + (p.variableFeePaid || 0)), 0);
    const feesMonth = allPayments
      .filter((p: any) => new Date(p.createdAt) >= monthStart)
      .reduce((sum: number, p: any) => sum + ((p.fixedFeePaid || 0) + (p.variableFeePaid || 0)), 0);

    // Calcular lucro PagDepix (0,3%)
    const profitAll = allPayments.reduce((sum: number, p: any) => sum + (p.pagdepixProfit || 0), 0);
    const profitToday = allPayments
      .filter((p: any) => new Date(p.createdAt) >= todayStart)
      .reduce((sum: number, p: any) => sum + (p.pagdepixProfit || 0), 0);
    const profitWeek = allPayments
      .filter((p: any) => new Date(p.createdAt) >= weekStart)
      .reduce((sum: number, p: any) => sum + (p.pagdepixProfit || 0), 0);
    const profitMonth = allPayments
      .filter((p: any) => new Date(p.createdAt) >= monthStart)
      .reduce((sum: number, p: any) => sum + (p.pagdepixProfit || 0), 0);

    // Contar pagamentos por período
    const countAll = allPayments.length;
    const countToday = allPayments.filter((p: any) => new Date(p.createdAt) >= todayStart).length;
    const countWeek = allPayments.filter((p: any) => new Date(p.createdAt) >= weekStart).length;
    const countMonth = allPayments.filter((p: any) => new Date(p.createdAt) >= monthStart).length;

    // Estatísticas por link/página (mais usados)
    const linkStatsMap = new Map<string, { titulo: string; slug: string; amount: number; count: number; total: number; type: 'link' | 'page' }>();
    allPayments.forEach((p: any) => {
      if (p.commerceLink) {
        const linkId = p.commerceLink.id;
        const existing = linkStatsMap.get(linkId);
        if (existing) {
          existing.count++;
          existing.total += p.grossAmount || p.amount || 0;
        } else {
          linkStatsMap.set(linkId, {
            titulo: p.commerceLink.titulo,
            slug: p.commerceLink.slug,
            amount: p.commerceLink.amount,
            count: 1,
            total: p.grossAmount || p.amount || 0,
            type: 'link',
          });
        }
      } else if (p.commercePage) {
        const pageId = p.commercePage.id;
        const existing = linkStatsMap.get(pageId);
        if (existing) {
          existing.count++;
          existing.total += p.grossAmount || p.amount || 0;
        } else {
          linkStatsMap.set(pageId, {
            titulo: p.commercePage.titulo,
            slug: p.commercePage.slug,
            amount: p.grossAmount || p.amount || 0, // Para páginas, o valor é dinâmico
            count: 1,
            total: p.grossAmount || p.amount || 0,
            type: 'page',
          });
        }
      }
    });
    const topLinks = Array.from(linkStatsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Receita por dia (últimos 30 dias para gráfico)
    const dailyRevenue: { date: string; amount: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(todayStart);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayAmount = allPayments
        .filter((p: any) => {
          const pDate = new Date(p.createdAt);
          return pDate >= dayStart && pDate < dayEnd;
        })
        .reduce((sum: number, p: any) => sum + (p.grossAmount || p.amount || 0), 0);

      dailyRevenue.push({ date: dateStr, amount: dayAmount });
    }

    // Pagamentos recentes (últimos 10)
    const recentPayments = allPayments.slice(0, 10).map((p: any) => ({
      id: p.id,
      amount: p.grossAmount || p.amount || 0,
      linkTitle: p.commerceLink?.titulo || p.commercePage?.titulo || 'Link/Página removido',
      linkSlug: p.commerceLink?.slug || p.commercePage?.slug || '',
      createdAt: p.createdAt,
    }));

    const response = {
      // Faturamento bruto (valores antes das taxas)
      grossRevenue: {
        all: grossAll || 0,
        today: grossToday || 0,
        week: grossWeek || 0,
        month: grossMonth || 0,
      },
      // Total de taxas pagas (R$ 0,99 + 0,5%)
      totalFees: {
        all: feesAll || 0,
        today: feesToday || 0,
        week: feesWeek || 0,
        month: feesMonth || 0,
      },
      // Lucro PagDepix (0,3%)
      pagdepixProfit: {
        all: profitAll || 0,
        today: profitToday || 0,
        week: profitWeek || 0,
        month: profitMonth || 0,
      },
      counts: {
        all: countAll || 0,
        today: countToday || 0,
        week: countWeek || 0,
        month: countMonth || 0,
      },
      topLinks: topLinks || [],
      dailyRevenue: dailyRevenue || [],
      recentPayments: recentPayments || [],
    };

    let partner: any = null;
    let user: { dailyLimit?: number | null } | null = null;

    try {
      [partner, user] = await Promise.all([
        prisma.commercePartner.findUnique({
          where: { userId },
          select: {
            useCustomFees: true,
            customFixedFee: true,
            customVariablePercent: true,
            dailyLimitCommerce: true,
            monthlyLimitCommerce: true,
            collateralBalance: true,
            transactionLimit: true,
            dailyPayerLimit: true,
          } as any,
        }),
        prisma.user.findUnique({
          where: { id: userId },
          select: { dailyLimit: true },
        }),
      ]);
    } catch (partnerErr: any) {
      console.warn('[getStatistics] Erro ao buscar partner/limites, usando fallback:', partnerErr?.message);
      try {
        [partner, user] = await Promise.all([
          prisma.commercePartner.findUnique({
            where: { userId },
            select: { useCustomFees: true, customFixedFee: true, customVariablePercent: true },
          }),
          prisma.user.findUnique({ where: { id: userId }, select: { dailyLimit: true } }),
        ]);
      } catch (e2: any) {
        console.error('[getStatistics] Fallback partner também falhou:', e2?.message);
        throw partnerErr;
      }
    }

    const dailyLimitTotal = partner?.dailyLimitCommerce ?? user?.dailyLimit ?? 0;
    const monthlyLimitTotal = partner?.monthlyLimitCommerce ?? null;
    const limits = {
      daily: {
        total: dailyLimitTotal,
        used: grossToday || 0,
        renewal: 'diário' as const,
      },
      monthly: {
        total: monthlyLimitTotal,
        used: grossMonth || 0,
        renewal: 'mensal' as const,
      },
      transactionLimit: partner?.transactionLimit ?? 500,
      dailyPayerLimit: partner?.dailyPayerLimit ?? 500,
      collateralBalance: partner?.collateralBalance ?? 0,
    };

    const fixedFee = partner?.useCustomFees && partner.customFixedFee != null
      ? partner.customFixedFee
      : 0.99;
    const variablePercent = partner?.useCustomFees && partner.customVariablePercent != null
      ? partner.customVariablePercent
      : 0.5;

    const feesByOperation = [
      {
        operation: 'PIX / Depix',
        fixed: fixedFee,
        percent: variablePercent,
        type: 'por transação' as const,
        description: `R$ ${fixedFee.toFixed(2)} + ${variablePercent}% do valor`,
      },
    ];

    // Adicionar taxas e limites à resposta
    const responseWithFees = {
      ...response,
      useCustomFees: partner?.useCustomFees || false,
      customFixedFee: partner?.customFixedFee ?? null,
      customVariablePercent: partner?.customVariablePercent ?? null,
      limits,
      feesByOperation,
    };

    console.log('[getStatistics] Retornando estatísticas:', {
      totalPayments: allPayments.length,
      grossRevenue: response.grossRevenue,
      totalFees: response.totalFees,
      pagdepixProfit: response.pagdepixProfit,
      counts: response.counts,
      useCustomFees: partner?.useCustomFees,
    });

    return res.json(responseWithFees);
  } catch (e: any) {
    const msg = e?.message || String(e);
    const stack = e?.stack;
    console.error('[getStatistics] ERRO:', msg);
    if (stack) console.error('[getStatistics] Stack:', stack);
    return res.status(500).json({
      error: 'Erro ao buscar estatísticas',
      details: msg,
    });
  }
};

/** Histórico de pagamentos do comerciante com filtros. */
export const getPaymentHistory = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;

    const {
      startDate,
      endDate,
      status,
      linkId,
      minAmount,
      maxAmount,
      search,
      page = '1',
      limit = '50',
    } = req.query as {
      startDate?: string;
      endDate?: string;
      status?: string;
      linkId?: string;
      minAmount?: string;
      maxAmount?: string;
      search?: string;
      page?: string;
      limit?: string;
    };

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    const skip = (pageNum - 1) * limitNum;

    // Buscar pagamentos recebidos pelo comerciante (links e páginas dele)
    const [merchantLinks, merchantPages] = await Promise.all([
      prisma.commerceLink.findMany({
        where: { userId },
        select: { id: true, titulo: true, slug: true, amount: true },
      }),
      (prisma as any).commercePage?.findMany?.({
        where: { userId },
        select: { id: true, titulo: true, slug: true },
      }) || [],
    ]);
    const linkIds = merchantLinks.map((l) => l.id);
    const pageIds = merchantPages.map((p: any) => p.id);
    const orConditions: any[] = [];
    if (linkIds.length > 0) orConditions.push({ commerceLinkId: { in: linkIds } });
    if (pageIds.length > 0) orConditions.push({ commercePageId: { in: pageIds } });

    let allUserPayments: any[] = [];
    if (orConditions.length > 0) {
      allUserPayments = await prisma.depixOrder.findMany({
        where: {
          status: 'depix_sent',
          OR: orConditions,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Incluir pagamentos de links e páginas
    let filteredPayments = allUserPayments.filter((p: any) => p.commerceLinkId || p.commercePageId);

    // Aplicar filtros
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filteredPayments = filteredPayments.filter((p: any) => new Date(p.createdAt) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredPayments = filteredPayments.filter((p: any) => new Date(p.createdAt) <= end);
    }

    if (linkId) {
      filteredPayments = filteredPayments.filter(
        (p: any) => p.commerceLinkId === linkId || p.commercePageId === linkId
      );
    }

    if (minAmount) {
      const min = parseFloat(minAmount);
      filteredPayments = filteredPayments.filter((p: any) => (p.totalToPay || 0) >= min);
    }

    if (maxAmount) {
      const max = parseFloat(maxAmount);
      filteredPayments = filteredPayments.filter((p: any) => (p.totalToPay || 0) <= max);
    }

      const linksMap = new Map(merchantLinks.map((l) => [l.id, l]));
    const pagesMap = new Map(merchantPages.map((p: any) => [p.id, p]));

    // Aplicar busca (se houver)
    if (search) {
      const searchLower = search.toLowerCase();
      filteredPayments = filteredPayments.filter((p: any) => {
        const link = p.commerceLinkId ? linksMap.get(p.commerceLinkId) : null;
        const page = p.commercePageId ? pagesMap.get(p.commercePageId) : null;
        const meta = (link || page) as { titulo?: string; slug?: string } | null;
        if (!meta) return false;
        return (
          meta.titulo?.toLowerCase().includes(searchLower) ||
          meta.slug?.toLowerCase().includes(searchLower) ||
          p.orderId?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Paginação
    const total = filteredPayments.length;
    const paginatedPayments = filteredPayments.slice(skip, skip + limitNum);

    // Montar resposta com links/páginas
    const payments = paginatedPayments.map((p: any) => {
      const link = p.commerceLinkId ? linksMap.get(p.commerceLinkId) : null;
      const page = p.commercePageId ? pagesMap.get(p.commercePageId) : null;
      const meta = (link || page) as { titulo?: string; slug?: string; amount?: number } | null;
      const amount = p.grossAmount ?? p.totalToPay ?? 0;
      return {
        id: p.id,
        orderId: p.orderId,
        amount,
        linkId: p.commerceLinkId,
        pageId: p.commercePageId,
        linkTitle: meta?.titulo || 'Link/Página removido',
        linkSlug: meta?.slug || '',
        linkAmount: (link as { amount?: number })?.amount ?? amount,
        status: p.status,
        createdAt: p.createdAt,
      };
    });

    return res.json({
      payments,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (e: any) {
    console.error('getPaymentHistory:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao buscar histórico de pagamentos' });
  }
};

// ========================================
// PÁGINAS PRÉ-PRONTAS (COMERCIO PAGES)
// ========================================

/** Lista páginas do comerciante logado. */
export const listPages = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    
    try {
      const pages = await (prisma as any).commercePage?.findMany?.({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, titulo: true, slug: true, isActive: true, createdAt: true },
      }) || [];
      return res.json({ pages });
    } catch (dbError: any) {
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.warn('listPages: Tabela CommercePage não encontrada. Aplique a migration.');
        return res.json({ pages: [] });
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('listPages:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao listar páginas', pages: [] });
  }
};

/** Cria página pré-pronta (comerciante logado). */
export const createPage = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    const { titulo } = req.body as { titulo?: string };
    
    try {
      let slug = slugAleatorio();
      let attempts = 0;
      while (attempts < 5) {
        const existing = await (prisma as any).commercePage?.findUnique?.({ where: { slug } });
        if (!existing) break;
        slug = slugAleatorio() + Date.now().toString(36);
        attempts++;
      }
      
      const page = await (prisma as any).commercePage?.create?.({
        data: {
          userId,
          titulo: (titulo && String(titulo).trim()) || 'Página de Pagamento',
          slug,
          isActive: true,
        },
      });
      return res.status(201).json({ page });
    } catch (dbError: any) {
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        console.error('createPage: Tabela CommercePage não encontrada. Aplique a migration.');
        return res.status(500).json({ error: 'Tabela de páginas não encontrada. Contate o suporte.' });
      }
      if (dbError?.code === 'P2002' && dbError?.meta?.target?.includes('slug')) {
        const newSlug = slugAleatorio() + Date.now().toString(36);
        try {
          const page = await (prisma as any).commercePage?.create?.({
            data: {
              userId,
              titulo: (titulo && String(titulo).trim()) || 'Página de Pagamento',
              slug: newSlug,
              isActive: true,
            },
          });
          return res.status(201).json({ page });
        } catch (retryError: any) {
          throw retryError;
        }
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('createPage:', e?.message, e?.stack);
    return res.status(500).json({ error: e?.message || 'Erro ao criar página' });
  }
};

/** Atualiza página (título e status). */
export const updatePage = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    const { id } = req.params;
    const { titulo, isActive } = req.body as { titulo?: string; isActive?: boolean };
    
    if (!id) return res.status(400).json({ error: 'ID da página é obrigatório' });
    
    try {
      const page = await (prisma as any).commercePage?.findFirst?.({
        where: { id, userId },
      });
      
      if (!page) {
        return res.status(404).json({ error: 'Página não encontrada' });
      }
      
      const updated = await (prisma as any).commercePage?.update?.({
        where: { id },
        data: {
          ...(titulo !== undefined && { titulo: String(titulo).trim() }),
          ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        },
      });
      
      return res.json({ page: updated });
    } catch (dbError: any) {
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        return res.status(500).json({ error: 'Tabela de páginas não encontrada. Contate o suporte.' });
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('updatePage:', e?.message, e?.stack);
    return res.status(500).json({ error: e?.message || 'Erro ao atualizar página' });
  }
};

/** Deleta página. */
export const deletePage = async (req: Request, res: Response) => {
  try {
    const userId = await requireCommerce(req, res);
    if (!userId) return;
    const { id } = req.params;
    
    if (!id) return res.status(400).json({ error: 'ID da página é obrigatório' });
    
    try {
      const page = await (prisma as any).commercePage?.findFirst?.({
        where: { id, userId },
      });
      
      if (!page) {
        return res.status(404).json({ error: 'Página não encontrada' });
      }
      
      await (prisma as any).commercePage?.delete?.({
        where: { id },
      });
      
      return res.json({ success: true });
    } catch (dbError: any) {
      if (dbError?.code === 'P2021' || /does not exist|relation.*does not exist/i.test(dbError?.message || '')) {
        return res.status(500).json({ error: 'Tabela de páginas não encontrada. Contate o suporte.' });
      }
      throw dbError;
    }
  } catch (e: any) {
    console.error('deletePage:', e?.message, e?.stack);
    return res.status(500).json({ error: e?.message || 'Erro ao deletar página' });
  }
};

/** Público: busca página por slug. */
export const getPageBySlug = async (req: Request, res: Response) => {
  try {
    const raw = req.params.slug;
    const slug = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    
    if (!slug) {
      return res.status(400).json({ error: 'Slug inválido' });
    }
    
    const page = await (prisma as any).commercePage?.findFirst?.({
      where: { slug, isActive: true },
      select: { id: true, userId: true, titulo: true },
    });
    
    if (!page) {
      return res.status(404).json({ error: 'Página não encontrada ou inativa' });
    }
    
    const user = await prisma.user.findUnique({
      where: { id: page.userId },
      select: { name: true },
    });
    
    const merchantName = user?.name || 'Comerciante';
    
    const partner = await prisma.commercePartner.findUnique({
      where: { userId: page.userId },
      select: { id: true },
    });
    
    let settings: any = null;
    if (partner) {
      settings = await (prisma as any).commerceSettings?.findUnique?.({
        where: { partnerId: partner.id },
        select: {
          logoUrl: true,
          cnpj: true,
          primaryColor: true,
          accentColor: true,
          backgroundColor: true,
          textColor: true,
          useCustomBranding: true,
          contactPhone: true,
          supportEmail: true,
          businessDescription: true,
          redirectUrl: true,
          faviconUrl: true,
        },
      });
    }
    
    const responseData = {
      id: page.id,
      titulo: page.titulo,
      slug: page.slug,
      needsPayerDocAboveValue: SWAPVERSE_PAYER_DOC_THRESHOLD,
      merchantName: settings?.businessName || merchantName,
      settings: settings ? {
        logoUrl: settings.logoUrl,
        cnpj: settings.cnpj,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        backgroundColor: settings.backgroundColor,
        textColor: settings.textColor,
        useCustomBranding: settings.useCustomBranding,
        contactPhone: settings.contactPhone,
        supportEmail: settings.supportEmail,
        businessDescription: settings.businessDescription,
        redirectUrl: settings.redirectUrl,
        faviconUrl: settings.faviconUrl,
      } : null,
    };
    
    return res.json(responseData);
  } catch (e: any) {
    console.error('[getPageBySlug] Erro geral:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao buscar página', message: e?.message });
  }
};

/** Público: gera QR Pix para pagamento da página com valor escolhido pelo cliente. */
export const generatePixForPage = async (req: Request, res: Response) => {
  try {
    const raw = req.params.slug;
    const slug = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
    
    if (!slug) {
      return res.status(400).json({ error: 'Slug inválido' });
    }

    const body = req.body as { valor?: number | string; payer_name?: string; payer_tax_number?: string };
    const amount = typeof body.valor === 'number' ? body.valor : parseFloat(String(body.valor || '0').replace(',', '.'));
    
    if (!Number.isFinite(amount) || amount < 5) {
      return res.status(400).json({ error: 'Valor mínimo para pagamento via Pix é R$ 5,00.' });
    }

    const page = await (prisma as any).commercePage?.findFirst?.({
      where: { slug, isActive: true },
      select: { id: true, userId: true, titulo: true },
    });
    
    if (!page) {
      return res.status(404).json({ error: 'Página não encontrada ou inativa' });
    }

    const partner = await prisma.commercePartner.findUnique({
      where: { userId: page.userId },
      select: { id: true },
    });
    if (!partner) return res.status(400).json({ error: 'Comerciante não configurado.' });

    const settings = await (prisma as any).commerceSettings?.findUnique?.({
      where: { partnerId: partner.id },
      select: { liquidWallet: true, redirectUrl: true },
    });
    const liquidWallet = settings?.liquidWallet?.trim();
    if (!liquidWallet || liquidWallet.length < 20) {
      return res.status(400).json({
        error: 'Este comerciante ainda não configurou a carteira para receber pagamentos. Entre em contato com o estabelecimento.',
      });
    }

    const grossAmount = Math.round(amount * 100) / 100;
    const needsPayerDoc = grossAmount >= SWAPVERSE_PAYER_DOC_THRESHOLD;

    const payerName = body.payer_name != null ? String(body.payer_name).trim() : '';
    const payerTaxNumberRaw = body.payer_tax_number != null ? String(body.payer_tax_number).replace(/\D/g, '') : '';

    if (needsPayerDoc) {
      if (!payerName || payerName.length < 2) {
        return res.status(400).json({ error: 'Para valores a partir de R$ 500,00 é obrigatório informar o nome completo do pagador (exigência do processador de pagamento).' });
      }
      if (!payerTaxNumberRaw || !validatePayerTaxNumber(payerTaxNumberRaw)) {
        return res.status(400).json({ error: 'Para valores a partir de R$ 500,00 é obrigatório informar CPF (11 dígitos) ou CNPJ (14 dígitos) válido do pagador.' });
      }
    }

    const limitsCheck = await checkMerchantLimits(page.userId, grossAmount, payerTaxNumberRaw || undefined);
    if (!limitsCheck.allowed) {
      return res.status(400).json({ error: limitsCheck.error });
    }

    const fees = await getMerchantFees(page.userId);
    const fixedFeePaid = fees.fixedFee;
    const variableFeePaid = Math.round(grossAmount * (fees.variablePercent / 100) * 100) / 100;
    const pagdepixProfit = Math.round(grossAmount * 0.003 * 100) / 100;
    const swapverseFee = Math.round(grossAmount * 0.002 * 100) / 100;
    const totalToPay = grossAmount;

    const result = await generateDepixQr({
      amount: totalToPay.toFixed(2),
      depix_wallet_address: liquidWallet,
      fee: '0.2',
      payer_name: payerName || undefined,
      payer_tax_number: payerTaxNumberRaw || undefined,
    });

    if (!result.success) {
      const errorMsg = 'error' in result ? result.error : 'Não foi possível gerar o QR Code Pix.';
      return res.status(400).json({ error: errorMsg });
    }

    if (!('order' in result)) {
      return res.status(400).json({ error: 'Não foi possível gerar o QR Code Pix.' });
    }

    const order = result.order;
    await (prisma as any).depixOrder?.create?.({
      data: {
        userId: page.userId,
        orderId: order.id,
        amount: grossAmount,
        totalToPay,
        status: order.status || 'pending',
        commercePageId: page.id,
        payerName: payerName || null,
        payerTaxNumber: payerTaxNumberRaw || null,
        grossAmount,
        fixedFeePaid,
        variableFeePaid,
        pagdepixProfit,
        swapverseFee,
      },
    });

    return res.json({
      orderId: order.id,
      qr_image_url: order.qr_image_url,
      qr_copy_paste: order.qr_copy_paste,
      totalToPay: grossAmount.toFixed(2),
      redirectUrl: settings?.redirectUrl || null,
    });
  } catch (e: any) {
    console.error('[generatePixForPage] Erro:', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao gerar QR Code Pix' });
  }
};

/** Admin: Lista todos os comerciantes com suas métricas de faturamento e lucro. */
export const getAllMerchantsMetrics = async (req: Request, res: Response) => {
  try {
    // Verificar se o usuário é admin
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado. Apenas admins podem acessar esta rota.' });
    }

    // Buscar todos os comerciantes
    const partners = await (prisma.commercePartner.findMany as any)({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
        settings: {
          select: {
            businessName: true,
            cnpj: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Para cada comerciante, calcular métricas
    const merchantsMetrics = await Promise.all(
      partners.map(async (partner: any) => {
        const payments = await prisma.depixOrder.findMany({
          where: {
            userId: partner.userId,
            status: 'depix_sent',
            OR: [
              { commerceLinkId: { not: null } },
              { commercePageId: { not: null } },
            ],
          },
        });

        const grossRevenue = payments.reduce((sum, p) => sum + (p.grossAmount || p.amount || 0), 0);
        const totalFees = payments.reduce((sum, p) => sum + ((p.fixedFeePaid || 0) + (p.variableFeePaid || 0)), 0);
        const pagdepixProfit = payments.reduce((sum, p) => sum + (p.pagdepixProfit || 0), 0);
        const totalPayments = payments.length;

        return {
          partnerId: partner.id,
          userId: partner.userId,
          userName: partner.user.name,
          userEmail: partner.user.email,
          businessName: partner.settings?.businessName || partner.user.name,
          cnpj: partner.settings?.cnpj || partner.documentNumber,
          createdAt: partner.createdAt,
          createdByAdmin: partner.createdByAdmin ?? false,
          useCustomFees: partner.useCustomFees || false,
          customFixedFee: partner.customFixedFee || null,
          customVariablePercent: partner.customVariablePercent || null,
          metrics: {
            grossRevenue: Math.round(grossRevenue * 100) / 100,
            totalFees: Math.round(totalFees * 100) / 100,
            pagdepixProfit: Math.round(pagdepixProfit * 100) / 100,
            totalPayments,
          },
        };
      })
    );

    return res.json({ merchants: merchantsMetrics });
  } catch (e: any) {
    console.error('[getAllMerchantsMetrics]', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao buscar métricas dos comerciantes' });
  }
};

/**
 * Admin: Cria conta de comerciante manualmente (trusted merchant - sem CNPJ, sem depósito inicial).
 * Funcionalidade exclusiva do painel admin para clientes de confiança sem CNPJ.
 */
export const adminCreateTrustedMerchant = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId;
    if (!adminId) return res.status(401).json({ error: 'Não autenticado' });

    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem criar contas de comerciante.' });
    }

    const {
      nomeCompleto,
      cpf,
      email,
      telefone,
      senhaInicial,
      nomeNegocio,
      liquidWallet,
    } = req.body as {
      nomeCompleto?: string;
      cpf?: string;
      email?: string;
      telefone?: string;
      senhaInicial?: string;
      nomeNegocio?: string;
      liquidWallet?: string;
    };

    if (!nomeCompleto?.trim() || !email?.trim() || !senhaInicial) {
      return res.status(400).json({ error: 'Nome completo, e-mail e senha inicial são obrigatórios.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }

    if (senhaInicial.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const cpfDigits = (cpf || '').replace(/\D/g, '');
    if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
      return res.status(400).json({ error: 'CPF deve ter 11 dígitos ou ser deixado em branco para fictício' });
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: email.trim() }, select: { id: true } });
    if (existingEmail) {
      return res.status(409).json({ error: 'E-mail já cadastrado no sistema' });
    }

    const telegramUnique = `@trusted_${randomUUID().slice(0, 8)}`;
    const passwordHash = await bcrypt.hash(senhaInicial, 10);
    const businessNameVal = (nomeNegocio || nomeCompleto).trim();

    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          name: nomeCompleto.trim(),
          email: email.trim(),
          telegram: telegramUnique,
          passwordHash,
          role: 'COMMERCE',
          isActive: true,
          isBlocked: false,
          emailVerified: true,
          telegramVerified: true,
          nameVerified: true,
          whatsapp: telefone?.trim() || null,
          dailyLimit: 500,
          totalPaid: 0,
        },
        select: { id: true, email: true, name: true },
      });

      const partner = await tx.commercePartner.create({
        data: {
          userId: user.id,
          documentType: 'CPF',
          documentNumber: cpfDigits || '00000000000',
          businessName: businessNameVal,
          businessType: 'OUTROS',
          status: 'APPROVED',
          initialDepositStatus: 'confirmed',
          createdByAdmin: true,
          transactionLimit: 500,
          dailyPayerLimit: 500,
        },
        select: { id: true },
      });

      await tx.commerceSettings.create({
        data: {
          partnerId: partner.id,
          businessName: businessNameVal,
          liquidWallet: liquidWallet?.trim() || null,
        },
      });

      return { user, partner };
    });

    try {
      await createAuditLog({
        entityType: 'ADMIN_ACTION',
        entityId: result.user.id,
        action: 'TRUSTED_MERCHANT_CREATED',
        userId: adminId,
        details: {
          adminId,
          createdAt: new Date().toISOString(),
          accountCreated: {
            userId: result.user.id,
            partnerId: result.partner.id,
            email: result.user.email,
            name: result.user.name,
          },
        },
        ip: req.ip,
        userAgent: (req.get('user-agent') || undefined)?.slice(0, 500),
      });
    } catch (auditErr: any) {
      console.error('[adminCreateTrustedMerchant] Audit log failed:', auditErr?.message);
    }

    return res.status(201).json({
      message: 'Conta de comerciante criada com sucesso.',
      userId: result.user.id,
      partnerId: result.partner.id,
      email: result.user.email,
    });
  } catch (e: any) {
    console.error('[adminCreateTrustedMerchant]', e?.message, e?.stack);
    const code = e?.code;
    if (code === 'P2002') {
      return res.status(409).json({ error: 'E-mail ou Telegram já cadastrado. Tente novamente.' });
    }
    const msg = e?.message || 'Erro desconhecido';
    return res.status(500).json({
      error: 'Erro ao criar conta de comerciante',
      message: msg,
    });
  }
};

/**
 * Admin: atualizar taxas personalizadas de um comerciante
 */
export const updateMerchantFees = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const { useCustomFees, customFixedFee, customVariablePercent } = req.body;

    if (!partnerId) {
      return res.status(400).json({ error: 'ID do comerciante é obrigatório' });
    }

    // Validações
    if (useCustomFees) {
      if (customFixedFee == null || customVariablePercent == null) {
        return res.status(400).json({ error: 'Quando usar taxas personalizadas, ambos os valores devem ser informados' });
      }

      if (customFixedFee < 0) {
        return res.status(400).json({ error: 'Taxa fixa não pode ser negativa' });
      }

      if (customVariablePercent < 0 || customVariablePercent > 100) {
        return res.status(400).json({ error: 'Taxa variável deve estar entre 0% e 100%' });
      }
    }

    // Buscar comerciante
    const partner = await (prisma as any).commercePartner?.findUnique?.({
      where: { id: partnerId },
      select: { id: true, userId: true },
    });

    if (!partner) {
      return res.status(404).json({ error: 'Comerciante não encontrado' });
    }

    // Atualizar taxas
    const updated = await (prisma as any).commercePartner?.update?.({
      where: { id: partnerId },
      data: {
        useCustomFees: useCustomFees || false,
        customFixedFee: useCustomFees ? customFixedFee : null,
        customVariablePercent: useCustomFees ? customVariablePercent : null,
      },
      select: {
        id: true,
        userId: true,
        useCustomFees: true,
        customFixedFee: true,
        customVariablePercent: true,
      },
    });

    return res.json({
      message: 'Taxas atualizadas com sucesso',
      partner: updated,
    });
  } catch (e: any) {
    console.error('[updateMerchantFees]', e?.message, e?.stack);
    return res.status(500).json({ error: 'Erro ao atualizar taxas do comerciante' });
  }
};

/**
 * Admin: Lista todos os depósitos/saques de colateral pendentes.
 */
export const adminListPendingCollaterals = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: userId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const deposits = await (prisma as any).collateralDeposit.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        partner: {
          select: { id: true, documentNumber: true, businessName: true, userId: true, user: { select: { name: true, email: true } } },
        },
      },
    });

    return res.json({ deposits });
  } catch (e: any) {
    console.error('[adminListPendingCollaterals]', e?.message);
    return res.status(500).json({ error: 'Erro ao listar colaterais pendentes.' });
  }
};

/**
 * Admin: Aprova ou rejeita um depósito de colateral (DePix manual).
 */
export const adminProcessCollateral = async (req: Request, res: Response) => {
  try {
    const adminUserId = (req as any).userId;
    const admin = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso negado' });

    const { depositId } = req.params;
    const { action, note } = req.body as { action: 'approve' | 'reject'; note?: string };

    const deposit = await (prisma as any).collateralDeposit.findUnique({
      where: { id: depositId },
      include: { partner: true },
    });
    if (!deposit) return res.status(404).json({ error: 'Depósito não encontrado.' });
    if (deposit.status !== 'PENDING') return res.status(400).json({ error: 'Depósito já processado.' });

    if (action === 'approve') {
      if (deposit.type === 'DEPOSIT') {
        const BASE_LIMIT = 500;
        const newCollateral = deposit.partner.collateralBalance + deposit.amount;
        const newLimit = BASE_LIMIT + newCollateral;

        await prisma.$transaction([
          (prisma as any).collateralDeposit.update({
            where: { id: depositId },
            data: { status: 'CONFIRMED', processedBy: adminUserId, processedAt: new Date(), note: note || null },
          }),
          prisma.commercePartner.update({
            where: { id: deposit.partnerId },
            data: { collateralBalance: newCollateral, transactionLimit: newLimit, dailyPayerLimit: newLimit },
          }),
        ]);

        return res.json({ message: `Depósito aprovado. Novo limite: R$ ${newLimit.toFixed(2)}` });
      } else {
        await (prisma as any).collateralDeposit.update({
          where: { id: depositId },
          data: { status: 'PROCESSED', processedBy: adminUserId, processedAt: new Date(), note: note || null },
        });
        return res.json({ message: 'Saque processado com sucesso.' });
      }
    } else {
      if (deposit.type === 'WITHDRAWAL') {
        const BASE_LIMIT = 500;
        const newCollateral = deposit.partner.collateralBalance + deposit.amount;
        const newLimit = BASE_LIMIT + newCollateral;

        await prisma.$transaction([
          (prisma as any).collateralDeposit.update({
            where: { id: depositId },
            data: { status: 'REJECTED', processedBy: adminUserId, processedAt: new Date(), note: note || null },
          }),
          prisma.commercePartner.update({
            where: { id: deposit.partnerId },
            data: { collateralBalance: newCollateral, transactionLimit: newLimit, dailyPayerLimit: newLimit },
          }),
        ]);
        return res.json({ message: 'Saque rejeitado. Colateral restaurado.' });
      } else {
        await (prisma as any).collateralDeposit.update({
          where: { id: depositId },
          data: { status: 'REJECTED', processedBy: adminUserId, processedAt: new Date(), note: note || null },
        });
        return res.json({ message: 'Depósito rejeitado.' });
      }
    }
  } catch (e: any) {
    console.error('[adminProcessCollateral]', e?.message);
    return res.status(500).json({ error: 'Erro ao processar colateral.' });
  }
};
