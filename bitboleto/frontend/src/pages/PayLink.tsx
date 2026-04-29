/**
 * Página pública do link de pagamento: /pay/:slug
 * Exibe valor, dados do comerciante e pagamento via Pix (SwapVerse).
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { QrCode, Mail, Phone, Copy, Check, Loader2, Building2, CheckCircle2, Sparkles, Shield } from 'lucide-react';
import api from '../services/api';
import { isValidCPF, isValidCNPJ } from '../utils/cpfCnpj';

type LinkSettings = {
  logoUrl: string | null;
  cnpj: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  useCustomBranding: boolean;
  contactPhone: string | null;
  supportEmail: string | null;
  businessDescription: string | null;
  redirectUrl: string | null;
  faviconUrl: string | null;
};

type LinkData = {
  id: string;
  titulo: string;
  amount: number;
  slug: string;
  needsPayerDoc?: boolean;
  merchantName: string;
  settings: LinkSettings | null;
};

type PixOrder = {
  id: string;
  status: string;
  qr_image_url: string;
  qr_copy_paste: string;
  expires_at?: string;
};

const TERMINAL_STATUSES = ['depix_sent', 'canceled', 'error', 'refunded', 'expired'];

function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function PayLink() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [order, setOrder] = useState<PixOrder | null>(null);
  const [totalToPay, setTotalToPay] = useState<number | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [payerTaxNumber, setPayerTaxNumber] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!slug?.trim()) {
      setError('Link inválido');
      setLoading(false);
      return;
    }
    api
      .get<LinkData>(`/commerce/link/${encodeURIComponent(slug.trim())}`)
      .then((res) => {
        setData(res.data);
        if (res.data.settings?.faviconUrl) {
          const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (link) link.href = res.data.settings.faviconUrl;
          else {
            const el = document.createElement('link');
            el.rel = 'icon';
            el.href = res.data.settings.faviconUrl!;
            document.head.appendChild(el);
          }
        }
      })
      .catch((err: { response?: { data?: { error?: string } }; message?: string }) => {
        setError(err?.response?.data?.error || err?.message || 'Link não encontrado ou inativo');
      })
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const formatarValor = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 2) return digits.length ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const needsPayerDoc = Boolean(data?.needsPayerDoc ?? (data != null && data.amount >= 500));

  const handlePagarPix = async () => {
    if (!slug?.trim()) {
      setPixError('Slug do link não encontrado.');
      return;
    }
    if (!data) {
      setPixError('Aguardando carregamento dos dados do link...');
      return;
    }
    if (data.amount < 5) {
      setPixError('Valor mínimo para Pix é R$ 5,00.');
      return;
    }
    if (needsPayerDoc) {
      if (!payerName.trim() || payerName.trim().length < 2) {
        setPixError('Para valores a partir de R$ 500,00 é obrigatório informar o nome completo do pagador.');
        return;
      }
      const digits = payerTaxNumber.replace(/\D/g, '');
      if (!digits || (digits.length !== 11 && digits.length !== 14)) {
        setPixError('Informe CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador.');
        return;
      }
      if (digits.length === 11 && !isValidCPF(payerTaxNumber)) {
        setPixError('CPF inválido. Verifique os dígitos.');
        return;
      }
      if (digits.length === 14 && !isValidCNPJ(payerTaxNumber)) {
        setPixError('CNPJ inválido. Verifique os dígitos.');
        return;
      }
    }
    setPixError(null);
    setPixLoading(true);
    try {
      const slugToUse = slug.trim();
      const url = `/commerce/link/${encodeURIComponent(slugToUse)}/generate-pix`;
      const body = needsPayerDoc
        ? { payer_name: payerName.trim(), payer_tax_number: payerTaxNumber.replace(/\D/g, '') }
        : {};
      const { data: res } = await api.post<{
        orderId: string;
        qr_image_url: string;
        qr_copy_paste: string;
        totalToPay: number;
        redirectUrl: string | null;
      }>(url, body);
      
      if (!res?.orderId || !res?.qr_image_url) {
        throw new Error('Resposta inválida da API');
      }
      
      setOrder({
        id: res.orderId,
        status: 'pending',
        qr_image_url: res.qr_image_url,
        qr_copy_paste: res.qr_copy_paste,
      });
      setTotalToPay(res.totalToPay);
      setRedirectUrl(res.redirectUrl || null);
      pollStatus(res.orderId);
    } catch (err: unknown) {
      console.error('[PayLink] Erro ao gerar Pix:', err);
      const axiosError = err && typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { error?: string }; status?: number; statusText?: string; config?: { url?: string } } }).response
        : null;
      
      let errorMessage = 'Não foi possível gerar o QR Code. Tente novamente.';
      
      if (axiosError?.data?.error) {
        errorMessage = axiosError.data.error;
      } else if (axiosError?.status === 400) {
        errorMessage = 'Erro na solicitação. Verifique os dados e tente novamente.';
      } else if (axiosError?.status === 404) {
        errorMessage = 'Link não encontrado ou inativo. Verifique se o link está correto e ativo.';
      } else if (axiosError?.status === 500) {
        errorMessage = 'Erro no servidor. Tente novamente em alguns instantes.';
      } else if (err instanceof Error) {
        errorMessage = err.message || errorMessage;
      }
      
      setPixError(errorMessage);
    } finally {
      setPixLoading(false);
    }
  };

  const pollStatus = (orderId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    const maxAttempts = 150; // ~10 minutos (150 * 4s)
    
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setPixError('Tempo de espera esgotado. Se o pagamento foi realizado, entre em contato com o suporte.');
        return;
      }
      
      try {
        const { data: statusData } = await api.get<{ order: PixOrder }>(`/commerce/order/${orderId}/status`);
        if (statusData?.order) {
          setOrder(statusData.order);
          if (TERMINAL_STATUSES.includes(statusData.order.status)) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            if (statusData.order.status === 'depix_sent') {
              setPaymentSuccess(true);
            } else if (statusData.order.status === 'expired') {
              setPixError('QR Code expirado. Clique em "Pagar com Pix" novamente para gerar um novo código.');
            } else if (statusData.order.status === 'canceled') {
              setPixError('Pagamento cancelado. Tente novamente.');
            }
          }
        }
      } catch (err) {
        console.error('[PayLink] Erro ao verificar status:', err);
        // Continue polling em caso de erro de rede temporário
      }
    }, 4000);
  };

  const copyPixCode = () => {
    if (!order?.qr_copy_paste) return;
    navigator.clipboard.writeText(order.qr_copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (paymentSuccess && redirectUrl) {
      window.location.href = redirectUrl;
    }
  }, [paymentSuccess, redirectUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6">
        <div className="w-10 h-10 border-2 border-bitcoin border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 mt-4 text-sm">Carregando...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full rounded-xl bg-gray-800/50 border border-gray-700/50 p-6 text-center">
          <p className="text-red-400 font-medium text-sm">{error || 'Link não encontrado'}</p>
          <p className="text-gray-500 text-xs mt-2">Este link pode ter sido removido ou desativado.</p>
        </div>
      </div>
    );
  }

  const settings = data.settings;
  const useBranding = settings?.useCustomBranding && settings;
  const bgColor = useBranding && settings?.backgroundColor ? settings.backgroundColor : '#111827';
  const textColor = useBranding && settings?.textColor ? settings.textColor : '#FFFFFF';
  const primaryColor = useBranding && settings?.primaryColor ? settings.primaryColor : '#FF6B00';

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center p-3 transition-colors relative overflow-hidden ${
        paymentSuccess ? 'bg-payment-success' : ''
      }`}
      style={{ backgroundColor: paymentSuccess ? undefined : bgColor, color: textColor }}
    >
      {/* EFEITOS DE CELEBRAÇÃO - só aparecem quando paymentSuccess === true */}
      {paymentSuccess && (
        <>
          {/* Flash inicial */}
          <div className="success-flash-overlay" />
          
          {/* Ondas expansivas */}
          {[1, 2, 3].map((i) => (
            <div 
              key={`ripple-${i}`}
              className="success-ripple"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
          
          {/* Raios de luz */}
          {[...Array(12)].map((_, i) => (
            <div
              key={`ray-${i}`}
              className="light-ray"
              style={{
                '--rotation': `${i * 30}deg`,
                animationDelay: `${i * 0.1}s`,
              } as React.CSSProperties}
            />
          ))}
          
          {/* Confetti explosão */}
          {[...Array(100)].map((_, i) => {
            const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
            return (
              <div
                key={`confetti-${i}`}
                className="confetti-fullscreen"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  backgroundColor: colors[i % colors.length],
                  '--rotation': `${Math.random() * 720}deg`,
                  '--duration': `${2 + Math.random() * 2}s`,
                  animationDelay: `${Math.random() * 0.5}s`,
                } as React.CSSProperties}
              />
            );
          })}
          
          {/* Chuva de moedas */}
          {[...Array(30)].map((_, i) => (
            <div
              key={`coin-${i}`}
              className="coin-rain"
              style={{
                left: `${Math.random() * 100}%`,
                '--duration': `${3 + Math.random() * 2}s`,
                '--delay': `${Math.random() * 2}s`,
              } as React.CSSProperties}
            />
          ))}
          
          {/* Partículas de brilho */}
          {[...Array(40)].map((_, i) => (
            <div
              key={`sparkle-${i}`}
              className="sparkle-particle"
              style={{
                left: `${Math.random() * 100}%`,
                bottom: '0',
                '--delay': `${Math.random() * 3}s`,
              } as React.CSSProperties}
            />
          ))}
        </>
      )}

      {/* Card principal */}
      <div
        className={`max-w-md w-full rounded-xl backdrop-blur-xl border p-4 transition-all relative z-10 ${
          paymentSuccess ? 'card-success' : ''
        }`}
        style={{
          backgroundColor: useBranding ? `${bgColor}CC` : 'rgba(31, 41, 55, 0.5)',
          borderColor: useBranding ? `${textColor}30` : 'rgba(75, 85, 99, 0.5)',
        }}
      >
        {settings?.logoUrl && (
          <div className="flex justify-center mb-3">
            <img
              src={settings.logoUrl}
              alt={data.merchantName}
              className="h-10 w-auto object-contain max-w-[120px]"
              loading="lazy"
            />
          </div>
        )}

        <p className="text-[10px] uppercase tracking-wider mb-0.5 opacity-70" style={{ color: textColor }}>
          Pagamento
        </p>
        <h1 className="text-lg font-bold mb-0.5" style={{ color: textColor }}>
          {data.titulo}
        </h1>
        <p className="text-xs font-medium opacity-90" style={{ color: textColor }}>
          {data.merchantName}
        </p>

        {settings?.cnpj && (
          <p className="text-[10px] opacity-80 mt-0.5 flex items-center gap-1" style={{ color: textColor }}>
            <Building2 className="w-3 h-3 flex-shrink-0" />
            CNPJ {formatCnpj(settings.cnpj)}
          </p>
        )}

        {settings?.businessDescription && (
          <p className="text-[11px] mt-2 opacity-90 leading-relaxed" style={{ color: textColor }}>
            {settings.businessDescription}
          </p>
        )}

        <div className="text-center my-4">
          <p className="text-2xl font-bold" style={{ color: primaryColor }}>
            {formatarValor(order ? (totalToPay ?? data.amount) : data.amount)}
          </p>
        </div>

        {!order ? (
          <>
            {pixError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] leading-relaxed">
                {pixError}
              </div>
            )}
            {needsPayerDoc && (
              <div className="mb-3 space-y-2.5 p-3 rounded-lg border" style={{ borderColor: `${textColor}25`, backgroundColor: useBranding ? `${textColor}08` : 'rgba(255,255,255,0.04)' }}>
                <p className="text-[11px] font-medium opacity-90" style={{ color: textColor }}>
                  Para pagamentos a partir de R$ 500,00 o processador exige a identificação do pagador (nome e CPF ou CNPJ).
                </p>
                <div>
                  <label className="block text-[10px] font-medium mb-1 opacity-80" style={{ color: textColor }}>Nome completo do pagador</label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Como no documento"
                    className="w-full px-3 py-2 rounded-lg text-sm border bg-black/20 placeholder-opacity-50"
                    style={{ borderColor: `${textColor}30`, color: textColor }}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium mb-1 opacity-80" style={{ color: textColor }}>CPF ou CNPJ do pagador</label>
                  <input
                    type="text"
                    value={payerTaxNumber}
                    onChange={(e) => setPayerTaxNumber(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="Apenas números (11 ou 14 dígitos)"
                    className="w-full px-3 py-2 rounded-lg text-sm border bg-black/20 placeholder-opacity-50 font-mono"
                    style={{ borderColor: `${textColor}30`, color: textColor }}
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={handlePagarPix}
              disabled={pixLoading || data.amount < 5}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primaryColor, color: '#000000' }}
            >
              {pixLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <QrCode className="w-5 h-5" />
              )}
              {pixLoading ? 'Gerando QR Code...' : 'Pagar com Pix'}
            </button>
            {data.amount < 5 && (
              <p className="text-[10px] text-center mt-1.5 opacity-70" style={{ color: textColor }}>
                Valor mínimo para pagamento via Pix: R$ 5,00.
              </p>
            )}
            <p className="text-[10px] text-center mt-2 opacity-80 leading-relaxed" style={{ color: textColor }}>
              1. Abra o app do seu banco • 2. Escaneie ou copie o código • 3. Confirme o pagamento
            </p>
          </>
        ) : paymentSuccess ? (
          <div className="relative text-center py-6 overflow-hidden">
            {/* Ícone de sucesso animado */}
            <div className="relative z-10 flex justify-center mb-4">
              <div className="relative">
                {/* Círculo de fundo pulsante */}
                <div 
                  className="absolute inset-0 rounded-full animate-pulse-glow"
                  style={{ backgroundColor: '#10b981', opacity: 0.2 }}
                />
                {/* Checkmark */}
                <div className="relative bg-green-500 rounded-full p-4 animate-success-bounce">
                  <CheckCircle2 className="w-12 h-12 text-white" strokeWidth={2.5} />
                </div>
                {/* Estrelas ao redor */}
                {[...Array(8)].map((_, i) => {
                  const angle = (i * 45) * (Math.PI / 180);
                  const radius = 50;
                  const x = Math.cos(angle) * radius;
                  const y = Math.sin(angle) * radius;
                  return (
                    <Sparkles
                      key={i}
                      className="absolute w-4 h-4 text-yellow-400 animate-sparkle"
                      style={{
                        left: `calc(50% + ${x}px)`,
                        top: `calc(50% + ${y}px)`,
                        transform: 'translate(-50%, -50%)',
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Mensagem de sucesso */}
            <div className="relative z-10 animate-success-bounce" style={{ animationDelay: '0.2s' }}>
              <p className="text-xl font-bold text-green-400 mb-2 animate-float">
                Pagamento confirmado! 🎉
              </p>
              <p className="text-sm opacity-90 mt-2" style={{ color: textColor }}>
                {redirectUrl ? 'Redirecionando...' : 'Pagamento confirmado! Você receberá a confirmação por e-mail, se informado.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-center opacity-90 leading-relaxed" style={{ color: textColor }}>
              Escaneie o QR Code ou copie o código Pix para pagar {totalToPay != null ? formatarValor(totalToPay) : ''}.
            </p>
            {order.qr_image_url && (
              <div className="flex justify-center">
                <img src={order.qr_image_url} alt="QR Code Pix" className="w-44 h-44 md:w-48 md:h-48 rounded-lg bg-white p-2" />
              </div>
            )}
            {order.qr_copy_paste && (
              <button
                type="button"
                onClick={copyPixCode}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border font-medium text-sm min-h-[44px]"
                style={{ borderColor: `${textColor}40`, color: textColor }}
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Código copiado!' : 'Copiar código Pix'}
              </button>
            )}
            <p className="text-[10px] text-center opacity-70" style={{ color: textColor }}>
              Aguardando confirmação do pagamento...
            </p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t flex items-center justify-center gap-1.5" style={{ borderColor: `${textColor}20` }}>
          <Shield className="w-3.5 h-3.5 opacity-70" style={{ color: textColor }} />
          <span className="text-[10px] opacity-80" style={{ color: textColor }}>
            Transação segura via PagDepix
          </span>
        </div>

        {(settings?.contactPhone || settings?.supportEmail) && (
          <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: `${textColor}20` }}>
            <p className="text-[10px] opacity-70 mb-1.5" style={{ color: textColor }}>
              Dúvidas? Entre em contato:
            </p>
            {settings.contactPhone && (
              <div className="flex items-center gap-1.5 text-[10px] opacity-80" style={{ color: textColor }}>
                <Phone className="w-3 h-3 flex-shrink-0" />
                <a href={`tel:${settings.contactPhone}`} className="hover:opacity-100">
                  {formatPhone(settings.contactPhone)}
                </a>
              </div>
            )}
            {settings.supportEmail && (
              <div className="flex items-center gap-1.5 text-[10px] opacity-80" style={{ color: textColor }}>
                <Mail className="w-3 h-3 flex-shrink-0" />
                <a href={`mailto:${settings.supportEmail}`} className="hover:opacity-100 truncate">
                  {settings.supportEmail}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
