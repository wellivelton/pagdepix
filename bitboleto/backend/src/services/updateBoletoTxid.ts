import { prisma } from '../prisma';
import { notifyAdmin } from './telegram.service';

// ========================================
// TIPOS
// ========================================
interface UpdateTxidInput {
  boletoId: string;
  userId: string;
  txid: string;
  ip?: string;
  userAgent?: string;
}

interface UpdateTxidResult {
  success: boolean;
  boleto?: any;
  error?: string;
}

// ========================================
// VALIDAR TXID (formato básico)
// ========================================
const isValidTxid = (txid: string): boolean => {
  // TXID Bitcoin/Liquid tem 64 caracteres hexadecimais
  const txidRegex = /^[a-fA-F0-9]{64}$/;
  return txidRegex.test(txid);
};

// ========================================
// VERIFICAR ANTI-REPLAY
// ========================================
const checkAntiReplay = async (txid: string): Promise<boolean> => {
  const [existingBoleto, existingRecharge] = await Promise.all([
    prisma.boleto.findFirst({ where: { txid } }),
    prisma.mobileRecharge.findFirst({ where: { txid } }),
  ]);
  return existingBoleto !== null || existingRecharge !== null;
};

// ========================================
// ATUALIZAR TXID DO BOLETO
// ========================================
export const updateBoletoTxid = async (input: UpdateTxidInput): Promise<UpdateTxidResult> => {
  try {
    const { boletoId, userId, txid, ip, userAgent } = input;

    // ========================================
    // 1. VALIDAÇÕES BÁSICAS
    // ========================================
    
    if (!txid || txid.trim().length === 0) {
      return { success: false, error: 'TXID é obrigatório' };
    }

    const txidCleaned = txid.trim();

    // Validar formato do TXID
    if (!isValidTxid(txidCleaned)) {
      return { 
        success: false, 
        error: 'TXID inválido. Deve ter 64 caracteres hexadecimais.' 
      };
    }

    // ========================================
    // 2. ANTI-REPLAY: Verificar se TXID já foi usado
    // ========================================
    const txidJaUsado = await checkAntiReplay(txidCleaned);
    
    if (txidJaUsado) {
      return { 
        success: false, 
        error: 'Este TXID já foi utilizado em outro boleto' 
      };
    }

    // ========================================
    // 3. BUSCAR BOLETO
    // ========================================
    const boleto = await prisma.boleto.findFirst({
      where: {
        id: boletoId,
        userId // Garantir que o boleto pertence ao usuário
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegram: true,
            isBlocked: true,
            isActive: true
          }
        }
      }
    });

    if (!boleto) {
      return { 
        success: false, 
        error: 'Boleto não encontrado ou você não tem permissão' 
      };
    }

    // ========================================
    // 4. VALIDAR ESTADO DO BOLETO
    // ========================================
    
    if (boleto.status === 'PAID') {
      return { 
        success: false, 
        error: 'Este boleto já foi marcado como pago' 
      };
    }

    if (boleto.status === 'CANCELLED') {
      return { 
        success: false, 
        error: 'Este boleto está cancelado' 
      };
    }

    if (boleto.txid) {
      return { 
        success: false, 
        error: 'Este boleto já possui um TXID registrado' 
      };
    }

    // Rate lock: rejeitar se cotação expirou (USDT/BTC)
    if ((boleto as any).rateLockExpiresAt && new Date() > new Date((boleto as any).rateLockExpiresAt)) {
      await prisma.boleto.update({
        where: { id: boletoId },
        data: { rateExpired: true } as any,
      });
      return {
        success: false,
        error: 'Cotação expirada. Crie um novo pagamento com cotação atualizada.'
      };
    }

    // ========================================
    // 5. VALIDAR USUÁRIO
    // ========================================
    
    if (boleto.user.isBlocked) {
      return { 
        success: false, 
        error: 'Usuário bloqueado. Entre em contato com o suporte.' 
      };
    }

    if (!boleto.user.isActive) {
      return { 
        success: false, 
        error: 'Usuário inativo. Entre em contato com o suporte.' 
      };
    }

    // ========================================
    // 6. ATUALIZAR BOLETO
    // ========================================
    
    const boletoAtualizado = await prisma.boleto.update({
      where: { id: boletoId },
      data: {
        txid: txidCleaned,
        paidAt: new Date(), // Registrar quando o usuário clicou "Já paguei"
        // Status continua PENDING até admin confirmar
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            telegram: true
          }
        },
        coupon: true,
        affiliate: {
          select: {
            id: true,
            couponCode: true
          }
        }
      }
    });

    // ========================================
    // 7. REGISTRAR LOG
    // ========================================
    
    await prisma.log.create({
      data: {
        action: 'boleto_txid_submitted',
        details: JSON.stringify({
          boletoId: boleto.id,
          txid: txidCleaned,
          amount: boleto.amount,
          totalAmount: boleto.totalAmount,
          status: 'awaiting_confirmation'
        }),
        ip: ip || 'unknown',
        userAgent: userAgent || 'unknown',
        userId: boleto.userId
      }
    });

    // ========================================
    // 8. NOTIFICAR ADMIN (Telegram) - Pedido confirmado com TXID
    // ========================================
    const userLabel = boleto.user.email || boleto.user.name || 'Cliente';
    const curr = (boletoAtualizado as any).paymentCurrency || 'DEPIX';
    const cryptoLine = (boletoAtualizado as any).cryptoAmount && curr !== 'DEPIX'
      ? `\nCrypto: ${curr === 'USDT' ? (boletoAtualizado as any).cryptoAmount + ' USDT' : Number((boletoAtualizado as any).cryptoAmount).toLocaleString('pt-BR') + ' sats'}`
      : '';
    const barcodeLine = boleto.barcode ? `\nCódigo de Barras:\n${boleto.barcode}` : (boleto.pdfUrl ? '\nBoleto: PDF enviado' : '');
    notifyAdmin(
      `📄 Novo boleto no PagDepix (TXID registrado)\n` +
      `Valor: R$ ${(boleto.totalAmount ?? boleto.amount ?? 0).toFixed(2).replace('.', ',')}\n` +
      `Moeda: ${curr}${cryptoLine}\n` +
      `Usuário: ${userLabel}${barcodeLine}\n` +
      `ID: ${boleto.id}\n` +
      `TXID: ${txidCleaned}`
    ).catch(() => {});

    console.log(`[NOVO PAGAMENTO] Boleto ${boletoId} | Usuário: ${boleto.user.name} | Valor: R$ ${boleto.totalAmount} | TXID: ${txidCleaned}`);

    // ========================================
    // 9. RETORNAR SUCESSO
    // ========================================
    
    return {
      success: true,
      boleto: {
        id: boletoAtualizado.id,
        amount: boletoAtualizado.amount,
        fee: boletoAtualizado.fee,
        totalAmount: boletoAtualizado.totalAmount,
        status: boletoAtualizado.status,
        txid: boletoAtualizado.txid,
        paidAt: boletoAtualizado.paidAt,
        walletAddress: boletoAtualizado.walletAddress,
        qrCode: boletoAtualizado.qrCode,
        user: boletoAtualizado.user,
        message: 'TXID registrado! Aguarde a confirmação do pagamento.'
      }
    };

  } catch (error) {
    console.error('Erro ao atualizar TXID:', error);
    return { 
      success: false, 
      error: 'Erro interno ao registrar TXID' 
    };
  }
};

// ========================================
// VERIFICAR STATUS DO BOLETO
// ========================================
export const checkBoletoStatus = async (boletoId: string, userId?: string) => {
  try {
    const where: any = { id: boletoId };
    
    if (userId) {
      where.userId = userId;
    }

    const boleto = await prisma.boleto.findFirst({
      where,
      select: {
        id: true,
        status: true,
        txid: true,
        paidAt: true,
        confirmedAt: true,
        receiptUrl: true,
        problemReason: true,
        amount: true,
        totalAmount: true
      }
    });

    if (!boleto) {
      return { success: false, error: 'Boleto não encontrado' };
    }

    return {
      success: true,
      status: {
        current: boleto.status,
        txid: boleto.txid,
        paidAt: boleto.paidAt,
        confirmedAt: boleto.confirmedAt,
        receiptUrl: boleto.receiptUrl,
        problemReason: boleto.problemReason,
        statusMessage: getStatusMessage(boleto.status)
      }
    };

  } catch (error) {
    console.error('Erro ao verificar status:', error);
    return { success: false, error: 'Erro ao verificar status' };
  }
};

// ========================================
// HELPER: Mensagem de status
// ========================================
const getStatusMessage = (status: string): string => {
  const messages: Record<string, string> = {
    PENDING: 'Aguardando pagamento',
    PAID: 'Pagamento confirmado! Boleto será processado em breve.',
    PROBLEM: 'Problema identificado. Entre em contato com o suporte.',
    CANCELLED: 'Boleto cancelado'
  };

  return messages[status] || 'Status desconhecido';
};

// ========================================
// CANCELAR BOLETO (antes de pagar)
// ========================================
export const cancelBoleto = async (boletoId: string, userId: string) => {
  try {
    const boleto = await prisma.boleto.findFirst({
      where: {
        id: boletoId,
        userId
      }
    });

    if (!boleto) {
      return { success: false, error: 'Boleto não encontrado' };
    }

    if (boleto.status !== 'PENDING') {
      return { 
        success: false, 
        error: 'Apenas boletos pendentes podem ser cancelados' 
      };
    }

    if (boleto.txid) {
      return { 
        success: false, 
        error: 'Não é possível cancelar boleto com TXID já registrado' 
      };
    }

    await prisma.boleto.update({
      where: { id: boletoId },
      data: { status: 'CANCELLED' }
    });

    // Log
    await prisma.log.create({
      data: {
        action: 'boleto_cancelled',
        details: JSON.stringify({ boletoId }),
        ip: 'system',
        userAgent: 'backend',
        userId
      }
    });

    return {
      success: true,
      message: 'Boleto cancelado com sucesso'
    };

  } catch (error) {
    console.error('Erro ao cancelar boleto:', error);
    return { success: false, error: 'Erro ao cancelar boleto' };
  }
};

// ========================================
// ATUALIZAR BOLETO (editar informações)
// ========================================
interface UpdateBoletoInput {
  boletoId: string;
  userId: string;
  barcode?: string;
  dueDate?: Date;
  txid?: string;
  ip?: string;
  userAgent?: string;
}

interface UpdateBoletoResult {
  success: boolean;
  boleto?: any;
  error?: string;
}

export const updateBoleto = async (input: UpdateBoletoInput): Promise<UpdateBoletoResult> => {
  try {
    const { boletoId, userId, barcode, dueDate, txid, ip, userAgent } = input;

    // ========================================
    // 1. BUSCAR BOLETO
    // ========================================
    const boleto = await prisma.boleto.findFirst({
      where: {
        id: boletoId,
        userId // Garantir que o boleto pertence ao usuário
      }
    });

    if (!boleto) {
      return { 
        success: false, 
        error: 'Boleto não encontrado ou você não tem permissão' 
      };
    }

    // ========================================
    // 2. VALIDAR ESTADO DO BOLETO
    // ========================================
    if (boleto.status !== 'PENDING') {
      return { 
        success: false, 
        error: 'Apenas boletos pendentes podem ser editados' 
      };
    }

    // ========================================
    // 3. VALIDAR TXID (se fornecido)
    // ========================================
    if (txid !== undefined && txid !== null && txid.trim().length > 0) {
      const txidCleaned = txid.trim();

      // Validar formato do TXID
      if (!isValidTxid(txidCleaned)) {
        return { 
          success: false, 
          error: 'TXID inválido. Deve ter 64 caracteres hexadecimais.' 
        };
      }

      // Anti-replay: verificar se TXID já foi usado em outro boleto
      const existingBoleto = await prisma.boleto.findFirst({
        where: {
          txid: txidCleaned,
          id: { not: boletoId } // Ignorar o próprio boleto
        }
      });

      if (existingBoleto) {
        return { 
          success: false, 
          error: 'Este TXID já foi utilizado em outro boleto' 
        };
      }
    }

    // ========================================
    // 4. VALIDAR DATA DE VENCIMENTO (se fornecida)
    // ========================================
    if (dueDate) {
      const dataVencimento = new Date(dueDate);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      if (dataVencimento < hoje) {
        return { success: false, error: 'Data de vencimento não pode ser no passado' };
      }
    }

    // ========================================
    // 5. PREPARAR DADOS PARA ATUALIZAÇÃO
    // ========================================
    const updateData: any = {};

    if (barcode !== undefined) {
      updateData.barcode = barcode.trim().length > 0 ? barcode.trim() : null;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = new Date(dueDate);
    }

    if (txid !== undefined) {
      if (txid && txid.trim().length > 0) {
        updateData.txid = txid.trim();
        updateData.paidAt = new Date(); // Marcar como pago quando TXID é adicionado
      } else {
        // Se TXID vazio, remover TXID e paidAt
        updateData.txid = null;
        updateData.paidAt = null;
      }
    }

    // ========================================
    // 6. ATUALIZAR BOLETO
    // ========================================
    const boletoAtualizado = await prisma.boleto.update({
      where: { id: boletoId },
      data: updateData,
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
    });

    // ========================================
    // 7. REGISTRAR LOG
    // ========================================
    await prisma.log.create({
      data: {
        action: 'boleto_updated',
        details: JSON.stringify({
          boletoId: boleto.id,
          changes: {
            barcode: barcode !== undefined,
            dueDate: dueDate !== undefined,
            txid: txid !== undefined
          }
        }),
        ip: ip || 'unknown',
        userAgent: userAgent || 'unknown',
        userId: boleto.userId
      }
    });

    // ========================================
    // 8. RETORNAR SUCESSO
    // ========================================
    return {
      success: true,
      boleto: {
        id: boletoAtualizado.id,
        amount: boletoAtualizado.amount,
        fee: boletoAtualizado.fee,
        totalAmount: boletoAtualizado.totalAmount,
        status: boletoAtualizado.status,
        txid: boletoAtualizado.txid,
        barcode: boletoAtualizado.barcode,
        dueDate: boletoAtualizado.dueDate,
        paidAt: boletoAtualizado.paidAt,
        createdAt: boletoAtualizado.createdAt,
        user: boletoAtualizado.user
      }
    };

  } catch (error) {
    console.error('Erro ao atualizar boleto:', error);
    return { 
      success: false, 
      error: 'Erro interno ao atualizar boleto' 
    };
  }
};