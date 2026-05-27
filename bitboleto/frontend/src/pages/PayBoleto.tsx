import { useState, useRef, useCallback, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, FileText, Calculator, Copy, Check,
  AlertCircle, Loader2, QrCode as QrCodeIcon, Tag, X,
  ArrowRight, Scan, Clock, Calendar, ExternalLink,
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, formatCryptoAmount, type Currency } from '../components/CurrencySelector';
import { RateLockCountdown } from '../components/RateLockCountdown';

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseAmount(value: string): number {
  if (!value) return NaN;
  const s = value.trim().replace(/\s/g, '');
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(n) || NaN;
}

function isWithinBusinessHours(): boolean {
  const now = new Date();
  const bStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour12: false });
  const b = new Date(bStr);
  const day = b.getDay(); // 0=Dom 6=Sáb
  const h = b.getHours();
  return day >= 1 && day <= 5 && h >= 9 && h < 18;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function newItem(): BoletoItem {
  return {
    id: uid(),
    barcode: '',
    amount: '',
    dueDate: '',
  };
}

// ─── types ────────────────────────────────────────────────────────────────────

interface BoletoItem {
  id: string;
  barcode: string;
  amount: string;
  dueDate: string;
}

interface DecodedInfo {
  value: number;
  dueDate: string | null;
  companyName: string | null;
  beneficiaryName: string | null;
  beneficiaryCpfCnpj: string | null;
  bank: string | null;
  discountValue: number;
  interestValue: number;
  fineValue: number;
  allowChangeValue: boolean;
  isOverdue: boolean;
}

interface Preview {
  isValid: boolean;
  fee: number;
  feeBeforeCoupon?: number;
  totalAmount: number;
  amount: number;
  percentageFormatted: string;
  fixedFee: number;
  cupomValido?: boolean;
  descontoAplicado?: string;
  discountAmount?: number;
  cryptoAmount?: number;
  exchangeRate?: number;
}

// Batch = lote criado no backend com um único endereço de pagamento
interface BatchState {
  id: string;
  itemCount: number;
  totalBoletos: number;
  totalFee: number;
  grandTotal: number;
  walletAddress: string;
  qrCode: string;
  paymentCurrency: string;
  cryptoAmount: string | null;
  depixAmount: number | null;
  exchangeRate: number | null;
  rateLockExpiresAt: string | null;
  boletos: Array<{
    id: string;
    barcode: string | null;
    pdfUrl: string | null;
    amount: number;
    fee: number;
    totalAmount: number;
    dueDate: string;
    status: string;
  }>;
}

// ─── constants ────────────────────────────────────────────────────────────────

const MAX_BOLETOS = 5;

const inputCls =
  'w-full px-3.5 py-2.5 bg-app-elevated border border-app-stroke rounded-xl text-app-text placeholder-app-subtle text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all disabled:opacity-50';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50';

// ─── StepBar ─────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  const steps = ['Boletos', 'Resumo', 'Pagamento'];
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
                done
                  ? 'bg-bitcoin text-black'
                  : active
                    ? 'bg-bitcoin/15 border-2 border-bitcoin text-bitcoin'
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

// ─── helpers de conversão ─────────────────────────────────────────────────────

interface Rates { usdBrl: number; btcBrl: number; }

function fmtCryptoPreview(totalBRL: number, currency: Currency, rates: Rates | null): string | null {
  if (!rates || currency === 'DEPIX') return null;
  if (currency === 'USDT') {
    const usdt = totalBRL / rates.usdBrl;
    return `≈ ${usdt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }
  if (currency === 'BTC') {
    const sats = Math.round((totalBRL / rates.btcBrl) * 100_000_000);
    return `≈ ${sats.toLocaleString('pt-BR')} sats`;
  }
  return null;
}

// ─── PreviewBox ───────────────────────────────────────────────────────────────

function PreviewBox({ preview, loading, paymentCurrency, rates }: {
  preview: Preview | null;
  loading?: boolean;
  paymentCurrency?: Currency;
  rates?: Rates | null;
}) {
  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-xs text-app-muted animate-pulse">
        <Loader2 className="w-3 h-3 animate-spin" /> Calculando...
      </div>
    );
  }
  if (!preview?.isValid) return null;
  const cryptoLine = paymentCurrency && rates
    ? fmtCryptoPreview(preview.totalAmount, paymentCurrency, rates)
    : null;
  return (
    <div className="mt-2 p-2.5 bg-bitcoin/5 border border-bitcoin/20 rounded-lg text-xs space-y-1">
      {preview.cupomValido ? (
        <>
          <div className="flex justify-between text-app-muted">
            <span>Taxa original</span>
            <span className="line-through">{fmtBRL(preview.feeBeforeCoupon ?? preview.fee)}</span>
          </div>
          <div className="flex justify-between text-green-500 dark:text-green-400">
            <span>Taxa c/ desconto ({preview.descontoAplicado})</span>
            <span className="font-semibold">{fmtBRL(preview.fee)}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between text-app-muted">
          <span>Taxa ({preview.percentageFormatted} + {fmtBRL(preview.fixedFee)})</span>
          <span className="text-bitcoin font-semibold">{fmtBRL(preview.fee)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-app-text border-t border-app-stroke/50 pt-1">
        <span>Total</span>
        <div className="text-right">
          <span className="text-bitcoin">{fmtBRL(preview.totalAmount)}</span>
          {cryptoLine && (
            <p className="text-[10px] font-normal text-app-muted mt-0.5">{cryptoLine}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={`p-1.5 rounded-lg bg-bitcoin/10 hover:bg-bitcoin/20 transition-colors flex-shrink-0 ${focusRing}`}
      title="Copiar"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5 text-bitcoin" />}
    </button>
  );
}

// ─── BoletoCard ───────────────────────────────────────────────────────────────

function BoletoCard({
  item, index, total, preview, previewLoading, decoded, decodeLoading, decodeError, onChange, onRemove, paymentCurrency, rates,
}: {
  item: BoletoItem;
  index: number;
  total: number;
  preview: Preview | null;
  previewLoading: boolean;
  decoded: DecodedInfo | null;
  decodeLoading: boolean;
  decodeError: string;
  onChange: (patch: Partial<BoletoItem>) => void;
  onRemove: () => void;
  paymentCurrency: Currency;
  rates: Rates | null;
}) {
  return (
    <div className="bg-app-surface border border-app-stroke rounded-xl overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-app-elevated border-b border-app-stroke">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-bitcoin/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-bitcoin">{index + 1}</span>
          </div>
          <span className="text-xs font-semibold text-app-muted uppercase tracking-wide">Boleto {index + 1}</span>
        </div>
        {total > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-app-muted hover:text-red-400 transition-colors"
            title="Remover boleto"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Barcode input */}
        <div className="space-y-1.5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Scan className="w-3.5 h-3.5 text-app-muted" />
            </span>
            <input
              type="text"
              value={item.barcode}
              onChange={(e) => onChange({ barcode: e.target.value })}
              placeholder="00000.00000 00000.000000 00000.000000 0 …"
              className={`${inputCls} font-mono text-xs pl-8 pr-8`}
            />
            {decodeLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-bitcoin animate-spin" />
            )}
          </div>

          {decoded && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                <span className="text-xs text-green-400 font-medium truncate">
                  {decoded.beneficiaryName || decoded.companyName || 'Boleto identificado'}
                </span>
                {decoded.isOverdue && (
                  <span className="ml-auto text-[10px] font-semibold text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded flex-shrink-0">
                    Vencido
                  </span>
                )}
              </div>
              <div className="px-2.5 py-2 bg-app-elevated border border-app-stroke rounded-lg space-y-1 text-[11px]">
                {item.amount && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Valor</span>
                    <span className="text-app-text font-semibold">{fmtBRL(parseAmount(item.amount))}</span>
                  </div>
                )}
                {item.dueDate && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Vencimento</span>
                    <span className={`font-medium ${decoded.isOverdue ? 'text-amber-400' : 'text-app-text'}`}>
                      {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                )}
                {(decoded.beneficiaryName || decoded.companyName) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Beneficiário</span>
                    <span className="text-app-text font-medium text-right truncate max-w-[60%]">
                      {decoded.beneficiaryName || decoded.companyName}
                    </span>
                  </div>
                )}
                {decoded.beneficiaryCpfCnpj && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">CPF/CNPJ</span>
                    <span className="text-app-text font-mono">{decoded.beneficiaryCpfCnpj}</span>
                  </div>
                )}
                {decoded.bank && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Banco</span>
                    <span className="text-app-text">{decoded.bank}</span>
                  </div>
                )}
                {decoded.discountValue > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Desconto</span>
                    <span className="text-green-400 font-medium">- {fmtBRL(decoded.discountValue)}</span>
                  </div>
                )}
                {decoded.interestValue > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Juros</span>
                    <span className="text-amber-400 font-medium">+ {fmtBRL(decoded.interestValue)}</span>
                  </div>
                )}
                {decoded.fineValue > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-app-subtle">Multa</span>
                    <span className="text-amber-400 font-medium">+ {fmtBRL(decoded.fineValue)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {decodeError && (
            <p className="text-[10px] text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" /> {decodeError}
            </p>
          )}
        </div>

        <PreviewBox preview={preview} loading={previewLoading} paymentCurrency={paymentCurrency} rates={rates} />
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PayBoleto() {
  const { triggerPushActivation } = useNotifications();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<BoletoItem[]>([newItem()]);
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DEPIX');

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [referralAutoApplied, setReferralAutoApplied] = useState(false);

  const [previews, setPreviews] = useState<Record<string, Preview | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});

  const [decodedItems, setDecodedItems] = useState<Record<string, DecodedInfo | null>>({});
  const [decodeLoading, setDecodeLoading] = useState<Record<string, boolean>>({});
  const [decodeError, setDecodeError] = useState<Record<string, string>>({});

  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [rates, setRates] = useState<Rates | null>(null);

  const couponRef = useRef<HTMLInputElement>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const decodeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detectar indicação + buscar câmbio
  useEffect(() => {
    api.get('/user/referral').then(({ data }) => {
      if (data.referredByCode) setReferralAutoApplied(true);
    }).catch(() => {});
    api.get('/rates').then(({ data }) => {
      if (data?.usdBrl && data?.btcBrl) setRates({ usdBrl: data.usdBrl, btcBrl: data.btcBrl });
    }).catch(() => {});
  }, []);

  // Polling automático de pagamento quando no step 3
  useEffect(() => {
    if (step !== 3 || !batch || paymentDetected) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/boleto/batch/${batch.id}`);
        // Detecta tanto TXID_SUBMITTED (crypto recebido, admin pendente) quanto PAID (aprovado)
        const batchPaid = data.batch?.status === 'PAID';
        const anyDetected = data.batch?.boletos?.some(
          (b: any) => b.status === 'TXID_SUBMITTED' || b.status === 'PAID',
        );
        if (batchPaid || anyDetected) {
          setPaymentDetected(true);
          triggerPushActivation('boleto');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {}
    };
    poll(); // primeira checagem imediata
    pollingRef.current = setInterval(poll, 8000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [step, batch, paymentDetected, triggerPushActivation]);

  // Preview por item
  const fetchPreviewForItem = useCallback(
    (item: BoletoItem, coupon: string | null) => {
      const val = parseAmount(item.amount);
      if (!Number.isFinite(val) || val < 20) {
        setPreviews((p) => ({ ...p, [item.id]: null }));
        setPreviewLoading((l) => ({ ...l, [item.id]: false }));
        return;
      }
      setPreviewLoading((l) => ({ ...l, [item.id]: true }));
      api
        .post('/boleto/calculate', {
          amount: val,
          couponCode: coupon?.trim() || undefined,
          paymentCurrency,
        })
        .then(({ data }) => {
          setPreviews((p) => ({ ...p, [item.id]: data.isValid ? data : null }));
        })
        .catch(() => {
          setPreviews((p) => ({ ...p, [item.id]: null }));
        })
        .finally(() => {
          setPreviewLoading((l) => ({ ...l, [item.id]: false }));
        });
    },
    [paymentCurrency],
  );

  const triggerPreview = useCallback(
    (item: BoletoItem, coupon: string | null) => {
      if (debounceTimers.current[item.id]) clearTimeout(debounceTimers.current[item.id]);
      debounceTimers.current[item.id] = setTimeout(
        () => fetchPreviewForItem(item, coupon),
        300,
      );
    },
    [fetchPreviewForItem],
  );

  // Re-trigger quando moeda ou cupom muda
  useEffect(() => {
    items.forEach((item) => triggerPreview(item, appliedCoupon));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentCurrency, appliedCoupon]);

  const fetchDecodeForItem = useCallback(async (item: BoletoItem) => {
    setDecodeLoading((l) => ({ ...l, [item.id]: true }));
    setDecodeError((e) => ({ ...e, [item.id]: '' }));
    try {
      const { data } = await api.post('/boleto/decode', { barcode: item.barcode });
      setDecodedItems((d) => ({ ...d, [item.id]: data }));
      setDecodeError((e) => ({ ...e, [item.id]: '' }));
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== item.id) return it;
          const newAmount = data.value > 0 ? String(data.value) : it.amount;
          const newDueDate = data.dueDate ?? it.dueDate;
          const updated = { ...it, amount: newAmount, dueDate: newDueDate };
          triggerPreview(updated, appliedCoupon);
          return updated;
        }),
      );
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Não foi possível identificar o boleto. Verifique o código digitado.';
      setDecodeError((e) => ({ ...e, [item.id]: msg }));
      setDecodedItems((d) => ({ ...d, [item.id]: null }));
    } finally {
      setDecodeLoading((l) => ({ ...l, [item.id]: false }));
    }
  }, [appliedCoupon, triggerPreview]);

  const triggerDecode = useCallback((item: BoletoItem) => {
    if (decodeTimers.current[item.id]) clearTimeout(decodeTimers.current[item.id]);
    const digits = item.barcode.replace(/\D/g, '');
    if (digits.length < 44) {
      setDecodedItems((d) => ({ ...d, [item.id]: null }));
      setDecodeError((e) => ({ ...e, [item.id]: '' }));
      return;
    }
    decodeTimers.current[item.id] = setTimeout(() => fetchDecodeForItem(item), 500);
  }, [fetchDecodeForItem]);

  const updateItem = (id: string, patch: Partial<BoletoItem>) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, ...patch };
        if ('barcode' in patch) triggerDecode(updated);
        return updated;
      }),
    );
  };

  const addItem = () => {
    if (items.length >= MAX_BOLETOS) return;
    setItems((prev) => [...prev, newItem()]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setPreviews((p) => { const n = { ...p }; delete n[id]; return n; });
    setPreviewLoading((l) => { const n = { ...l }; delete n[id]; return n; });
    setDecodedItems((d) => { const n = { ...d }; delete n[id]; return n; });
    setDecodeLoading((l) => { const n = { ...l }; delete n[id]; return n; });
    setDecodeError((e) => { const n = { ...e }; delete n[id]; return n; });
  };


  // Cupom
  const handleApplyCoupon = async () => {
    const code = (couponRef.current?.value ?? couponCode).trim().toUpperCase();
    if (!code) { setCouponError('Digite o código do cupom.'); return; }
    const first = items[0];
    const val = parseAmount(first.amount);
    if (!Number.isFinite(val) || val < 20) {
      setCouponError('Informe o valor do primeiro boleto antes de aplicar.');
      return;
    }
    setApplyingCoupon(true);
    setCouponError('');
    try {
      const { data } = await api.post('/boleto/calculate', { amount: val, couponCode: code, paymentCurrency });
      if (data.isValid && data.cupomValido) {
        setAppliedCoupon(code);
        setCouponCode(code);
      } else {
        setAppliedCoupon(null);
        setCouponError(
          data.couponError ||
          data.error ||
          (data.isValid && !data.cupomValido
            ? `Cupom não aplicável para este boleto (valor mínimo: R$ 40,00)`
            : 'Cupom inválido ou inativo.')
        );
      }
    } catch (e: any) {
      setCouponError(e.response?.data?.error || 'Erro ao validar cupom.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  // Validação
  const validate = (): string | null => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const label = items.length > 1 ? `Boleto ${i + 1}` : 'Boleto';
      if (!it.barcode.trim())
        return `${label}: informe o código de barras.`;
      if (!decodedItems[it.id])
        return `${label}: aguarde a identificação do boleto.`;
      const amt = parseAmount(it.amount);
      if (!Number.isFinite(amt) || amt <= 0)
        return `${label}: boleto sem valor identificado.`;
      if (!it.dueDate)
        return `${label}: boleto sem data de vencimento identificada.`;
    }
    return null;
  };

  // Step 1 → 2
  const handleContinue = () => {
    setGlobalError('');
    const err = validate();
    if (err) { setGlobalError(err); return; }
    setStep(2);
  };

  // Step 2 → 3: criar lote unificado (um único endereço/QR para todos)
  const handleCreateAll = async () => {
    setGlobalError('');
    setGlobalLoading(true);
    try {
      const { data } = await api.post('/boleto/batch/create', {
        items: items.map((it) => ({
          barcode: it.barcode,
          amount: parseAmount(it.amount),
          dueDate: it.dueDate,
        })),
        couponCode: appliedCoupon || undefined,
        paymentCurrency,
      });

      setBatch(data.batch);
      setStep(3);
    } catch (e: any) {
      setGlobalError(e.response?.data?.error || 'Erro ao criar lote de boletos. Tente novamente.');
    } finally {
      setGlobalLoading(false);
    }
  };

  // Total estimado (soma dos previews)
  const totalEstimated = items.reduce((sum, it) => {
    const p = previews[it.id];
    return sum + (p?.totalAmount ?? 0);
  }, 0);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 md:py-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 bg-bitcoin/10 rounded-xl">
          <FileText className="w-5 h-5 text-bitcoin" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-app-text leading-tight">Pagar Boleto</h1>
          <p className="text-xs text-app-muted">Pague com DEPIX, USDT ou BTC</p>
        </div>
      </div>

      <StepBar step={step} />

      {/* ══ STEP 1 — Boletos ══════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-3">

          {/* Lista de boletos */}
          {items.map((item, i) => (
            <BoletoCard
              key={item.id}
              item={item}
              index={i}
              total={items.length}
              preview={previews[item.id] ?? null}
              previewLoading={!!previewLoading[item.id]}
              decoded={decodedItems[item.id] ?? null}
              decodeLoading={!!decodeLoading[item.id]}
              decodeError={decodeError[item.id] ?? ''}
              onChange={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              paymentCurrency={paymentCurrency}
              rates={rates}
            />
          ))}

          {/* Moeda + cupom */}
          <div className="bg-app-surface border border-app-stroke rounded-xl p-4 space-y-4">
            <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />

            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-app-subtle mb-1.5">
                <Tag className="w-3 h-3" /> Cupom de desconto (opcional)
              </label>
              <div className="flex gap-2">
                <input
                  ref={couponRef}
                  type="text"
                  placeholder="Código do cupom"
                  value={couponCode}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setCouponCode(v);
                    setCouponError('');
                    if (appliedCoupon && v !== appliedCoupon) setAppliedCoupon(null);
                  }}
                  className={`${inputCls} flex-1 min-w-0`}
                  disabled={!!appliedCoupon}
                />
                {appliedCoupon ? (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" /> Remover
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={applyingCoupon || !couponCode.trim()}
                    className="px-3 py-2 bg-bitcoin/10 hover:bg-bitcoin/20 text-bitcoin rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    {applyingCoupon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aplicar
                  </button>
                )}
              </div>
              {appliedCoupon && (
                <p className="mt-1.5 text-xs text-green-500 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Cupom <strong>{appliedCoupon}</strong> aplicado
                </p>
              )}
              {referralAutoApplied && !appliedCoupon && (
                <p className="mt-1.5 text-xs text-bitcoin flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Desconto de indicação aplicado automaticamente (20% off)
                </p>
              )}
              {couponError && (
                <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {couponError}
                </p>
              )}
            </div>
          </div>

          {/* Adicionar boleto */}
          {items.length < MAX_BOLETOS && (
            <button
              type="button"
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-app-stroke hover:border-bitcoin/40 text-app-muted hover:text-bitcoin rounded-xl text-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Adicionar outro boleto
              <span className="text-app-subtle text-xs">({items.length}/{MAX_BOLETOS})</span>
            </button>
          )}

          {/* Total estimado */}
          {totalEstimated > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-bitcoin/5 border border-bitcoin/20 rounded-xl">
              <span className="text-sm text-app-muted">
                {items.length > 1 ? `Total estimado (${items.length} boletos)` : 'Total estimado'}
              </span>
              <div className="text-right">
                <span className="text-lg font-bold text-bitcoin">{fmtBRL(totalEstimated)}</span>
                {fmtCryptoPreview(totalEstimated, paymentCurrency, rates) && (
                  <p className="text-xs font-normal text-app-muted mt-0.5">
                    {fmtCryptoPreview(totalEstimated, paymentCurrency, rates)}
                  </p>
                )}
              </div>
            </div>
          )}

          {globalError && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleContinue}
            disabled={items.some((it) => !decodedItems[it.id] || !it.amount || !it.dueDate)}
            className={`w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 transition-all text-sm shadow-sm shadow-bitcoin/20 ${focusRing}`}
          >
            <Calculator className="w-4 h-4" />
            Ver Resumo
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ══ STEP 2 — Resumo ═══════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-app-surface border border-app-stroke rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-app-elevated border-b border-app-stroke">
              <h2 className="text-sm font-bold text-app-text">Resumo do Pagamento</h2>
              <p className="text-xs text-app-muted mt-0.5">Confira todos os valores antes de gerar os QR Codes</p>
            </div>

            <div className="divide-y divide-app-stroke">
              {items.map((item, i) => {
                const p = previews[item.id];
                const amt = parseAmount(item.amount);
                return (
                  <div key={item.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-5 h-5 rounded-full bg-bitcoin/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-bitcoin">{i + 1}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-app-muted font-mono truncate">
                            {item.barcode.slice(0, 32) + (item.barcode.length > 32 ? '…' : '')}
                          </p>
                          <p className="text-[10px] text-app-subtle">Venc. {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-app-text flex-shrink-0">{fmtBRL(amt)}</span>
                    </div>
                    {p?.isValid && (
                      <div className="ml-7 bg-app-elevated rounded-lg px-3 py-2 space-y-1 text-xs">
                        {p.cupomValido ? (
                          <>
                            <div className="flex justify-between text-app-muted">
                              <span>Taxa original</span>
                              <span className="line-through">{fmtBRL(p.feeBeforeCoupon ?? p.fee)}</span>
                            </div>
                            <div className="flex justify-between text-green-500 dark:text-green-400">
                              <span>Taxa c/ desconto ({p.descontoAplicado})</span>
                              <span className="font-semibold">{fmtBRL(p.fee)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between text-app-muted">
                            <span>Taxa ({p.percentageFormatted} + {fmtBRL(p.fixedFee)})</span>
                            <span className="text-bitcoin font-semibold">{fmtBRL(p.fee)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-app-text border-t border-app-stroke pt-1">
                          <span>Subtotal</span>
                          <span>{fmtBRL(p.totalAmount)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total */}
            {totalEstimated > 0 && (
              <div className="px-4 py-4 bg-gradient-to-r from-bitcoin/10 to-orange-500/5 border-t border-bitcoin/20 flex justify-between items-center">
                <div>
                  <p className="text-xs text-app-muted">
                    {items.length > 1 ? `${items.length} boletos` : '1 boleto'}
                  </p>
                  <p className="font-bold text-app-text">Total a pagar</p>
                </div>
                <span className="text-2xl font-black text-bitcoin">{fmtBRL(totalEstimated)}</span>
              </div>
            )}
          </div>

          {globalError && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{globalError}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`flex-1 py-3 bg-app-elevated border border-app-stroke text-app-text font-semibold rounded-xl hover:bg-app-stroke/60 text-sm transition-colors ${focusRing}`}
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleCreateAll}
              disabled={globalLoading}
              className={`flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 transition-all text-sm ${focusRing}`}
            >
              {globalLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
              ) : (
                <><QrCodeIcon className="w-4 h-4" /> {items.length > 1 ? 'Gerar QR Codes' : 'Gerar QR Code'}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP 3 — Pagamento único ══════════════════════════════════════════ */}
      {step === 3 && batch && (
        <div className="space-y-4">

          {/* Resumo compacto dos boletos do lote */}
          <div className="bg-app-surface border border-app-stroke rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-app-elevated border-b border-app-stroke flex items-center justify-between">
              <span className="text-xs font-semibold text-app-muted uppercase tracking-wide">
                {batch.itemCount} boleto{batch.itemCount > 1 ? 's' : ''} neste pagamento
              </span>
              <span className="text-sm font-bold text-bitcoin">{fmtBRL(batch.grandTotal)}</span>
            </div>
            <div className="divide-y divide-app-stroke">
              {batch.boletos.map((b, i) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 rounded-full bg-bitcoin/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-bitcoin">{i + 1}</span>
                    </div>
                    <span className="text-xs text-app-muted font-mono truncate">
                      {b.barcode ? b.barcode.slice(0, 24) + '…' : 'PDF'}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-app-text">{fmtBRL(b.amount)}</p>
                    <p className="text-[10px] text-app-muted">+ {fmtBRL(b.fee)} taxa</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Instruções de pagamento */}
          <div className="bg-app-surface border border-app-stroke rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-app-elevated border-b border-app-stroke">
              <h2 className="text-sm font-bold text-app-text">Envie o pagamento único</h2>
              <p className="text-xs text-app-muted mt-0.5">
                Um único pagamento cobre todos os {batch.itemCount} boleto{batch.itemCount > 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-4 space-y-4">
              {batch.rateLockExpiresAt && (
                <RateLockCountdown expiresAt={batch.rateLockExpiresAt} onExpire={() => {}} />
              )}

              {/* QR Code */}
              {batch.qrCode && (
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-2xl shadow-md inline-block">
                    <img src={batch.qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
              )}

              {/* Endereço */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-app-subtle font-semibold mb-1.5">
                  Endereço de pagamento
                </p>
                <div className="flex items-center gap-2 p-2.5 bg-app-elevated rounded-xl border border-app-stroke">
                  <code className="flex-1 text-xs font-mono text-bitcoin break-all min-w-0">
                    {batch.walletAddress}
                  </code>
                  <CopyButton text={batch.walletAddress} />
                </div>
              </div>

              {/* Valor exato */}
              <div className="flex items-center justify-between p-3 bg-bitcoin/5 border border-bitcoin/20 rounded-xl">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-app-subtle font-semibold mb-0.5">
                    Envie exatamente
                  </p>
                  {batch.exchangeRate && (
                    <p className="text-[10px] text-app-subtle">
                      {batch.paymentCurrency === 'USDT'
                        ? `Câmbio: 1 USD = R$ ${batch.exchangeRate.toFixed(2).replace('.', ',')}`
                        : `Câmbio: 1 BTC = R$ ${batch.exchangeRate.toLocaleString('pt-BR')}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold font-mono text-bitcoin">
                    {batch.cryptoAmount
                      ? formatCryptoAmount(batch.paymentCurrency as any, batch.cryptoAmount)
                      : `${Number(batch.depixAmount).toFixed(8).replace(/\.?0+$/, '')} DPX`}
                  </p>
                  <CopyButton text={batch.cryptoAmount ?? String(batch.depixAmount)} />
                </div>
              </div>

              {/* Aviso */}
              <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400 leading-relaxed">
                  Envie <strong>exatamente</strong> o valor indicado para o endereço acima.
                  Um único pagamento quita todos os {batch.itemCount} boleto{batch.itemCount > 1 ? 's' : ''} do lote.
                </p>
              </div>

              {/* Status do pagamento */}
              {!paymentDetected ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Loader2 className="w-7 h-7 text-bitcoin animate-spin" />
                  <p className="text-sm font-semibold text-app-text">Aguardando identificação do pagamento…</p>
                  <p className="text-xs text-app-muted text-center leading-relaxed">
                    Identificamos automaticamente em até 2 minutos após o envio.
                    <br />Pode fechar esta página — o pagamento fica salvo e você acompanha em <strong>Histórico</strong>.
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
                            ⏰ Fora do horário comercial — seu boleto será agendado para o próximo dia útil.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-app-stroke pt-3 text-app-muted leading-relaxed">
                      Após o pagamento pelo PagDepix, o beneficiário pode levar <strong>até 3 dias úteis</strong> para reconhecer o crédito.
                    </div>
                  </div>

                  {/* Link comprovante */}
                  <button
                    type="button"
                    onClick={() => navigate('/historico')}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-app-elevated border border-app-stroke text-app-text font-semibold rounded-xl hover:bg-app-stroke/60 text-sm transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver comprovante em Histórico
                  </button>

                  {/* Novo pagamento */}
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:opacity-95 active:scale-[0.99] text-sm transition-all"
                  >
                    <Plus className="w-4 h-4" /> Fazer Novo Pagamento
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
