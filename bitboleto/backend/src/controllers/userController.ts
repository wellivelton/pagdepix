import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { prisma } from '../prisma';
// Limites máximos removidos — sem restrição de valor máximo ou limite diário
import { getIpInfo } from '../utils/ipInfo';
import { checkAccountCreationLimits, logAccountCreation } from '../utils/antifraud';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { sendPasswordResetEmail, sendVerificationCodeEmail } from '../services/email.service';
import { 
  generateTelegramVerifyCode, 
  getTelegramVerifyExpiry, 
  sendVerificationCodeToUser,
  validateVerificationCode 
} from '../services/telegram.service';
import { sendVerificationCode as sendRegisterEmailCodeService, verifyEmailCode as verifyRegisterEmailCodeService, isEmailRecentlyVerified } from '../services/emailVerification.service';
import { validateFullName } from '../utils/validation/nameValidation';
import { validateEmail, isBlockedDomain } from '../utils/validation/emailValidation';
import { validateWhatsAppBrazil } from '../utils/validation/phoneValidation';
import { getKycStatus } from '../utils/kyc';
import { env } from '../config/env';

/**
 * Verificação de email e Telegram: quando "false", o sistema não exige nem envia verificação.
 * Cadastro e login funcionam normalmente; email/telegram ficam apenas como dados do perfil.
 * Desativado: novos usuários acessam sem verificar Telegram.
 * Para reativar: defina ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION=true no .env
 */
const ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION = process.env.ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION === 'true';

/** Gera token seguro de uso único (32 bytes em hex). */
function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Gera código numérico de 6 dígitos para verificação de email (digitado pelo usuário na página). */
function generateEmailVerifyCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/** Expiração em 30 minutos. */
const TOKEN_EXPIRY_MINUTES = 30;
function getTokenExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + TOKEN_EXPIRY_MINUTES);
  return d;
}

// ========================================
// TIPOS
// ========================================
interface RegisterBody {
  name: string;
  email: string;
  telegram?: string;
  whatsapp?: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface ResetPasswordBody {
  email: string;
}

// ========================================
// VALIDAÇÃO DE NOME (cadastro - público)
// ========================================
export const validateRegisterName = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const result = validateFullName(name);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }
    return res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Erro ao validar nome:', error);
    return res.status(500).json({ valid: false, error: 'Erro interno.' });
  }
};

// ========================================
// VALIDAÇÃO DE EMAIL (cadastro - público)
// ========================================
export const validateRegisterEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = validateEmail(email);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }
    const normalizedEmail = (email as string).trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return res.status(400).json({ valid: false, error: 'Este e-mail já está cadastrado' });
    }
    return res.status(200).json({ valid: true });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[validateRegisterEmail] Erro:', err?.message || err, err?.stack);
    return res.status(500).json({ valid: false, error: 'Erro interno.' });
  }
};

// ========================================
// ENVIAR CÓDIGO DE VERIFICAÇÃO (cadastro - público)
// ========================================
export const sendRegisterEmailCode = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await sendRegisterEmailCodeService(email);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(200).json({ success: true, message: 'Código enviado para seu e-mail. Verifique a caixa de entrada e o spam.' });
  } catch (error) {
    console.error('Erro ao enviar código de verificação:', error);
    return res.status(500).json({ success: false, error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// VERIFICAR CÓDIGO DE EMAIL (cadastro - público)
// ========================================
export const verifyRegisterEmailCode = async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'E-mail é obrigatório' });
    }
    const result = await verifyRegisterEmailCodeService(email, code);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }
    return res.status(200).json({ success: true, message: 'E-mail verificado com sucesso.' });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    return res.status(500).json({ success: false, error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// VALIDAÇÃO DE TELEFONE WHATSAPP (cadastro - público)
// ========================================
export const validateRegisterPhone = async (req: Request, res: Response) => {
  try {
    const { whatsapp } = req.body;
    const result = validateWhatsAppBrazil(whatsapp);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }
    return res.status(200).json({ valid: true, normalized: result.normalized });
  } catch (error) {
    console.error('Erro ao validar telefone:', error);
    return res.status(500).json({ valid: false, error: 'Erro interno.' });
  }
};

// ========================================
// CADASTRO DE USUÁRIO
// ========================================
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, telegram, whatsapp, password, referralCode: referralCodeFromBody }: RegisterBody & { referralCode?: string } = req.body;

    // Modo manutenção: bloquear novos cadastros
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

    // Validações básicas
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Nome, e-mail e senha são obrigatórios' 
      });
    }

    if (!whatsapp || typeof whatsapp !== 'string' || !whatsapp.trim()) {
      return res.status(400).json({ 
        error: 'WhatsApp é obrigatório' 
      });
    }

    // Validar nome
    const nameValidation = validateFullName(name);
    if (!nameValidation.valid) {
      return res.status(400).json({ error: nameValidation.error });
    }

    // Validar email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ error: emailValidation.error });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // E-mail deve ter sido verificado recentemente (código no cadastro)
    const emailVerified = await isEmailRecentlyVerified(normalizedEmail);
    if (!emailVerified) {
      return res.status(400).json({ 
        error: 'Verifique seu e-mail antes de finalizar o cadastro. Envie e confirme o código de verificação.' 
      });
    }

    // Validar WhatsApp
    const phoneValidation = validateWhatsAppBrazil(whatsapp);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }
    const whatsappNormalized = phoneValidation.normalized || whatsapp.replace(/\D/g, '');

    // Validar senha (mínimo 6 caracteres)
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Senha deve ter no mínimo 6 caracteres' 
      });
    }

    // Telegram: se não informado, usar placeholder único (NUNCA usar WhatsApp - são independentes)
    const telegramFormatted = telegram && telegram.trim()
      ? (telegram.startsWith('@') ? telegram : `@${telegram}`)
      : `@pendente_${Buffer.from(normalizedEmail).toString('base64url').slice(0, 20)}_${crypto.randomBytes(4).toString('hex')}`;

    // Verificar se email já existe
    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });
    if (existingEmail) {
      return res.status(409).json({ error: 'E-mail já cadastrado' });
    }

    // Verificar se telegram já existe (quando informado explicitamente)
    if (telegram && telegram.trim()) {
      const existingTelegram = await prisma.user.findUnique({
        where: { telegram: telegramFormatted }
      });
      if (existingTelegram) {
        return res.status(409).json({ error: 'Telegram já cadastrado' });
      }
    }

    // Verificar limites de criação de conta (ANTIFRAUDE)
    const userIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(req);
    
    const limitCheck = await checkAccountCreationLimits(userIp, deviceFingerprint);
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: limitCheck.reason || 'Limite de criação de contas excedido'
      });
    }

    // Validar código de indicação (se fornecido)
    let referredByCode: string | null = null;
    if (referralCodeFromBody?.trim()) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralCodeFromBody.trim().toUpperCase() },
        select: { id: true }
      });
      if (referrer) {
        referredByCode = referralCodeFromBody.trim().toUpperCase();
      }
    }

    // Gerar código de indicação único para o novo usuário
    const generateReferralCode = (): string => {
      return crypto.randomBytes(4).toString('hex').toUpperCase();
    };
    let newReferralCode = generateReferralCode();
    // Garantir unicidade (loop simples, raramente necessário)
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.user.findUnique({ where: { referralCode: newReferralCode } });
      if (!existing) break;
      newReferralCode = generateReferralCode();
      attempts++;
    }

    // Hash da senha
    const passwordHash = await bcrypt.hash(password, 10);

    const verificationEnabled = ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION;

    // Criar usuário (email já verificado no fluxo de cadastro)
    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        telegram: telegramFormatted,
        whatsapp: whatsappNormalized,
        passwordHash,
        role: 'USER',
        isActive: true,
        isBlocked: false,
        dailyLimit: 999999999,
        totalPaid: 0,
        deviceFingerprint: deviceFingerprint,
        emailVerified: true, // Verificado no cadastro
        emailVerifyToken: null,
        emailVerifyExpires: null,
        nameVerified: true,  // Nome validado no cadastro
        telegramVerified: !verificationEnabled,
        referralCode: newReferralCode,
        referredByCode: referredByCode ?? undefined
      },
      select: {
        id: true,
        name: true,
        email: true,
        telegram: true,
        whatsapp: true,
        role: true,
        emailVerified: true,
        telegramVerified: true,
        createdAt: true
      }
    });

    // Não enviamos mais email de verificação (email sempre verificado)
    // Se quiser reativar no futuro, descomente:
    // if (verificationEnabled && emailVerifyCode) {
    //   sendVerificationCodeEmail(user.email, emailVerifyCode).catch((err) => {
    //     console.error('[Register] Erro ao enviar email de verificação:', err);
    //   });
    // }

    // Registrar criação de conta (ANTIFRAUDE)
    await logAccountCreation(user.id, userIp, deviceFingerprint);

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'user_registered',
        details: JSON.stringify({ 
          userId: user.id, 
          email,
          deviceFingerprint 
        }),
        ip: userIp,
        userAgent: req.get('user-agent') || 'unknown',
        userId: user.id
      }
    });

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '8h' }
    );

    return res.status(201).json({
      message: 'Usuário criado com sucesso',
      user,
      token
    });

  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao criar usuário' 
    });
  }
};

// ========================================
// LOGIN
// ========================================
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginBody = req.body;

    // Validações
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios' 
      });
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      // Registrar tentativa falha de login (brute force protection)
      if ((req as any).registerLoginAttempt) {
        await (req as any).registerLoginAttempt(false, email);
      }
      
      return res.status(401).json({ 
        error: 'Email ou senha inválidos' 
      });
    }

    // Verificar se está bloqueado
    if (user.isBlocked) {
      return res.status(403).json({ 
        error: 'Usuário bloqueado. Entre em contato com o suporte.' 
      });
    }

    // Verificar se está ativo
    if (!user.isActive) {
      return res.status(403).json({ 
        error: 'Usuário inativo. Entre em contato com o suporte.' 
      });
    }

    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      if ((req as any).registerLoginAttempt) {
        await (req as any).registerLoginAttempt(false, email);
      }
      return res.status(401).json({ 
        error: 'Email ou senha inválidos' 
      });
    }

    // Modo manutenção: apenas admin pode fazer login
    if (user.role !== 'ADMIN') {
      const maintenanceConfig = await prisma.config.findUnique({
        where: { id: 'config' },
        select: { maintenanceMode: true, maintenanceMessage: true }
      });
      if (maintenanceConfig?.maintenanceMode) {
        return res.status(503).json({
          error: 'maintenance',
          message: maintenanceConfig.maintenanceMessage?.trim() || 'Sistema em manutenção. Tente novamente em breve.'
        });
      }
    }

    const currentIp = req.ip || 'unknown';

    // Verificar IP bloqueado
    const blockedIp = await prisma.blockedIp.findFirst({
      where: {
        ip: currentIp,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      }
    });

    if (blockedIp) {
      return res.status(403).json({ 
        error: 'IP bloqueado. Motivo: ' + blockedIp.reason 
      });
    }

    // Buscar localização e possível VPN
    const ipInfo = await getIpInfo(currentIp);

    if (ipInfo.isVpn) {
      // Opcional: registrar IP em BlockedIp
      await prisma.blockedIp.upsert({
        where: { ip: currentIp },
        create: {
          ip: currentIp,
          reason: 'Acesso via VPN detectado',
        },
        update: {
          reason: 'Acesso via VPN detectado',
          expiresAt: null,
        }
      });

      return res.status(403).json({
        error: 'Acesso bloqueado: VPN detectada. Desative a VPN e tente novamente.'
      });
    }

    // Atualizar último login + informações de IP/localização
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: currentIp,
        lastLoginCity: ipInfo.city,
        lastLoginCountry: ipInfo.country,
        lastLoginIsVpn: ipInfo.isVpn,
      }
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'user_login',
        details: JSON.stringify({ email }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: user.id
      }
    });

    // Gerar token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '8h' }
    );

    // Registrar tentativa bem-sucedida de login (brute force protection)
    if ((req as any).registerLoginAttempt) {
      await (req as any).registerLoginAttempt(true, email);
    }

    const emailVerified = (user as any).emailVerified ?? false;
    const telegramVerified = ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? user.telegramVerified : true;

    const commercePartnerRecord = await (prisma as any).commercePartner?.findUnique?.({
      where: { userId: user.id },
      select: { status: true, createdByAdmin: true }
    });
    const roleStr = String(user.role);
    const isApprovedOrTrusted = commercePartnerRecord?.status === 'APPROVED' || commercePartnerRecord?.createdByAdmin === true;
    const commercePartner = roleStr === 'COMMERCE' || roleStr === 'ADMIN' || isApprovedOrTrusted;

    return res.status(200).json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        telegram: user.telegram,
        role: user.role,
        emailVerified,
        telegramVerified,
        totalPaid: user.totalPaid,
        commercePartner
      },
      token
    });

  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao fazer login' 
    });
  }
};

// ========================================
// PERFIL DO USUÁRIO
// ========================================
export const getProfile = async (req: Request, res: Response) => {
  try {
    // @ts-ignore - userId vem do middleware de autenticação
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        telegram: true,
        role: true,
        isActive: true,
        isBlocked: true,
        emailVerified: true,
        telegramVerified: true,
        nameVerified: true,
        whatsapp: true,
        emailChangeCount: true,
        emailChangePending: true,
        dailyLimit: true,
        totalPaid: true,
        lastLoginAt: true,
        createdAt: true,
        depixLiquidWallet: true,
        depixWalletNickname: true,
        referralCode: true,
        referredByCode: true,
        _count: {
          select: {
            boletos: true
          }
        }
      } as any
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado' 
      });
    }

    // Uso do limite diário hoje por operação (boletos + recargas PENDING/PAID criados hoje)
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const [boletosHoje, rechargesHoje] = await Promise.all([
      prisma.boleto.aggregate({
        where: {
          userId,
          createdAt: { gte: hoje },
          status: { in: ['PENDING', 'PAID'] }
        },
        _sum: { totalAmount: true }
      }),
      prisma.mobileRecharge.aggregate({
        where: {
          userId,
          createdAt: { gte: hoje },
          status: { in: ['PENDING', 'PAID'] }
        },
        _sum: { totalAmount: true }
      }),
    ]);
    const usedTodayBoletos = boletosHoje._sum.totalAmount ?? 0;
    const usedTodayRecargas = rechargesHoje._sum.totalAmount ?? 0;
    const usedToday = usedTodayBoletos + usedTodayRecargas;

    const [totalBoletos, totalRecargas, totalPixCC, totalSendPix] = await Promise.all([
      prisma.boleto.aggregate({
        where: { userId, status: 'PAID' },
        _sum: { amount: true }
      }),
      prisma.mobileRecharge.aggregate({
        where: { userId, status: 'PAID' },
        _sum: { amount: true }
      }),
      (prisma as any).pixCopiaCola.aggregate({
        where: { userId, status: 'APPROVED' },
        _sum: { valorOriginal: true }
      }),
      (prisma as any).sendPixOrder.aggregate({
        where: { userId, status: 'COMPLETED' },
        _sum: { amountBrl: true }
      }),
    ]);
    const totalByOperation = {
      boletos: totalBoletos._sum.amount ?? 0,
      recargas: totalRecargas._sum.amount ?? 0,
      pix: Number(totalPixCC._sum.valorOriginal ?? 0) + (totalSendPix._sum.amountBrl ?? 0),
    };

    // KYC: quando verificação desativada, tratar como nível 2 (acesso total)
    const nameVerified = (user as any).nameVerified ?? false;
    const emailVerified = (user as any).emailVerified ?? false;
    const telegramVerified: boolean = ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? Boolean(user.telegramVerified) : true;
    const effectiveName: boolean = ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? nameVerified : true;
    const effectiveEmail: boolean = ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? emailVerified : true;
    const userEmail = String((user as any).email ?? '');
    const userWhatsapp = (user as any).whatsapp ?? null;
    const kycStatus = getKycStatus(effectiveName, effectiveEmail, telegramVerified, userWhatsapp);
    const emailChangeCount = (user as any).emailChangeCount ?? 0;
    const canChangeEmail = emailChangeCount < 1 && (!emailVerified || isBlockedDomain(userEmail));

    // Quando verificação está desativada, retornar sempre como verificado para o frontend não exigir /confirmar-conta
    const response = {
      ...user,
      usedToday,
      usedTodayBoletos,
      usedTodayRecargas,
      totalByOperation,
      nameVerified,
      emailVerified: ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? emailVerified : true,
      telegramVerified,
      kycStatus,
      canChangeEmail: ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION ? canChangeEmail : false,
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao buscar perfil' 
    });
  }
};

// ========================================
// VERIFICAR STATUS DA CONEXÃO COM O BOT
// ========================================
/** 
 * Verifica se o usuário já iniciou conversa com o bot (tem chat_id registrado).
 * Retorna status da conexão.
 */
export const checkBotConnection = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        telegram: true,
        telegramChatId: true,
        telegramVerified: true,
        role: true,
        telegramVerifyToken: true,
        telegramVerifyExpires: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Admin não precisa verificar
    if (user.role === 'ADMIN') {
      return res.json({
        connected: true,
        verified: true,
        isAdmin: true,
      });
    }

    const hasConnection = !!user.telegramChatId && user.telegramChatId.trim() !== '';
    const now = new Date();
    const hasPendingCode = !!(
      user.telegramVerifyToken &&
      user.telegramVerifyExpires &&
      user.telegramVerifyExpires > now
    );

    return res.json({
      connected: hasConnection,
      verified: user.telegramVerified,
      telegram: user.telegram,
      hasPendingCode,
      codeExpiresAt: hasPendingCode && user.telegramVerifyExpires
        ? user.telegramVerifyExpires.toISOString()
        : null,
    });
  } catch (error) {
    console.error('Erro ao verificar conexão com bot:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// SOLICITAR VERIFICAÇÃO VIA TELEGRAM (BOT ENVIA CÓDIGO)
// ========================================
/** 
 * Gera código de 6 dígitos e ENVIA para o Telegram do usuário via bot.
 * O código expira em 5 minutos.
 * IMPORTANTE: Usuário precisa ter iniciado conversa com o bot primeiro (/start).
 */
export const requestTelegramVerification = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Verificação de email e Telegram está desativada no momento.' });
    }

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        telegram: true,
        telegramChatId: true,
        telegramVerified: true, 
        role: true 
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.telegramVerified) {
      return res.status(400).json({ error: 'Telegram já verificado' });
    }

    // Admin não precisa verificar Telegram (dono do sistema)
    if (user.role === 'ADMIN') {
      return res.status(200).json({
        message: 'Admin não precisa verificar Telegram',
        adminSkipVerification: true,
      });
    }

    // CRÍTICO: Verificar se usuário já iniciou conversa com o bot
    if (!user.telegramChatId || user.telegramChatId.trim() === '') {
      return res.status(400).json({
        error: 'Você precisa iniciar conversa com o bot primeiro. Abra @PagDepixBot no Telegram e clique em "Iniciar".',
        errorCode: 'NOT_CONNECTED',
        requiresStart: true,
      });
    }

    // Gerar código
    const code = generateTelegramVerifyCode();
    const expiresAt = getTelegramVerifyExpiry();

    // ENVIAR código via bot para o Telegram do usuário
    const sendResult = await sendVerificationCodeToUser(user.telegram, code);

    if (!sendResult.success) {
      return res.status(400).json({ 
        error: sendResult.error,
        errorCode: sendResult.errorCode,
        canChangeTelegram: sendResult.errorCode === 'NOT_FOUND', // Permite alterar se não encontrou
      });
    }

    // Salvar código no banco (só se o envio foi bem-sucedido)
    await prisma.user.update({
      where: { id: userId },
      data: {
        telegramVerifyToken: code,
        telegramVerifyExpires: expiresAt,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Código enviado para seu Telegram. Verifique suas mensagens.',
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: 5,
    });
  } catch (error) {
    console.error('Erro ao solicitar verificação Telegram:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// VALIDAR CÓDIGO DE VERIFICAÇÃO DO TELEGRAM
// ========================================
/** 
 * Valida código de 6 dígitos inserido pelo usuário.
 * Se válido, marca telegramVerified = true.
 */
export const verifyTelegramCode = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Verificação de email e Telegram está desativada no momento.' });
    }

    const userId = (req as any).userId;
    const { code } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Código é obrigatório' });
    }

    const result = await validateVerificationCode(userId, code);

    if (!result.success) {
      return res.status(400).json({ 
        error: result.error,
        errorCode: result.errorCode 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Telegram verificado com sucesso! Você agora tem acesso completo ao sistema.',
    });
  } catch (error) {
    console.error('Erro ao verificar código Telegram:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// ALTERAR TELEGRAM (RESET DE VERIFICAÇÃO)
// ========================================
/** 
 * Permite usuário alterar seu Telegram.
 * IMPORTANTE: Ao alterar, o usuário volta para estado NÃO VERIFICADO.
 * Ele precisará verificar o novo Telegram antes de acessar o sistema novamente.
 */
export const updateTelegram = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { telegram } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    if (!telegram || typeof telegram !== 'string' || !telegram.trim()) {
      return res.status(400).json({ error: 'Telegram é obrigatório' });
    }

    // Normalizar Telegram (adicionar @ se não tiver)
    let normalizedTelegram = telegram.trim();
    if (!normalizedTelegram.startsWith('@')) {
      normalizedTelegram = `@${normalizedTelegram}`;
    }

    // Verificar se o Telegram já está em uso por outro usuário
    const existing = await prisma.user.findFirst({
      where: {
        telegram: normalizedTelegram,
        NOT: { id: userId },
      },
      select: { id: true },
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'Este Telegram já está cadastrado em outra conta.' 
      });
    }

    // Atualizar Telegram e RESETAR verificação
    await prisma.user.update({
      where: { id: userId },
      data: {
        telegram: normalizedTelegram,
        telegramVerified: false, // ⚠️ VOLTA PARA NÃO VERIFICADO
        telegramVerifyToken: null,
        telegramVerifyExpires: null,
        telegramChatId: null, // Limpa chat_id anterior
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Telegram atualizado. Você precisa verificar o novo Telegram antes de continuar.',
      telegram: normalizedTelegram,
      requiresVerification: true,
    });
  } catch (error) {
    console.error('Erro ao atualizar Telegram:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
};

// ========================================
// SOLICITAR RESET DE SENHA
// ========================================
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email }: ResetPasswordBody = req.body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ 
        error: 'Email é obrigatório' 
      });
    }

    const emailNorm = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email: emailNorm }
    });

    // Sempre retornar mensagem genérica (não revelar se email existe)
    const genericMessage = 'Se o email existir, você receberá instruções para redefinir sua senha';

    if (user) {
      const passwordResetToken = generateSecureToken();
      const passwordResetExpires = getTokenExpiry();

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken,
          passwordResetExpires
        }
      });

      sendPasswordResetEmail(user.email, passwordResetToken).catch((err) => {
        console.error('[ForgotPassword] Erro ao enviar email:', err);
      });

      await prisma.log.create({
        data: {
          action: 'password_reset_requested',
          details: JSON.stringify({ userId: user.id }),
          ip: req.ip || 'unknown',
          userAgent: req.get('user-agent') || 'unknown',
          userId: user.id
        }
      });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    console.error('Erro ao solicitar reset de senha:', error);
    return res.status(500).json({ 
      error: 'Erro interno. Tente novamente mais tarde.' 
    });
  }
};

// ========================================
// VERIFICAR EMAIL POR CÓDIGO (POST body: { code }) – usuário logado
// ========================================
export const verifyEmailCode = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Verificação de email está desativada no momento.' });
    }

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Informe o código de 6 dígitos enviado ao seu email.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, emailVerified: true, emailVerifyToken: true, emailVerifyExpires: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email já verificado.' });
    }

    if (!user.emailVerifyToken || !user.emailVerifyExpires || user.emailVerifyExpires < new Date()) {
      return res.status(400).json({ error: 'Código expirado. Solicite um novo código.' });
    }

    if (user.emailVerifyToken !== code) {
      return res.status(400).json({ error: 'Código incorreto. Verifique o email e tente novamente.' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpires: null
      }
    });

    await prisma.log.create({
      data: {
        action: 'email_verified',
        details: JSON.stringify({ userId }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId
      }
    });

    return res.status(200).json({
      message: 'Email confirmado com sucesso.',
      verified: true
    });
  } catch (error) {
    console.error('Erro ao verificar email por código:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

// ========================================
// REENVIAR CÓDIGO DE VERIFICAÇÃO DE EMAIL (POST) – usuário logado
// ========================================
export const resendEmailCode = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Verificação de email está desativada no momento.' });
    }

    const userId = (req as any).userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email já verificado.' });
    }

    const emailVerifyCode = generateEmailVerifyCode();
    const emailVerifyExpires = getTokenExpiry();

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyToken: emailVerifyCode,
        emailVerifyExpires
      }
    });

    sendVerificationCodeEmail(user.email, emailVerifyCode).catch((err) => {
      console.error('[ResendEmailCode] Erro ao enviar email:', err);
    });

    return res.status(200).json({
      message: 'Novo código enviado para seu email. Verifique a caixa de entrada e o spam.'
    });
  } catch (error) {
    console.error('Erro ao reenviar código de email:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

// ========================================
// TROCA DE EMAIL (usuários antigos – UMA vez)
// ========================================
export const requestEmailChange = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Troca de e-mail não disponível no momento.' });
    }

    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autorizado.' });

    const { newEmail } = req.body;
    if (!newEmail || typeof newEmail !== 'string' || !newEmail.trim()) {
      return res.status(400).json({ error: 'Novo e-mail é obrigatório.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true, emailChangeCount: true }
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (user.emailChangeCount >= 1) {
      return res.status(400).json({ error: 'Você já utilizou sua única troca de e-mail. Entre em contato com o suporte se precisar alterar.' });
    }

    // Permitir troca: e-mail não verificado OU domínio bloqueado
    const currentBlocked = isBlockedDomain(user.email);
    if (user.emailVerified && !currentBlocked) {
      return res.status(400).json({ error: 'Seu e-mail já está verificado. A troca é permitida apenas para e-mails temporários ou descartáveis.' });
    }

    const validation = validateEmail(newEmail.trim());
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const normalizedNew = newEmail.trim().toLowerCase();
    if (normalizedNew === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Informe um e-mail diferente do atual.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedNew } });
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
    }

    const code = generateEmailVerifyCode();
    const expiresAt = getTokenExpiry();

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailChangePending: normalizedNew,
        emailChangeCode: code,
        emailChangeExpires: expiresAt,
      }
    });

    sendVerificationCodeEmail(normalizedNew, code, 30).catch((err) => {
      console.error('[RequestEmailChange] Erro ao enviar email:', err);
    });

    return res.status(200).json({
      message: 'Código enviado para o novo e-mail. Verifique a caixa de entrada e o spam.',
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Erro ao solicitar troca de email:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

export const confirmEmailChange = async (req: Request, res: Response) => {
  try {
    if (!ENABLE_EMAIL_AND_TELEGRAM_VERIFICATION) {
      return res.status(400).json({ error: 'Troca de e-mail não disponível no momento.' });
    }

    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autorizado.' });

    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Informe o código de 6 dígitos enviado ao novo e-mail.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailChangePending: true, emailChangeCode: true, emailChangeExpires: true }
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (!user.emailChangePending || !user.emailChangeCode || !user.emailChangeExpires) {
      return res.status(400).json({ error: 'Nenhuma troca de e-mail pendente. Solicite uma nova troca.' });
    }
    if (user.emailChangeExpires < new Date()) {
      await prisma.user.update({
        where: { id: userId },
        data: { emailChangePending: null, emailChangeCode: null, emailChangeExpires: null }
      });
      return res.status(400).json({ error: 'Código expirado. Solicite uma nova troca de e-mail.' });
    }
    if (user.emailChangeCode !== code) {
      return res.status(400).json({ error: 'Código incorreto. Verifique o e-mail e tente novamente.' });
    }

    const newEmail = user.emailChangePending;

    await prisma.user.update({
      where: { id: userId },
      data: {
        email: newEmail,
        emailVerified: true,
        emailChangeCount: { increment: 1 },
        emailChangePending: null,
        emailChangeCode: null,
        emailChangeExpires: null,
      }
    });

    await prisma.log.create({
      data: {
        action: 'email_changed',
        details: JSON.stringify({ userId, newEmail }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId
      }
    });

    return res.status(200).json({
      message: 'E-mail alterado com sucesso. Você está verificado.',
      verified: true,
    });
  } catch (error) {
    console.error('Erro ao confirmar troca de email:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

// ========================================
// VALIDAR NOME ATUAL (usuários antigos – sem reentrada manual)
// ========================================
export const validateNameLegacy = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    if (!userId) return res.status(401).json({ error: 'Não autorizado.' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, nameVerified: true }
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    if (user.nameVerified) {
      return res.status(200).json({ valid: true, message: 'Nome já verificado.' });
    }

    const result = validateFullName(user.name);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.error });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { nameVerified: true }
    });

    return res.status(200).json({
      valid: true,
      message: 'Nome validado com sucesso.',
    });
  } catch (error) {
    console.error('Erro ao validar nome:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

// ========================================
// VALIDAR TOKEN DE RESET (GET ?token=...)
// ========================================
export const validateResetToken = async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string)?.trim();
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token inválido ou expirado.' });
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ valid: false, error: 'Token inválido ou expirado.' });
    }

    return res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Erro ao validar token de reset:', error);
    return res.status(500).json({ valid: false, error: 'Erro interno.' });
  }
};

// ========================================
// REDEFINIR SENHA (POST body: token, newPassword)
// ========================================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    const tokenStr = typeof token === 'string' ? token.trim() : '';

    if (!tokenStr) {
      return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: tokenStr,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    await prisma.log.create({
      data: {
        action: 'password_reset_completed',
        details: JSON.stringify({ userId: user.id }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: user.id
      }
    });

    return res.status(200).json({
      message: 'Senha alterada com sucesso. Faça login com a nova senha.'
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).json({ error: 'Erro interno. Tente novamente mais tarde.' });
  }
};

// ========================================
// ATUALIZAR PERFIL
// ========================================
export const updateProfile = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { name, telegram } = req.body;

    const updateData: any = {};

    if (name) updateData.name = name;
    if (telegram) {
      const telegramFormatted = telegram.startsWith('@') ? telegram : `@${telegram}`;
      
      // Verificar se telegram já existe (exceto para o próprio usuário)
      const existingTelegram = await prisma.user.findFirst({
        where: {
          telegram: telegramFormatted,
          id: { not: userId }
        }
      });

      if (existingTelegram) {
        return res.status(409).json({ 
          error: 'Telegram já cadastrado' 
        });
      }

      updateData.telegram = telegramFormatted;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        telegram: true,
        role: true,
        updatedAt: true
      }
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'profile_updated',
        details: JSON.stringify(updateData),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId: user.id
      }
    });

    return res.status(200).json({
      message: 'Perfil atualizado com sucesso',
      user
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao atualizar perfil' 
    });
  }
};

// ========================================
// SALVAR / LIMPAR CARTEIRA LIQUID
// ========================================
export const saveDepixWallet = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { liquidWallet, nickname } = req.body as { liquidWallet?: string | null; nickname?: string | null };

    const wallet = liquidWallet != null ? String(liquidWallet).trim() : null;
    const nick = nickname != null ? String(nickname).trim().slice(0, 80) || null : null;

    await prisma.user.update({
      where: { id: userId },
      data: {
        depixLiquidWallet: wallet || null,
        depixWalletNickname: wallet ? nick : null,
      } as any,
    });

    return res.status(200).json({
      message: wallet ? 'Endereço da carteira salvo.' : 'Endereço da carteira removido.',
      depixLiquidWallet: wallet || null,
      depixWalletNickname: nick,
    });
  } catch (error) {
    console.error('Erro ao salvar carteira Depix:', error);
    return res.status(500).json({ error: 'Erro ao salvar carteira.' });
  }
};

// ========================================
// ALTERAR SENHA
// ========================================
export const changePassword = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Senha atual e nova senha são obrigatórias' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'A nova senha deve ter no mínimo 6 caracteres' 
      });
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ 
        error: 'Usuário não encontrado' 
      });
    }

    // Verificar senha atual
    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({ 
        error: 'Senha atual incorreta' 
      });
    }

    // Hash da nova senha
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Atualizar senha
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash }
    });

    // Registrar log
    await prisma.log.create({
      data: {
        action: 'password_changed',
        details: JSON.stringify({ userId }),
        ip: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        userId
      }
    });

    return res.status(200).json({
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({
      error: 'Erro interno ao alterar senha'
    });
  }
};

/**
 * GET /user/referral
 * Retorna o código de indicação do usuário, link, e estatísticas de ganhos.
 */
export const getReferralInfo = async (req: Request, res: Response) => {
  try {
    // @ts-ignore
    const userId = req.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, referredByCode: true }
    });

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Garantir que o usuário tenha um referralCode (retrocompatibilidade)
    let referralCode = user.referralCode;
    if (!referralCode) {
      const newCode = (await import('crypto')).randomBytes(4).toString('hex').toUpperCase();
      await prisma.user.update({ where: { id: userId }, data: { referralCode: newCode } });
      referralCode = newCode;
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'https://pagdepix.com').replace(/\/$/, '');

    // Estatísticas
    const [earnings, referredCount, affiliate] = await Promise.all([
      prisma.referralEarning.aggregate({
        where: { earnerId: userId },
        _sum: { commission: true },
        _count: { id: true }
      }),
      prisma.user.count({ where: { referredByCode: referralCode } }),
      prisma.affiliate.findUnique({
        where: { userId },
        select: { totalEarned: true, balance: true, pendingBalance: true }
      })
    ]);

    // totalEarned = ganhos históricos do sistema de afiliado + ganhos do novo sistema de indicação
    const legacyEarned = affiliate?.totalEarned ?? 0;
    const newEarned = earnings._sum.commission ?? 0;
    const totalEarned = legacyEarned + newEarned;

    // Saldo disponível para saque (sistema legado)
    const legacyBalance = affiliate?.balance ?? 0;
    const legacyPendingBalance = affiliate?.pendingBalance ?? 0;

    return res.json({
      referralCode,
      referralLink: `${frontendUrl}/login?ref=${referralCode}`,
      referredByCode: user.referredByCode,
      referredCount,
      totalEarned,
      legacyEarned,
      newEarned,
      legacyBalance,
      legacyPendingBalance,
      totalTransactions: earnings._count.id
    });
  } catch (error) {
    console.error('Erro ao buscar info de indicação:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
};