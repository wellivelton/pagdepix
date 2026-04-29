/**
 * Página KYC (Know Your Customer) - Verificação progressiva
 * - Nome, E-mail, Telegram, WhatsApp (informativo)
 * - Telegram: fluxo via bot (usuário inicia /start, recebe código, valida)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Edit3,
  ShieldAlert,
  Clock,
  User,
  Mail,
  Phone,
} from 'lucide-react';
import api from '../services/api';

const BOT_LINK = 'https://t.me/PagDepixBot';

interface KycStatus {
  level: number;
  nameVerified: boolean;
  emailVerified: boolean;
  telegramVerified: boolean;
  whatsappInformed: boolean;
}

interface ProfileData {
  name: string;
  email: string;
  telegram: string;
  whatsapp?: string | null;
  telegramVerified: boolean;
  emailVerified?: boolean;
  nameVerified?: boolean;
  canChangeEmail?: boolean;
  role: string;
  kycStatus?: KycStatus;
}

interface BotConnectionStatus {
  connected: boolean;
  verified: boolean;
  telegram: string;
  isAdmin?: boolean;
  /** Código já foi enviado (ex.: ao clicar em Iniciar no bot) e ainda está válido */
  hasPendingCode?: boolean;
  /** ISO string da expiração do código ativo */
  codeExpiresAt?: string | null;
}

export default function VerifyTelegram() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  
  // Estado da conexão com o bot
  const [botConnection, setBotConnection] = useState<BotConnectionStatus | null>(null);
  const [checkingConnection, setCheckingConnection] = useState(false);
  
  // Estados do fluxo de verificação
  const [requesting, setRequesting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  
  // Estados de validação
  const [codeInput, setCodeInput] = useState('');
  const [validating, setValidating] = useState(false);
  
  // Estados de alteração de Telegram
  const [editingTelegram, setEditingTelegram] = useState(false);
  const [newTelegram, setNewTelegram] = useState('');
  const [updatingTelegram, setUpdatingTelegram] = useState(false);
  
  // Estados de mensagens
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Estados verificação e-mail (usuários antigos)
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailResending, setEmailResending] = useState(false);

  // Estados troca de e-mail (uma vez)
  const [newEmailForChange, setNewEmailForChange] = useState('');
  const [emailChangeRequested, setEmailChangeRequested] = useState(false);
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [requestingEmailChange, setRequestingEmailChange] = useState(false);
  const [confirmingEmailChange, setConfirmingEmailChange] = useState(false);

  // Validação de nome (usuários antigos)
  const [validatingName, setValidatingName] = useState(false);

  // Carregar perfil
  useEffect(() => {
    loadProfile();
  }, []);

  // Verificar conexão com bot periodicamente (enquanto não conectado)
  useEffect(() => {
    if (!profile || profile.telegramVerified || profile.role === 'ADMIN') return;
    if (botConnection?.connected) return; // Já conectado

    // Verificar imediatamente
    checkBotConnection();

    // Verificar a cada 5 segundos
    const interval = setInterval(() => {
      checkBotConnection();
    }, 5000);

    return () => clearInterval(interval);
  }, [profile, botConnection?.connected]);

  const loadProfile = async () => {
    try {
      const { data } = await api.get<ProfileData>('/user/profile');
      setProfile(data);
      setNewTelegram(data.telegram || '');
      
      // Verificar conexão com bot
      if (!data.telegramVerified && data.role !== 'ADMIN') {
        checkBotConnection();
      }
    } catch (err) {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  // Auto-validar nome ao carregar (usuários antigos - sem reentrada)
  useEffect(() => {
    if (!profile || profile.nameVerified || profile.role === 'ADMIN') return;
    let cancelled = false;
    setValidatingName(true);
    api.post('/user/validate-name-legacy')
      .then(({ data }) => {
        if (!cancelled && data.valid) loadProfile();
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setValidatingName(false); });
    return () => { cancelled = true; };
  }, [profile?.name, profile?.nameVerified]);

  const checkBotConnection = async () => {
    try {
      setCheckingConnection(true);
      const { data } = await api.get<BotConnectionStatus>('/auth/check-bot-connection');
      setBotConnection(data);
    } catch (err) {
      console.error('Erro ao verificar conexão:', err);
    } finally {
      setCheckingConnection(false);
    }
  };

  // Contagem regressiva (usa codeExpiresAt do backend ou expiresAt local)
  const activeExpiresAt = botConnection?.codeExpiresAt || expiresAt;
  useEffect(() => {
    if (!activeExpiresAt) {
      setSecondsLeft(null);
      return;
    }
    const update = () => {
      const end = new Date(activeExpiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) setCodeSent(false);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeExpiresAt]);

  const handleRequestCode = async () => {
    setError('');
    setSuccess('');
    setRequesting(true);

    try {
      const { data } = await api.post('/auth/request-telegram-verification');
      
      if (data.adminSkipVerification) {
        setSuccess('Você é administrador. Verificação não é necessária.');
        return;
      }

      setCodeSent(true);
      setExpiresAt(data.expiresAt);
      setSuccess('Código enviado no Telegram. Digite abaixo.');
      checkBotConnection(); // atualiza hasPendingCode/codeExpiresAt
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao solicitar código. Tente novamente.';
      setError(errorMsg);
      
      // Se erro for "não conectado", atualizar status
      if (err.response?.data?.errorCode === 'NOT_CONNECTED') {
        setBotConnection((prev: BotConnectionStatus | null) => prev ? { ...prev, connected: false } : null);
      }
    } finally {
      setRequesting(false);
    }
  };

  const handleValidateCode = async () => {
    if (!codeInput.trim() || codeInput.trim().length !== 6) {
      setError('Digite um código de 6 dígitos válido.');
      return;
    }

    setError('');
    setSuccess('');
    setValidating(true);

    try {
      const { data } = await api.post('/auth/verify-telegram-code', {
        code: codeInput.trim(),
      });

      setSuccess(data.message || '✅ Telegram verificado com sucesso!');
      
      // Recarregar perfil
      setTimeout(() => {
        loadProfile().then(() => {
          navigate('/dashboard');
        });
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Código inválido. Tente novamente.';
      setError(errorMsg);
    } finally {
      setValidating(false);
    }
  };

  const handleUpdateTelegram = async () => {
    if (!newTelegram.trim()) {
      setError('Digite um Telegram válido.');
      return;
    }

    setError('');
    setSuccess('');
    setUpdatingTelegram(true);

    try {
      const { data } = await api.put('/auth/update-telegram', {
        telegram: newTelegram.trim(),
      });

      setSuccess(data.message || 'Telegram atualizado! Agora você precisa verificar o novo Telegram.');
      setEditingTelegram(false);
      setCodeSent(false);
      setCodeInput('');
      setBotConnection(null); // Reset conexão
      
      // Recarregar perfil
      setTimeout(() => {
        loadProfile();
      }, 1000);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao atualizar Telegram. Tente novamente.';
      setError(errorMsg);
    } finally {
      setUpdatingTelegram(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = emailCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos.');
      return;
    }
    setEmailVerifying(true);
    try {
      await api.post('/auth/verify-email-code', { code });
      setSuccess('E-mail verificado com sucesso!');
      setEmailCode('');
      await loadProfile();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido.');
    } finally {
      setEmailVerifying(false);
    }
  };

  const handleResendEmailCode = async () => {
    setError('');
    setSuccess('');
    setEmailResending(true);
    try {
      await api.post('/auth/resend-email-code');
      setSuccess('Novo código enviado. Verifique seu e-mail e a pasta de spam.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao reenviar.');
    } finally {
      setEmailResending(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newEmailForChange.trim()) return;
    setRequestingEmailChange(true);
    try {
      await api.post('/user/request-email-change', { newEmail: newEmailForChange.trim() });
      setSuccess('Código enviado para o novo e-mail. Digite abaixo.');
      setEmailChangeRequested(true);
      setEmailChangeCode('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao solicitar troca.');
    } finally {
      setRequestingEmailChange(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = emailChangeCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos.');
      return;
    }
    setConfirmingEmailChange(true);
    try {
      await api.post('/user/confirm-email-change', { code });
      setSuccess('E-mail alterado com sucesso! Você está verificado.');
      setEmailChangeRequested(false);
      setNewEmailForChange('');
      setEmailChangeCode('');
      await loadProfile();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código incorreto.');
    } finally {
      setConfirmingEmailChange(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
      </div>
    );
  }

  // Admin não precisa verificar
  if (profile?.role === 'ADMIN') {
    return (
      <div className="max-w-xl mx-auto">
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 text-bitcoin mx-auto mb-4" />
            <p className="text-white font-medium mb-2 text-xl">Administrador</p>
            <p className="text-gray-400 text-sm mb-6">
              Você é o administrador do sistema. Verificação de Telegram não é necessária para você.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30 transition-all"
            >
              Ir para Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar sempre a página KYC com níveis (Nome, E-mail, Telegram, WhatsApp)
  const kyc = profile?.kycStatus;
  const kycLevel = kyc?.level ?? 0;
  const nameOk = kyc?.nameVerified ?? profile?.nameVerified ?? false;
  const emailOk = kyc?.emailVerified ?? profile?.emailVerified ?? false;
  const telegramOk = kyc?.telegramVerified ?? profile?.telegramVerified ?? false;
  const whatsappOk = kyc?.whatsappInformed ?? Boolean(profile?.whatsapp);

  const levelLabels: Record<number, string> = {
    0: 'Nível 0 – E-mail pendente',
    1: 'Nível 1 – E-mail verificado',
    2: 'Nível 2 – Completo (Telegram verificado)',
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-gradient-to-br from-bitcoin to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-bitcoin/20">
            <MessageCircle className="w-7 h-7 text-black" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">KYC – Verificação de identidade</h1>
              <span
                className={`inline-flex px-3 py-1 rounded-lg text-xs font-medium ${
                  kycLevel >= 2
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : kycLevel >= 1
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-gray-600/50 text-gray-400 border border-gray-600'
                }`}
              >
                {levelLabels[kycLevel] ?? `Nível ${kycLevel}`}
              </span>
            </div>
            <p className="text-gray-400 text-sm mt-1">
              Status das verificações para liberar funcionalidades
            </p>
          </div>
        </div>

        {/* Resumo KYC: Nome, E-mail, Telegram, WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className={`p-4 rounded-xl border ${nameOk ? 'bg-green-500/5 border-green-500/30' : 'bg-gray-900/50 border-gray-600'}`}>
            <div className="flex items-center gap-3">
              <User className={`w-5 h-5 ${nameOk ? 'text-green-400' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Nome completo</p>
                <p className="text-xs text-gray-400 truncate">{profile?.name}</p>
              </div>
              {nameOk ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {nameOk ? 'Verificado' : validatingName ? 'Validando...' : 'Pendente de validação'}
            </p>
          </div>

          <div className={`p-4 rounded-xl border ${emailOk ? 'bg-green-500/5 border-green-500/30' : 'bg-amber-500/5 border-amber-500/30'}`}>
            <div className="flex items-center gap-3">
              <Mail className={`w-5 h-5 ${emailOk ? 'text-green-400' : 'text-amber-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">E-mail</p>
                <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
              </div>
              {emailOk ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-gray-400 mt-2">{emailOk ? 'Verificado' : 'Você precisa verificar seu e-mail para continuar'}</p>
          </div>

          <div className={`p-4 rounded-xl border ${telegramOk ? 'bg-green-500/5 border-green-500/30' : 'bg-gray-900/50 border-gray-600'}`}>
            <div className="flex items-center gap-3">
              <MessageCircle className={`w-5 h-5 ${telegramOk ? 'text-green-400' : 'text-gray-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Telegram</p>
                <p className="text-xs text-gray-400 truncate">{profile?.telegram}</p>
              </div>
              {telegramOk ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />}
            </div>
            <p className="text-xs text-gray-400 mt-2">{telegramOk ? 'Verificado' : 'Obrigatório para usar o sistema'}</p>
          </div>

          <div className="p-4 rounded-xl border bg-gray-900/50 border-gray-600">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">WhatsApp</p>
                <p className="text-xs text-gray-400 truncate">{whatsappOk ? profile?.whatsapp || 'Informado' : 'Não informado'}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Usado apenas para contato administrativo, se necessário</p>
          </div>
        </div>

        {/* Alerta para usuários antigos sem e-mail verificado */}
        {!emailOk && (
          <>
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl">
              <p className="text-red-200 text-sm font-medium">Você precisa verificar seu e-mail para continuar usando todos os recursos.</p>
            </div>

            {/* Opção: Trocar e-mail (uma vez, para domínios bloqueados) */}
            {profile?.canChangeEmail && (
              <div className="mb-6 p-6 bg-gray-900/50 rounded-xl border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-2">Trocar E-mail</h3>
                <p className="text-gray-400 text-sm mb-4">Você pode trocar o e-mail apenas uma vez. Use um e-mail pessoal ou corporativo (não temporário).</p>
                {!emailChangeRequested ? (
                  <form onSubmit={handleRequestEmailChange} className="space-y-3">
                    <input
                      type="email"
                      value={newEmailForChange}
                      onChange={(e) => setNewEmailForChange(e.target.value)}
                      placeholder="novo@email.com"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/30 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={requestingEmailChange || !newEmailForChange.trim()}
                      className="w-full py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {requestingEmailChange ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar código para o novo e-mail'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleConfirmEmailChange} className="space-y-3">
                    <p className="text-gray-400 text-sm">Código enviado para {newEmailForChange}</p>
                    <input
                      type="text"
                      value={emailChangeCode}
                      onChange={(e) => setEmailChangeCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      maxLength={6}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white text-center text-xl font-mono tracking-widest"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={confirmingEmailChange || emailChangeCode.length !== 6}
                        className="flex-1 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl disabled:opacity-50 flex items-center justify-center"
                      >
                        {confirmingEmailChange ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar troca'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmailChangeRequested(false); setError(''); setSuccess(''); }}
                        className="px-4 py-3 border border-gray-600 text-gray-400 rounded-xl hover:bg-gray-700 text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Fluxo verificação de e-mail atual */}
            {(!profile?.canChangeEmail || !emailChangeRequested) && (
              <div className="mb-6 p-6 bg-gray-900/50 rounded-xl border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-2">Verificar E-mail</h3>
                <p className="text-gray-400 text-sm mb-4">Enviamos um código para {profile?.email}. Digite abaixo.</p>
                <form onSubmit={handleVerifyEmail} className="space-y-3">
                  <input
                    type="text"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white text-center text-xl font-mono tracking-widest"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={emailVerifying || emailCode.length !== 6}
                      className="flex-1 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl disabled:opacity-50"
                    >
                      {emailVerifying ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Verificar'}
                    </button>
                    <button
                      type="button"
                      onClick={handleResendEmailCode}
                      disabled={emailResending}
                      className="px-4 py-3 border border-gray-600 text-gray-400 rounded-xl hover:bg-gray-700 disabled:opacity-50 text-sm"
                    >
                      {emailResending ? 'Enviando...' : 'Reenviar código'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        {/* Alerta de segurança - somente quando e-mail OK e falta Telegram */}
        {emailOk && !telegramOk && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-200">
              <p className="font-medium mb-1">Verificação de Telegram obrigatória</p>
              <p className="text-yellow-300/80">
                Verifique seu Telegram para liberar todas as funcionalidades do sistema.
              </p>
            </div>
          </div>
        )}

        {/* Mensagens de erro/sucesso */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/50 rounded-xl flex items-center gap-3 text-green-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        {/* Editar Telegram e fluxo de verificação - só quando e-mail já verificado */}
        {emailOk && (editingTelegram ? (
          <div className="space-y-4 mb-6 p-6 bg-gray-900/50 rounded-xl border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Alterar Telegram</h3>
              <button
                onClick={() => {
                  setEditingTelegram(false);
                  setNewTelegram(profile?.telegram || '');
                  setError('');
                }}
                className="text-gray-400 hover:text-white text-sm"
              >
                Cancelar
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/50 rounded-lg">
              <p className="text-orange-300 text-sm">
                ⚠️ <strong>Atenção:</strong> Ao alterar seu Telegram, você precisará verificar o novo @ antes de acessar o sistema novamente.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Novo Telegram
              </label>
              <input
                type="text"
                value={newTelegram}
                onChange={(e) => setNewTelegram(e.target.value)}
                placeholder="@seu_telegram"
                className="w-full px-4 py-3 bg-gray-900/80 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20"
              />
            </div>

            <button
              onClick={handleUpdateTelegram}
              disabled={updatingTelegram || !newTelegram.trim()}
              className="w-full py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {updatingTelegram ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Atualizando...
                </>
              ) : (
                'Confirmar Alteração'
              )}
            </button>
          </div>
        ) : emailOk ? (
          <>
            {/* Mostrar Telegram cadastrado */}
            <div className="mb-6 p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Seu Telegram cadastrado:</p>
                  <p className="text-lg font-semibold text-white">{profile?.telegram}</p>
                </div>
                <button
                  onClick={() => setEditingTelegram(true)}
                  className="p-2 text-gray-400 hover:text-bitcoin hover:bg-gray-800 rounded-lg transition-colors"
                  title="Alterar Telegram"
                >
                  <Edit3 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KYC completo: mostrar resumo e botão */}
            {telegramOk && (
              <div className="mb-6 p-6 bg-green-500/10 border border-green-500/40 rounded-xl text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-white font-medium mb-1">Todas as verificações concluídas</p>
                <p className="text-gray-400 text-sm mb-4">Você tem acesso completo a todas as funcionalidades do sistema.</p>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-6 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30 transition-all"
                >
                  Ir para Dashboard
                </button>
              </div>
            )}

            {/* Estado 1: Ainda não iniciou conversa — único CTA (só se Telegram não verificado) */}
            {!telegramOk && !botConnection?.connected && (
              <div className="space-y-4">
                <div className="p-6 bg-blue-500/10 border-2 border-blue-500/50 rounded-xl">
                  <p className="text-blue-200 text-sm mb-4">
                    Para continuar, abra o bot no Telegram e clique em <strong className="text-white">Iniciar</strong>. 
                    Você receberá o código na hora e poderá voltar aqui para digitar.
                  </p>
                  <a
                    href={BOT_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-bold rounded-xl transition-colors"
                  >
                    <ExternalLink className="w-5 h-5" />
                    Abrir Telegram e iniciar conversa com o bot
                  </a>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-400">
                    {checkingConnection ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verificando...</span>
                      </>
                    ) : (
                      <span>Depois de clicar em Iniciar no Telegram, volte aqui.</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Estado 2: Conectado mas sem código ativo — só "Solicitar novo código" */}
            {!telegramOk && botConnection?.connected && !botConnection?.hasPendingCode && !codeSent && (
              <div className="space-y-4">
                <div className="p-5 bg-amber-500/10 border border-amber-500/50 rounded-xl flex items-center gap-3 mb-4">
                  <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div className="text-sm text-amber-200">
                    Nenhum código ativo. Solicite um novo e digite abaixo antes de expirar (5 min).
                  </div>
                </div>
                <button
                  onClick={handleRequestCode}
                  disabled={requesting}
                  className="w-full py-4 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {requesting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <MessageCircle className="w-5 h-5" />
                      Solicitar novo código
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Estado 3: Tem código ativo (veio do /start ou de "Solicitar novo") — digitar e validar */}
            {!telegramOk && (botConnection?.hasPendingCode || codeSent) && (
              <div className="space-y-4">
                <div className="p-5 bg-green-500/10 border border-green-500/50 rounded-xl flex items-center gap-3 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div className="text-sm text-green-300">
                    Código enviado no Telegram. Digite abaixo e clique em Validar.
                  </div>
                </div>

                {secondsLeft !== null && secondsLeft > 0 && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-blue-500/10 border border-blue-500/50 rounded-xl">
                    <Clock className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-300 text-sm">
                      Expira em: <strong>{formatTime(secondsLeft)}</strong>
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Código recebido no Telegram
                  </label>
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCodeInput(val);
                    }}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-4 bg-gray-900/80 border border-gray-700 rounded-xl text-white text-center text-2xl font-mono font-bold tracking-widest placeholder-gray-600 focus:outline-none focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20"
                  />
                </div>

                <button
                  onClick={handleValidateCode}
                  disabled={validating || codeInput.length !== 6}
                  className="w-full py-4 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {validating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Validar código
                    </>
                  )}
                </button>

                {(secondsLeft === 0 || (secondsLeft !== null && secondsLeft <= 0)) && (
                  <button
                    onClick={handleRequestCode}
                    disabled={requesting}
                    className="w-full py-3 border border-gray-600 text-gray-400 rounded-xl hover:bg-gray-700/50 hover:text-white transition-colors disabled:opacity-50 text-sm"
                  >
                    {requesting ? 'Enviando...' : 'Solicitar novo código'}
                  </button>
                )}
              </div>
            )}
          </>
        ) : null)}
      </div>
    </div>
  );
}
