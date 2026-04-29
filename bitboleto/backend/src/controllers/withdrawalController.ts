import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createWithdrawal as createGeradepixWithdrawal } from '../services/geradepixService';

const prisma = new PrismaClient();

// ========================================
// SOLICITAR SAQUE
// ========================================
export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { amount, liquidWallet } = req.body as {
      amount: number;
      liquidWallet: string;
    };

    // Buscar usuário e afiliado
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.role !== 'AFFILIATE' || !user.affiliate) {
      return res.status(403).json({ error: 'Apenas afiliados podem solicitar saque' });
    }

    // Verificar se usuário está verificado (admin não precisa). Quando verificação está desativada, pula o check.
    const verificationEnabled = process.env.ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION === 'true';
    if (verificationEnabled && (user.role as string) !== 'ADMIN' && (!user.emailVerified || !user.telegramVerified)) {
      return res.status(403).json({ 
        error: 'Você precisa verificar seu email e Telegram antes de solicitar saque' 
      });
    }

    const affiliate = user.affiliate;

    // Validar valor mínimo: 20 DEPIX
    const MIN_WITHDRAWAL_DEPIX = 20;
    if (amount < MIN_WITHDRAWAL_DEPIX) {
      return res.status(400).json({ 
        error: `Valor mínimo para saque é ${MIN_WITHDRAWAL_DEPIX} DEPIX` 
      });
    }

    // Verificar saldo disponível
    if (amount > affiliate.balance) {
      return res.status(400).json({ 
        error: 'Saldo insuficiente para saque' 
      });
    }

    // Verificar se já existe saque pendente
    const pendingWithdrawal = await prisma.withdrawal.findFirst({
      where: {
        affiliateId: affiliate.id,
        status: 'PENDING'
      }
    });

    if (pendingWithdrawal) {
      return res.status(400).json({ 
        error: 'Você já possui um saque pendente. Aguarde a aprovação.' 
      });
    }

    // Verificar se carteira foi alterada nas últimas 24h
    if (affiliate.lastWalletChange) {
      const hoursSinceChange = 
        (Date.now() - affiliate.lastWalletChange.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceChange < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceChange);
        return res.status(400).json({ 
          error: `Carteira alterada recentemente. Aguarde ${hoursRemaining} hora(s) antes de solicitar saque.` 
        });
      }
    }

    // Se a carteira mudou, atualizar lastWalletChange
    if (affiliate.liquidWallet !== liquidWallet) {
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: {
          liquidWallet: liquidWallet,
          lastWalletChange: new Date()
        }
      });
    }

    // Criar solicitação de saque
    const withdrawal = await prisma.withdrawal.create({
      data: {
        affiliateId: affiliate.id,
        userId: user.id,
        amount,
        liquidWallet,
        status: 'PENDING'
      }
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'withdrawal_requested',
        details: JSON.stringify({
          withdrawalId: withdrawal.id,
          amount,
          liquidWallet
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId
      }
    });

    return res.status(201).json({
      message: 'Solicitação de saque criada com sucesso',
      withdrawal
    });

  } catch (error) {
    console.error('Erro ao solicitar saque:', error);
    return res.status(500).json({ error: 'Erro interno ao solicitar saque' });
  }
};

// ========================================
// LISTAR SAQUES DO AFILIADO
// ========================================
export const listWithdrawals = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        affiliate: true
      }
    });

    if (!user || !user.affiliate) {
      return res.status(404).json({ error: 'Afiliado não encontrado' });
    }

    const withdrawals = await prisma.withdrawal.findMany({
      where: {
        affiliateId: user.affiliate.id
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ withdrawals });

  } catch (error) {
    console.error('Erro ao listar saques:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// ADMIN: LISTAR TODOS OS SAQUES
// ========================================
export const listAllWithdrawals = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const adminId = req.userId;

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { status } = req.query;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const withdrawals = await prisma.withdrawal.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegram: true
          }
        },
        affiliate: {
          select: {
            id: true,
            couponCode: true,
            balance: true,
            pendingBalance: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ withdrawals });

  } catch (error) {
    console.error('Erro ao listar saques:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// ADMIN: APROVAR/REJEITAR SAQUE
// ========================================
export const processWithdrawal = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId as string;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) return res.status(400).json({ error: 'ID do saque inválido' });
    const { action, adminNotes } = req.body as {
      action: 'approve' | 'reject';
      adminNotes?: string;
    };

    const admin = await prisma.user.findUnique({
      where: { id: adminId }
    });

    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id }
    });

    if (!withdrawal) {
      return res.status(404).json({ error: 'Saque não encontrado' });
    }

    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({ error: 'Saque já processado' });
    }

    if (action === 'approve') {
      // Verificar se ainda tem saldo suficiente
      const affiliate = await prisma.affiliate.findUnique({ where: { id: withdrawal.affiliateId } });
      if (!affiliate || withdrawal.amount > affiliate.balance) {
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }

      // Atualizar saque para APPROVED
      await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'APPROVED',
          adminNotes,
          processedAt: new Date()
        }
      });

      // Debitar do saldo do afiliado
      await prisma.affiliate.update({
        where: { id: withdrawal.affiliateId },
        data: {
          balance: { decrement: withdrawal.amount }
        }
      });

      // Registrar log
      await prisma.log.create({
        data: {
          action: 'withdrawal_approved',
          details: JSON.stringify({
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount,
            liquidWallet: withdrawal.liquidWallet
          }),
          ip: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
          userId: adminId
        }
      });

      return res.status(200).json({
        message: 'Saque aprovado com sucesso',
        withdrawal: await prisma.withdrawal.findUnique({ where: { id } })
      });

    } else if (action === 'reject') {
      // Atualizar saque para REJECTED
      await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'REJECTED',
          adminNotes,
          processedAt: new Date()
        }
      });

      // Registrar log
      await prisma.log.create({
        data: {
          action: 'withdrawal_rejected',
          details: JSON.stringify({
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount,
            reason: adminNotes
          }),
          ip: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
          userId: adminId
        }
      });

      return res.status(200).json({
        message: 'Saque rejeitado',
        withdrawal: await prisma.withdrawal.findUnique({ where: { id } })
      });
    }

    return res.status(400).json({ error: 'Ação inválida' });

  } catch (error) {
    console.error('Erro ao processar saque:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

// ========================================
// ADMIN: CRIAR SAQUE PIX VIA GERADEPIX (Depix → Pix)
// ========================================
export const createGeradepixForWithdrawal = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).userId as string;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { pixKey, pixKeyType } = req.body as { pixKey: string; pixKeyType?: string };

    if (!id) return res.status(400).json({ error: 'ID do saque inválido' });
    if (!pixKey || typeof pixKey !== 'string' || !pixKey.trim()) {
      return res.status(400).json({ error: 'Chave PIX (pixKey) é obrigatória' });
    }

    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    if (!admin || admin.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: { geradepix: true },
    });

    if (!withdrawal) return res.status(404).json({ error: 'Saque não encontrado' });
    if (withdrawal.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Só é possível usar GeraDePix para saques já aprovados' });
    }
    if (withdrawal.geradepix) {
      return res.status(400).json({
        error: 'Este saque já possui uma ordem GeraDePix. Verifique o endereço de depósito.',
        geradepix: {
          depositAddress: withdrawal.geradepix.depositAddress,
          depositAmount: withdrawal.geradepix.depositAmount,
          expiration: withdrawal.geradepix.expiration,
          status: withdrawal.geradepix.status,
        },
      });
    }

    // Depix ≈ 1 BRL (peg típico na Liquid)
    const amountBrl = Math.round(withdrawal.amount * 100) / 100;

    const result = await createGeradepixWithdrawal({
      amount: amountBrl,
      pixKey: pixKey.trim(),
      pixKeyType: pixKeyType as 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | undefined,
      reference: withdrawal.id,
      description: `Saque afiliado #${withdrawal.id}`,
    });

    if (!result.success || !result.withdrawal) {
      return res.status(400).json({
        error: result.error || 'Erro ao criar saque na API GeraDePix',
      });
    }

    const w = result.withdrawal;

    await prisma.geradepixWithdrawal.create({
      data: {
        withdrawalId: withdrawal.id,
        geradepixWithdrawalId: w.withdrawal_id,
        amountBrl,
        pixKey: pixKey.trim(),
        pixKeyType: pixKeyType || null,
        depositAddress: w.deposit_address,
        depositAmount: w.deposit_amount,
        expiration: new Date(w.expiration),
        status: 'PENDING',
      },
    });

    await prisma.log.create({
      data: {
        action: 'geradepix_withdrawal_created',
        details: JSON.stringify({
          withdrawalId: withdrawal.id,
          geradepixWithdrawalId: w.withdrawal_id,
          amountBrl,
        }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: adminId,
      },
    });

    return res.status(201).json({
      message: 'Ordem GeraDePix criada. Envie o Depix para o endereço indicado.',
      geradepix: {
        withdrawalId: w.withdrawal_id,
        depositAddress: w.deposit_address,
        depositAmount: w.deposit_amount,
        expiration: w.expiration,
        amountBrl,
      },
    });
  } catch (error) {
    console.error('Erro ao criar GeraDePix para saque:', error);
    return res.status(500).json({
      error: (error as Error).message?.includes('GERADEPIX_API_KEY')
        ? 'GeraDePix não configurada. Adicione GERADEPIX_API_KEY no .env'
        : 'Erro ao criar ordem GeraDePix',
    });
  }
};
