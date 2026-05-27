import { useState, useCallback, useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Copy, Check,
  AlertCircle, Loader2, QrCode as QrCodeIcon, Tag, X,
  ArrowRight, Clock, Barcode, Calendar, ExternalLink, Plus,
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, formatCryptoAmount, type Currency } from '../components/CurrencySelector';
import { RateLockCountdown } from '../components/RateLockCountdown';

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseBrl(value: string): number {
  if (!value) return NaN;
  const s = value.trim().replace(/\s/g, '');
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(n) || NaN;
}

function isWithinBusinessHours(): boolean {
  const now = new Date();
  const bStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour12: false });
  const b = new Date(bStr);
  const day = b.getDay();
  const h = b.getHours();
  return day >= 1 && day <= 5 && h >= 9 && h < 18;
}

const inputCls =
  'w-full px-3.5 py-2.5 bg-app-elevated border border-app-stroke rounded-xl text-app-text placeholder-app-subtle text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all disabled:opacity-50';

interface Preview {
  isValid: boolean;
  fee: number;
  feeBeforeCoupon?: number;
  totalAmount: number;
  amount: number;
  percentageFormatted?: string;
  fixedFee?: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  exchangeRate?: number | null;
  cryptoAmount?: string | null;
  paymentCurrency?: string;
  rateTimestamp?: string | null;
  rateError?: boolean;
}

interface BillPaymentOrder {
  id: string;
  barcode?: string;
  digitableLine?: string;
  amount: number;
  fee: number;
  totalAmount: number;
  depixAmount: number;
  walletAddress: string;
  status: string;
  couponUsed?: string;
  createdAt: string;
  paymentCurrency: string;
  exchangeRate?: number;
  cryptoAmount?: string;
  rateLockExpiresAt?: string;
}

// ─── StepBar ──────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  const steps = ['Dados', 'Resumo', 'Pagamento'];
  return (
    <div className="flex items-center mb-6">
      {steps.map((label, i) => {
        const s = i + 1;
        const active = step === s;
        const done = step > s;
        return (
          <div key={s} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
            <div className={`flex items-center gap-1.5 ${active || done ? '' : 'opacity-40'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                done ? 'bg-bitcoin text-black'
                  : active ? 'bg-bitcoin/15 border-2 border-bitcoin text-bitcoin'
                    : 'bg-app-elevated border border-app-stroke text-app-muted'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap hidden sm:block ${active ? 'text-app-text' : 'text-app-muted'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-2 transition-colors ${done ? 'bg-bitcoin/50' : 'bg-app-stroke'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PagamentoConta() {
  const { triggerPushActivation } = useNotifications();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [barcode, setBarcode] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [currency, setCurrency] = useState<Currency>('DEPIX');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [parsedAmountLoading, setParsedAmountLoading] = useState(false);
  // Step 2 state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [order, setOrder] = useState<BillPaymentOrder | null>(null);

  // Step 3 state — polling automático
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const amount = parseBrl(amountStr);

  // Polling automático de status no step 3
  useEffect(() => {
    if (step !== 3 || !order || paymentDetected) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/bill-payments/${order.id}`);
        if (data.status === 'PROCESSING' || data.status === 'PAID') {
          setPaymentDetected(true);
          triggerPushActivation('boleto');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {}
    };
    poll();
    pollingRef.current = setInterval(poll, 8000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [step, order, paymentDetected, triggerPushActivation]);

  // Auto-parse amount from barcode
  const tryParseBarcode = useCallback(async (code: string) => {
    const digits = code.replace(/\D/g, '');
    if (digits.length < 44) return;
    setParsedAmountLoading(true);
    try {
      const isDigitable = code.includes('.') || code.includes(' ');
      const payload = isDigitable ? { digitableLine: code.replace(/\s/g, '') } : { barcode: digits };
      const res = await api.post('/bill-payments/parse-barcode', payload);
      if (res.data.amount) {
        setAmountStr(res.data.amount.toFixed(2).replace('.', ','));
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error;
      if (msg) setPreviewError(msg);
    } finally {
      setParsedAmountLoading(false);
    }
  }, []);

  const handleBarcodeChange = (val: string) => {
    setBarcode(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => tryParseBarcode(val), 600);
  };

  // Auto-preview when amount + currency change
  useEffect(() => {
    const num = parseBrl(amountStr);
    if (!Number.isFinite(num) || num <= 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const res = await api.post('/bill-payments/preview', {
          amount: num,
          couponCode: couponCode || undefined,
          paymentCurrency: currency,
        });
        setPreview({ ...res.data, amount: num });
      } catch (e: any) {
        setPreviewError(e?.response?.data?.error ?? 'Erro ao calcular taxa.');
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [amountStr, couponCode, currency]);

  const handleConfirm = async () => {
    if (!barcode.replace(/\D/g, '') && !barcode.includes('.')) {
      setSubmitError('Informe o código de barras ou linha digitável.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setSubmitError('Informe o valor da conta.');
      return;
    }
    if (!preview?.isValid) {
      setSubmitError('Calcule a taxa antes de confirmar.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const isDigitableLine = barcode.includes('.') || barcode.includes(' ');
      const res = await api.post('/bill-payments', {
        [isDigitableLine ? 'digitableLine' : 'barcode']: barcode.replace(/\s/g, ''),
        amount,
        couponCode: couponCode || undefined,
        paymentCurrency: currency,
      });
      setOrder(res.data);
      setStep(3);
    } catch (e: any) {
      setSubmitError(e?.response?.data?.error ?? 'Erro ao criar pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  };

  const handleGoToReview = async () => {
    const num = parseBrl(amountStr);
    if (Number.isFinite(num) && num > 0) {
      setPreviewLoading(true);
      try {
        const res = await api.post('/bill-payments/preview', {
          amount: num,
          couponCode: couponCode || undefined,
          paymentCurrency: currency,
        });
        setPreview({ ...res.data, amount: num });
      } catch (err) {
        console.warn('[PagamentoConta] Re-fetch de preview no Step 2 falhou, usando preview anterior:', err);
      } finally {
        setPreviewLoading(false);
      }
    }
    setStep(2);
  };

  const handleReset = () => {
    setStep(1);
    setBarcode('');
    setAmountStr('');
    setCouponCode('');
    setPreview(null);
    setOrder(null);
    setPaymentDetected(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const cryptoCurrency = order?.paymentCurrency ?? currency;
  const displayCryptoAmount = order?.cryptoAmount
    ? formatCryptoAmount(order.cryptoAmount, cryptoCurrency as Currency)
    : null;

  // ─── Step 1: Dados da Conta ────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="max-w-xl mx-auto p-4 pb-8">
        <StepBar step={1} />

        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-bitcoin/15 flex items-center justify-center">
            <Barcode className="w-4 h-4 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-app-text">Pagar Conta</h1>
            <p className="text-xs text-app-muted">Boletos, concessionárias e tributos</p>
          </div>
        </div>

        <div className="bg-app-card border border-app-stroke rounded-2xl p-4 space-y-4">
          {/* Barcode / Linha Digitável */}
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Código de barras ou linha digitável
            </label>
            <textarea
              className={`${inputCls} resize-none h-20 font-mono text-xs`}
              placeholder="Cole o código de barras ou linha digitável aqui"
              value={barcode}
              onChange={(e) => handleBarcodeChange(e.target.value)}
            />
            {parsedAmountLoading && (
              <p className="text-xs text-app-muted mt-1 flex items-center gap-1 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" /> Consultando RV Hub...
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Valor da conta (R$)
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="Ex: 150,00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              inputMode="decimal"
            />
          </div>

          {/* Currency */}
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Moeda de pagamento
            </label>
            <CurrencySelector value={currency} onChange={setCurrency} />
          </div>

          {/* Coupon */}
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Cupom (opcional)
            </label>
            <div className="relative">
              <input
                type="text"
                className={`${inputCls} uppercase pr-8`}
                placeholder="CÓDIGO"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              />
              {couponCode && (
                <button
                  onClick={() => setCouponCode('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Preview */}
          {previewLoading && (
            <div className="flex items-center gap-1.5 text-xs text-app-muted animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Calculando...
            </div>
          )}
          {previewError && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {previewError}
            </div>
          )}
          {preview?.isValid && !previewLoading && (
            <div className="p-3 bg-bitcoin/5 border border-bitcoin/20 rounded-xl text-xs space-y-1.5">
              {preview.cupomValido && (
                <div className="flex justify-between text-app-muted">
                  <span>Taxa original</span>
                  <span className="line-through">{fmtBRL(preview.feeBeforeCoupon ?? preview.fee)}</span>
                </div>
              )}
              <div className="flex justify-between text-app-muted">
                <span>Taxa {preview.percentageFormatted ? `(${preview.percentageFormatted} + R$ ${preview.fixedFee?.toFixed(2).replace('.', ',')})` : ''}</span>
                <span className={preview.cupomValido ? 'text-green-500 font-semibold' : ''}>{fmtBRL(preview.fee)}</span>
              </div>
              <div className="flex justify-between font-bold text-app-text border-t border-bitcoin/20 pt-1.5">
                <span>Total a pagar</span>
                <span className="text-bitcoin">{fmtBRL(preview.totalAmount)}</span>
              </div>

              {/* DEPIX — 1:1 com BRL */}
              {currency === 'DEPIX' && preview.cryptoAmount && (
                <div className="flex justify-between text-app-muted pt-1 border-t border-bitcoin/10">
                  <span>Total em DEPIX</span>
                  <span className="font-semibold">
                    {Number(preview.cryptoAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} DEPIX
                  </span>
                </div>
              )}

              {/* USDT / BTC — breakdown com cotação */}
              {currency !== 'DEPIX' && (
                <div className="pt-1 border-t border-bitcoin/10 space-y-1">
                  {preview.rateError ? (
                    <p className="text-amber-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Cotação temporariamente indisponível
                    </p>
                  ) : preview.cryptoAmount ? (
                    <>
                      <div className="flex justify-between text-app-muted">
                        <span>Cotação {currency}</span>
                        <span>1 {currency} = {fmtBRL(preview.exchangeRate ?? 0)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-app-text">
                        <span>Você envia</span>
                        <span>
                          {currency === 'BTC'
                            ? `${Number(preview.cryptoAmount).toLocaleString('pt-BR')} sats (~${(Number(preview.cryptoAmount) / 1e8).toFixed(8)} BTC)`
                            : `${preview.cryptoAmount} ${currency}`}
                        </span>
                      </div>
                      {preview.rateTimestamp && (
                        <p className="text-[10px] text-app-subtle">
                          Cotação de {new Date(preview.rateTimestamp).toLocaleTimeString('pt-BR')} · será fixada ao confirmar
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs text-blue-400 space-y-1">
          <p className="font-medium flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Pagamentos aceitos</p>
          <p className="text-app-muted">Boletos bancários, faturas de concessionárias (energia, água, gás, telefone) e tributos (IPTU, IPVA, DAS MEI).</p>
        </div>

        <button
          onClick={handleGoToReview}
          disabled={!barcode.trim() || !Number.isFinite(amount) || !preview?.isValid || previewLoading}
          className="mt-4 w-full py-3 rounded-xl bg-bitcoin text-black font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all hover:bg-bitcoin/90"
        >
          {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Revisar pedido <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    );
  }

  // ─── Step 2: Resumo ────────────────────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="max-w-xl mx-auto p-4 pb-8">
        <StepBar step={2} />

        <div className="bg-app-card border border-app-stroke rounded-2xl p-4 space-y-3">
          <h2 className="font-bold text-app-text">Resumo do pagamento</h2>

          <div className="bg-app-elevated rounded-xl p-3 space-y-2 text-xs">
            <div>
              <p className="text-app-muted mb-0.5">Código</p>
              <p className="font-mono text-[11px] break-all text-app-text">{barcode}</p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-app-muted">
              <span>Valor da conta</span>
              <span>{fmtBRL(amount)}</span>
            </div>
            {preview?.cupomValido && (
              <div className="flex justify-between text-app-muted text-xs">
                <span>Taxa original</span>
                <span className="line-through">{fmtBRL(preview.feeBeforeCoupon ?? preview.fee)}</span>
              </div>
            )}
            <div className="flex justify-between text-app-muted">
              <span>Taxa de serviço {preview?.cupomValido && <span className="text-green-500 text-xs">(com desconto)</span>}</span>
              <span>{fmtBRL(preview?.fee ?? 0)}</span>
            </div>
            <div className="flex justify-between font-bold text-app-text border-t border-app-stroke pt-2">
              <span>Total a pagar</span>
              <span className="text-bitcoin">{fmtBRL(preview?.totalAmount ?? 0)}</span>
            </div>
            {/* DEPIX no resumo */}
            {currency === 'DEPIX' && preview?.cryptoAmount && (
              <div className="flex justify-between text-app-muted text-xs">
                <span>Total em DEPIX</span>
                <span>{Number(preview.cryptoAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} DEPIX</span>
              </div>
            )}

            {/* USDT / BTC — breakdown com aviso de estimativa */}
            {currency !== 'DEPIX' && preview?.cryptoAmount && !preview.rateError && (
              <div className="p-3 bg-app-elevated border border-app-stroke rounded-xl text-xs space-y-1.5 mt-1">
                <div className="flex justify-between text-app-muted">
                  <span>Cotação {currency}</span>
                  <span>1 {currency} = {fmtBRL(preview.exchangeRate ?? 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-app-text">
                  <span>Estimativa</span>
                  <span>
                    {currency === 'BTC'
                      ? `~${Number(preview.cryptoAmount).toLocaleString('pt-BR')} sats`
                      : `~${preview.cryptoAmount} ${currency}`}
                  </span>
                </div>
                <p className="text-[10px] text-amber-400">
                  Cotação real fixada ao confirmar o pedido
                </p>
              </div>
            )}
            {currency !== 'DEPIX' && preview?.rateError && (
              <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> Cotação indisponível — será calculada ao confirmar
              </p>
            )}
          </div>

          {submitError && (
            <div className="flex items-start gap-1.5 text-sm text-red-500 bg-red-500/10 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {submitError}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl border border-app-stroke text-app-text font-medium text-sm hover:bg-app-elevated transition-all"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-bitcoin text-black font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:bg-bitcoin/90"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</> : <>Confirmar <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 3: Pagamento ────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto p-4 pb-8">
      <StepBar step={3} />

      <div className="space-y-4">
        {/* Endereço + valor */}
        <div className="bg-app-card border border-app-stroke rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-bitcoin/15 flex items-center justify-center">
              <QrCodeIcon className="w-4 h-4 text-bitcoin" />
            </div>
            <div>
              <p className="font-bold text-app-text text-sm">Envie o pagamento</p>
              <p className="text-xs text-app-muted">
                Envie exatamente {order?.cryptoAmount && cryptoCurrency !== 'DEPIX'
                  ? `${displayCryptoAmount} ${cryptoCurrency}`
                  : `${fmtBRL(order?.totalAmount ?? 0)}`} para o endereço abaixo
              </p>
            </div>
          </div>

          {order?.rateLockExpiresAt && cryptoCurrency !== 'DEPIX' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 rounded-lg p-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Cotação válida por <RateLockCountdown expiresAt={order.rateLockExpiresAt} /></span>
            </div>
          )}

          <div>
            <p className="text-xs text-app-muted mb-1.5">
              Endereço {cryptoCurrency !== 'DEPIX' ? cryptoCurrency : 'Liquid (DEPIX)'}
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-[11px] bg-app-elevated rounded-lg p-2.5 font-mono break-all text-app-text">
                {order?.walletAddress}
              </code>
              <button
                onClick={() => handleCopy(order?.walletAddress ?? '')}
                className="flex-shrink-0 p-2 rounded-lg bg-app-elevated border border-app-stroke hover:border-bitcoin transition-all"
                title="Copiar endereço"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-app-muted" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-app-elevated rounded-lg p-2.5">
              <p className="text-app-muted mb-0.5">Valor da conta</p>
              <p className="font-bold text-app-text">{fmtBRL(order?.amount ?? 0)}</p>
            </div>
            <div className="bg-app-elevated rounded-lg p-2.5">
              <p className="text-app-muted mb-0.5">Total (c/ taxa)</p>
              <p className="font-bold text-bitcoin">{fmtBRL(order?.totalAmount ?? 0)}</p>
            </div>
            {order?.cryptoAmount && cryptoCurrency !== 'DEPIX' && (
              <div className="bg-app-elevated rounded-lg p-2.5 col-span-2">
                <p className="text-app-muted mb-0.5">Valor em {cryptoCurrency}</p>
                <p className="font-bold text-app-text">{displayCryptoAmount} {cryptoCurrency}</p>
              </div>
            )}
          </div>
        </div>

        {/* Status do pagamento */}
        <div className="bg-app-card border border-app-stroke rounded-2xl p-4">
          {!paymentDetected ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-7 h-7 text-bitcoin animate-spin" />
              <p className="text-sm font-semibold text-app-text">Aguardando identificação do pagamento…</p>
              <p className="text-xs text-app-muted text-center leading-relaxed">
                Identificamos automaticamente assim que a transação for confirmada na blockchain.
                <br />Pode fechar esta página — o pagamento fica salvo e você acompanha em <strong>Histórico</strong>.
              </p>
              <p className="text-[11px] text-app-subtle">
                ID do pedido: <code className="font-mono text-app-text">{order?.id}</code>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Pagamento identificado */}
              <div className="flex items-center gap-3 p-3.5 bg-green-500/10 border border-green-500/30 rounded-xl">
                <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-green-400">Pagamento identificado!</p>
                  <p className="text-xs text-app-muted">Já recebemos sua solicitação.</p>
                </div>
              </div>

              {/* Prazo de processamento */}
              <div className="p-3.5 bg-app-elevated border border-app-stroke rounded-xl space-y-3 text-xs">
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-bitcoin flex-shrink-0 mt-0.5" />
                  <p className="text-app-text leading-relaxed">
                    Processaremos o pagamento em <strong>até 30 minutos</strong> dentro do horário comercial.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-app-muted flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-app-muted font-semibold">Horário de atendimento</p>
                    <p className="text-app-text">Segunda a Sexta, 9h às 18h (Brasília)</p>
                    {!isWithinBusinessHours() && (
                      <p className="text-amber-400 font-medium mt-1">
                        ⏰ Fora do horário comercial — seu pagamento será processado no próximo dia útil.
                      </p>
                    )}
                  </div>
                </div>
                <div className="border-t border-app-stroke pt-3 text-app-muted leading-relaxed">
                  Após o pagamento pelo PagDepix, o beneficiário pode levar <strong>até 3 dias úteis</strong> para reconhecer o crédito.
                </div>
              </div>

              <button
                onClick={() => navigate('/historico')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-app-elevated border border-app-stroke text-app-text font-semibold rounded-xl hover:bg-app-stroke/60 text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver em Histórico
              </button>

              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 py-3 bg-bitcoin text-black font-bold rounded-xl hover:bg-bitcoin/90 text-sm transition-all"
              >
                <Plus className="w-4 h-4" /> Pagar outra conta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
