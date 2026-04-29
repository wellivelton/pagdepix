/**
 * Página "Confirmar conta": verificação de email (código de 6 dígitos) e Telegram na mesma tela.
 * Usuário é redirecionado aqui após cadastro ou login se ainda não tiver ambos verificados.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  MessageCircle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Send,
} from 'lucide-react';
import api from '../services/api';

const BOT_LINK = 'https://t.me/PagDepixBot';

interface Profile {
  emailVerified?: boolean;
  telegramVerified?: boolean;
  role?: string;
  email?: string;
}

export default function ConfirmarConta() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Email
  const [emailCode, setEmailCode] = useState('');
  const [emailVerifying, setEmailVerifying] = useState(false);
  const [emailResending, setEmailResending] = useState(false);

  // Telegram
  const [tgGenerating, setTgGenerating] = useState(false);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgExpiresAt, setTgExpiresAt] = useState<string | null>(null);
  const [tgSecondsLeft, setTgSecondsLeft] = useState<number | null>(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchProfile = () => {
    return api.get<Profile>('/user/profile').then((res) => {
      setProfile(res.data);
      return res.data;
    });
  };

  useEffect(() => {
    fetchProfile()
      .then((data) => {
        if (data.role === 'ADMIN') return;
        if (data.emailVerified && data.telegramVerified) {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setLoading(false));
  }, [navigate]);

  // Contagem regressiva do código Telegram
  useEffect(() => {
    if (!tgExpiresAt) {
      setTgSecondsLeft(null);
      return;
    }
    const update = () => {
      const end = new Date(tgExpiresAt).getTime();
      const now = Date.now();
      setTgSecondsLeft(Math.max(0, Math.floor((end - now) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [tgExpiresAt]);

  // Atualizar perfil periodicamente para detectar verificação do Telegram
  useEffect(() => {
    if (!profile || profile.role === 'ADMIN' || (profile.emailVerified && profile.telegramVerified)) return;
    const interval = setInterval(() => {
      fetchProfile().then((data) => {
        if (data.emailVerified && data.telegramVerified) {
          const u = JSON.parse(localStorage.getItem('user') || '{}');
          localStorage.setItem('user', JSON.stringify({ ...u, emailVerified: true, telegramVerified: true }));
          navigate('/dashboard', { replace: true });
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [profile, navigate]);

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = emailCode.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos enviado ao seu email.');
      return;
    }
    setEmailVerifying(true);
    try {
      await api.post('/auth/verify-email-code', { code });
      setSuccess('Email confirmado com sucesso!');
      setEmailCode('');
      const data = await fetchProfile();
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...u, emailVerified: true }));
      if (data.telegramVerified) {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Código inválido. Tente novamente.');
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
      setSuccess('Novo código enviado. Verifique seu email (e a pasta de spam).');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao reenviar. Tente mais tarde.');
    } finally {
      setEmailResending(false);
    }
  };

  const handleGenerateTgCode = async () => {
    setError('');
    setSuccess('');
    setTgGenerating(true);
    try {
      const { data } = await api.post<{ code?: string; expiresAt?: string; adminSkipVerification?: boolean }>(
        '/auth/request-telegram-verification'
      );
      if (data.adminSkipVerification) return;
      setTgCode(data.code!);
      setTgExpiresAt(data.expiresAt!);
      setSuccess('Código gerado. Envie-o no Telegram para @PagDepixBot.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar código.');
    } finally {
      setTgGenerating(false);
    }
  };

  const copyTgCode = () => {
    if (tgCode) {
      navigator.clipboard.writeText(tgCode);
      setSuccess('Código copiado!');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
      </div>
    );
  }

  // Admin não precisa verificar
  if (profile?.role === 'ADMIN') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 text-center">
          <CheckCircle2 className="w-16 h-16 text-bitcoin mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Administrador</h1>
          <p className="text-gray-400 text-sm mb-6">
            Verificação de email e Telegram não é necessária para você.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl"
          >
            Ir para o Dashboard
          </button>
        </div>
      </div>
    );
  }

  const emailOk = profile?.emailVerified === true;
  const telegramOk = profile?.telegramVerified === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-20 text-bitcoin text-9xl">₿</div>
        <div className="absolute bottom-20 right-20 text-bitcoin text-9xl">₿</div>
      </div>

      <div className="w-full max-w-lg relative z-10">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="PagDepix" className="w-16 h-16 rounded-2xl object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">Confirmar sua conta</h1>
          <p className="text-gray-400 text-sm mt-1">
            Valide seu email e Telegram para usar o PagDepix
          </p>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-gray-700/50 space-y-8">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
          {success && (
            <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-xl flex items-center gap-3 text-green-400">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{success}</span>
            </div>
          )}

          {/* Email */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${emailOk ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                {emailOk ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <Mail className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-white">1. Verificar email</h2>
                <p className="text-gray-500 text-sm">
                  {emailOk ? 'Email confirmado' : 'Digite o código de 6 dígitos enviado para ' + (profile?.email || 'seu email')}
                </p>
              </div>
            </div>
            {!emailOk && (
              <div className="space-y-3">
                <form onSubmit={handleVerifyEmail} className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 text-center text-2xl font-mono tracking-widest bg-gray-900 border border-gray-600 rounded-xl py-3 text-white placeholder-gray-500 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin outline-none"
                  />
                  <button
                    type="submit"
                    disabled={emailVerifying || emailCode.replace(/\D/g, '').length !== 6}
                    className="px-6 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {emailVerifying ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verificar'}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={handleResendEmailCode}
                  disabled={emailResending}
                  className="text-sm text-gray-400 hover:text-bitcoin transition-colors disabled:opacity-50"
                >
                  {emailResending ? 'Enviando...' : 'Reenviar código'}
                </button>
              </div>
            )}
          </section>

          {/* Telegram */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${telegramOk ? 'bg-green-500/20' : 'bg-gray-700'}`}>
                {telegramOk ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <MessageCircle className="w-5 h-5 text-gray-400" />
                )}
              </div>
              <div>
                <h2 className="font-semibold text-white">2. Verificar Telegram</h2>
                <p className="text-gray-500 text-sm">
                  {telegramOk ? 'Telegram confirmado' : 'Gere um código e envie no @PagDepixBot'}
                </p>
              </div>
            </div>
            {!telegramOk && (
              <div className="space-y-4">
                {!tgCode ? (
                  <button
                    onClick={handleGenerateTgCode}
                    disabled={tgGenerating}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-[#0088cc] text-white font-bold rounded-xl hover:bg-[#0077b5] transition-colors disabled:opacity-50"
                  >
                    {tgGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    Gerar código de verificação
                  </button>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl font-mono font-bold tracking-widest text-bitcoin bg-gray-900/80 px-4 py-3 rounded-xl border border-gray-700">
                        {tgCode}
                      </span>
                      <button
                        type="button"
                        onClick={copyTgCode}
                        className="p-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-gray-300"
                        title="Copiar"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                    {tgSecondsLeft !== null && (
                      <p className="text-center text-gray-500 text-sm">
                        Expira em: {tgSecondsLeft === 0 ? 'Expirado' : formatTime(tgSecondsLeft)}
                      </p>
                    )}
                    <a
                      href={BOT_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3 bg-[#0088cc] text-white font-semibold rounded-xl hover:bg-[#0077b5]"
                    >
                      <ExternalLink className="w-5 h-5" />
                      Abrir @PagDepixBot no Telegram
                    </a>
                    <button
                      type="button"
                      onClick={handleGenerateTgCode}
                      disabled={tgGenerating || (tgSecondsLeft !== null && tgSecondsLeft > 0)}
                      className="w-full py-2 text-sm text-gray-400 hover:text-white border border-gray-600 rounded-xl disabled:opacity-50"
                    >
                      Gerar novo código
                    </button>
                  </>
                )}
              </div>
            )}
          </section>

          {emailOk && telegramOk && (
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-4 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl"
            >
              Ir para o Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
