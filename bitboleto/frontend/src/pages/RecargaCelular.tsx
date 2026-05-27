import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Download,
  Edit3,
  Lock,
  Calculator,
  Bitcoin,
  QrCode as QrCodeIcon,
  Tag,
  X,
  Clock,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, formatCryptoAmount, type Currency } from '../components/CurrencySelector';
import { RateLockCountdown } from '../components/RateLockCountdown';

function isWithinBusinessHours(): boolean {
  const now = new Date();
  const bStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour12: false });
  const b = new Date(bStr);
  const day = b.getDay();
  const h = b.getHours();
  return day >= 1 && day <= 5 && h >= 9 && h < 18;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-600 text-white placeholder-gray-500 text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all touch-manipulation';

const COUNTRY_CODE = '+55';

interface RechargeItem {
  id: string;
  operator?: string;
  phoneNumber?: string;
  amount?: number;
  fee?: number;
  totalAmount?: number;
  depixAmount?: number;
  walletAddress?: string;
  status?: string;
  txid?: string | null;
  receiptUrl?: string | null;
  couponUsed?: string | null;
  createdAt?: string;
  paidAt?: string | null;
}

const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99
]);

interface Operator {
  id: string;
  name: string;
  values: number[];
}

const FALLBACK_OPERATORS: Operator[] = [
  { id: 'Vivo',  name: 'Vivo',  values: [10, 15, 20, 30] },
  { id: 'Claro', name: 'Claro', values: [10, 13, 20, 30] },
  { id: 'Oi',    name: 'Oi',    values: [10, 14, 15, 20] },
  { id: 'TIM',   name: 'TIM',   values: [10, 15, 20, 30] },
];

function formatPhoneDisplay(digits: string): string {
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

function validatePhoneDigits(digits: string): { valid: boolean; error?: string } {
  if (digits.length !== 11) return { valid: false, error: 'Informe 11 dígitos (DDD + número com 9).' };
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (!VALID_DDDS.has(ddd)) return { valid: false, error: 'DDD inválido.' };
  if (digits[2] !== '9') return { valid: false, error: 'Celular deve começar com 9 após o DDD.' };
  return { valid: true };
}

/** Cálculo local da taxa (2% + R$ 0,99) igual ao backend, para exibir no passo 2 quando a API não responder */
function localRechargeCalc(amount: number): { fee: number; totalAmount: number; depixAmount: number } {
  const fee = Math.ceil((amount * 0.02 + 0.99) * 100) / 100;
  const totalAmount = Math.ceil((amount + fee) * 100) / 100;
  return { fee, totalAmount, depixAmount: totalAmount };
}

const MIN_RECHARGE_AMOUNT = 10;

export default function RecargaCelular() {
  const { triggerPushActivation } = useNotifications();
  const navigate = useNavigate();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [operatorId, setOperatorId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recharge, setRecharge] = useState<RechargeItem | null>(null);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rechargeList, setRechargeList] = useState<RechargeItem[]>([]);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editPhoneDigits, setEditPhoneDigits] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [previewCalc, setPreviewCalc] = useState<{
    fee: number;
    totalAmount: number;
    depixAmount: number;
    cupomValido?: boolean;
    descontoAplicado?: string;
    paymentCurrency?: string;
    exchangeRate?: number | null;
    cryptoAmount?: string | null;
  } | null>(null);
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DEPIX');
  const [couponError, setCouponError] = useState('');
  const providerLoading = false;
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [referralAutoApplied, setReferralAutoApplied] = useState(false);
  const calcRequestRef = useRef<string>('');
  const couponInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-fill indicação
  useEffect(() => {
    api.get('/user/referral').then(({ data }) => {
      if (data.referredByCode) setReferralAutoApplied(true);
    }).catch(() => {});
  }, []);

  // Polling automático de pagamento quando no step 3
  useEffect(() => {
    if (step !== 3 || !recharge?.id || paymentDetected) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/recharge/${recharge.id}`);
        if (data?.status === 'PAID') {
          setPaymentDetected(true);
          triggerPushActivation('recarga');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {}
    };
    poll();
    pollingRef.current = setInterval(poll, 8000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [step, recharge?.id, paymentDetected, triggerPushActivation]);

  const selectedOperator = operators.find((o) => o.id === operatorId);
  const debounceMs = 300; // Reduzido para mobile (teclado causava muitas re-renders)
  const numAmount = amount === '' ? 0 : Number(amount);

  useEffect(() => {
    api.get('/recharge/operators')
      .then((res) => {
        const data = res.data as { operators?: Operator[] } | Operator[];
        const list = Array.isArray(data) ? data : (data?.operators ?? []);
        setOperators(Array.isArray(list) && list.length > 0 ? list : FALLBACK_OPERATORS);
      })
      .catch(() => setOperators(FALLBACK_OPERATORS))
      .finally(() => setLoadingOps(false));
  }, []);

  useEffect(() => {
    api.get<{ recharges?: RechargeItem[] }>('/recharge/list')
      .then((res) => setRechargeList(res.data?.recharges ?? []))
      .catch(() => {});
  }, []);

  const fetchPreview = (couponToUse?: string | null, onError?: (msg: string) => void) => {
    if (numAmount < MIN_RECHARGE_AMOUNT || !selectedOperator?.values?.includes(numAmount)) return;
    const coupon = couponToUse ?? appliedCoupon;
    const requestKey = `${numAmount}-${coupon || ''}-${paymentCurrency}`;
    calcRequestRef.current = requestKey;
    setCouponError('');
    api.post('/recharge/calculate', {
      amount: numAmount,
      couponCode: coupon?.trim() || undefined,
      paymentCurrency,
    })
      .then(({ data }) => {
        if (calcRequestRef.current !== requestKey) return;
        if (data.isValid) {
          setPreviewCalc({
            fee: data.fee,
            totalAmount: data.totalAmount,
            depixAmount: data.depixAmount,
            cupomValido: data.cupomValido,
            descontoAplicado: data.descontoAplicado,
            paymentCurrency: data.paymentCurrency,
            exchangeRate: data.exchangeRate,
            cryptoAmount: data.cryptoAmount,
          });
        } else {
          setPreviewCalc(null);
          if (coupon?.trim() && data.error) onError?.(data.error);
        }
      })
      .catch((err) => {
        if (calcRequestRef.current === requestKey) {
          setPreviewCalc(null);
          const msg = err.response?.data?.error || 'Erro ao calcular. Tente novamente.';
          onError?.(msg);
        }
      });
  };

  useEffect(() => {
    if (numAmount < MIN_RECHARGE_AMOUNT || !selectedOperator?.values?.includes(numAmount)) {
      setPreviewCalc(null);
      setCouponError('');
      return;
    }
    const t = setTimeout(() => fetchPreview(undefined, setCouponError), debounceMs);
    return () => clearTimeout(t);
  }, [numAmount, appliedCoupon, selectedOperator, paymentCurrency]);

  const handleApplyCoupon = async () => {
    const code = couponInputRef.current?.value?.trim() ?? couponCode.trim();
    if (!code) {
      setCouponError('Digite o código do cupom.');
      return;
    }
    if (numAmount < MIN_RECHARGE_AMOUNT || !selectedOperator?.values?.includes(numAmount)) {
      setCouponError('Selecione operadora e valor antes de aplicar o cupom.');
      return;
    }
    setApplyingCoupon(true);
    setCouponError('');
    try {
      const { data } = await api.post('/recharge/calculate', {
        amount: numAmount,
        couponCode: code,
        paymentCurrency,
      });
      if (data.isValid) {
        setCouponCode(code.toUpperCase());
        setAppliedCoupon(code.toUpperCase());
        setPreviewCalc({
          fee: data.fee,
          totalAmount: data.totalAmount,
          depixAmount: data.depixAmount,
          cupomValido: data.cupomValido,
          descontoAplicado: data.descontoAplicado,
          paymentCurrency: data.paymentCurrency,
          exchangeRate: data.exchangeRate,
          cryptoAmount: data.cryptoAmount,
        });
      } else {
        setAppliedCoupon(null);
        setPreviewCalc(null);
        setCouponError(data.error || 'Cupom inválido ou inativo.');
      }
    } catch (err: any) {
      setAppliedCoupon(null);
      setPreviewCalc(null);
      setCouponError(err.response?.data?.error || 'Erro ao validar cupom. Tente novamente.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
    couponInputRef.current?.focus();
  };

  useEffect(() => {
    if (step !== 2) return;
    if (numAmount < MIN_RECHARGE_AMOUNT || !selectedOperator?.values?.includes(numAmount)) return;
    let cancelled = false;
    const coupon = appliedCoupon?.trim();
    const requestKey = `${numAmount}-${coupon || ''}-${paymentCurrency}`;
    calcRequestRef.current = requestKey;
    setCouponError('');
    api.post('/recharge/calculate', {
      amount: numAmount,
      couponCode: coupon || undefined,
      paymentCurrency,
    })
      .then(({ data }) => {
        if (cancelled || !data.isValid) return;
        if (calcRequestRef.current !== requestKey) return;
        setPreviewCalc({
          fee: data.fee,
          totalAmount: data.totalAmount,
          depixAmount: data.depixAmount,
          cupomValido: data.cupomValido,
          descontoAplicado: data.descontoAplicado,
          paymentCurrency: data.paymentCurrency,
          exchangeRate: data.exchangeRate,
          cryptoAmount: data.cryptoAmount,
        });
      })
      .catch((err) => {
        if (!cancelled && calcRequestRef.current === requestKey && coupon) {
          setCouponError(err.response?.data?.error || 'Erro ao calcular desconto. Toque para tentar novamente.');
        }
      });
    return () => { cancelled = true; };
  }, [step, numAmount, appliedCoupon, selectedOperator, paymentCurrency]);

  const handlePhoneInput = (value: string) => {
    setPhoneDigits(value.replace(/\D/g, '').slice(0, 11));
    setError('');
  };


  const goToResumo = () => {
    setError('');
    const phoneValidation = validatePhoneDigits(phoneDigits);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error ?? 'Erro na validação do número.');
      return;
    }
    if (!operatorId || !amount) {
      setError('Selecione operadora e valor.');
      return;
    }
    const numAmt = Number(amount);
    if (selectedOperator && !selectedOperator.values.includes(numAmt)) {
      setError('Selecione um valor válido para a operadora.');
      return;
    }
    setStep(2);
  };

  const handleCreateRecharge = async () => {
    setError('');
    const phoneValidation = validatePhoneDigits(phoneDigits);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error ?? 'Erro na validação do número.');
      return;
    }
    if (!operatorId || !amount) {
      setError('Selecione operadora e valor.');
      return;
    }
    const numAmt = Number(amount);
    if (selectedOperator && !selectedOperator.values.includes(numAmt)) {
      setError('Selecione um valor válido para a operadora.');
      return;
    }
    setLoading(true);
    try {
      const couponToSend = appliedCoupon?.trim() || undefined;
      const { data } = await api.post('/recharge/create', {
        operator: operatorId,
        phoneNumber: `${COUNTRY_CODE}${phoneDigits}`,
        amount: Number(amount),
        couponCode: couponToSend,
        paymentCurrency,
      });
      if (!data?.recharge) {
        setError('Resposta inválida do servidor. Tente novamente.');
        return;
      }
      setRecharge(data.recharge);
      setRechargeList((prev) => [data.recharge, ...prev]);
      setStep(3);
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.response?.data?.message;
      if (status === 401) setError('Sessão expirada. Faça login novamente.');
      else if (status === 400 && msg) setError(msg);
      else if (status === 503) setError('Sistema em manutenção. Tente mais tarde.');
      else setError(msg || 'Erro ao gerar recarga. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyWallet = () => {
    if (recharge?.walletAddress) copyToClipboard(recharge.walletAddress);
  };

  const handleEditPhone = (rec: RechargeItem) => {
    const raw = (rec.phoneNumber ?? '').replace(/\D/g, '').replace(/^55/, '');
    setEditingPhoneId(rec.id);
    setEditPhoneDigits(raw.length === 11 ? raw : '');
  };

  const handleSavePhone = async () => {
    if (!editingPhoneId) return;
    const phoneValidation = validatePhoneDigits(editPhoneDigits);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error ?? 'Erro na validação do número.');
      return;
    }
    setSavingPhone(true);
    setError('');
    try {
      await api.put(`/recharge/${editingPhoneId}/phone`, {
        phoneNumber: `${COUNTRY_CODE}${editPhoneDigits}`
      });
      setRechargeList((prev) =>
        prev.map((r) =>
          r.id === editingPhoneId ? { ...r, phoneNumber: `${COUNTRY_CODE}${editPhoneDigits}` } : r
        )
      );
      if (recharge?.id === editingPhoneId) {
        setRecharge((r) => (r ? { ...r, phoneNumber: `${COUNTRY_CODE}${editPhoneDigits}` } : null));
      }
      setEditingPhoneId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar número.');
    } finally {
      setSavingPhone(false);
    }
  };

  const formatPhoneDisplayFromFull = (phone: string) => {
    const d = phone.replace(/\D/g, '').replace(/^55/, '');
    return d.length === 11 ? formatPhoneDisplay(d) : phone;
  };

  if (loadingOps) {
    return (
      <div className="flex items-center justify-center h-48 md:h-64">
        <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 touch-manipulation">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bitcoin/15">
          <Smartphone className="w-4 h-4 text-bitcoin flex-shrink-0" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Recarga de Celular</h1>
          <p className="text-xs text-gray-500">Rápido e seguro</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all flex-shrink-0 ${
                step >= s ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-700 text-gray-400'
              }`}>{s}</div>
              {s < 3 && <div className={`flex-1 h-0.5 mx-1 rounded transition-all ${step > s ? 'bg-bitcoin' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 px-0.5">
          <span>Dados</span>
          <span className="mr-6">Resumo</span>
          <span>Pagar</span>
        </div>
      </div>

      {/* Step 1 - Dados */}
      {step === 1 && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-xl p-4 border border-gray-700/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Smartphone className="w-4 h-4 text-bitcoin" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Dados da Recarga</h2>
              <p className="text-[11px] text-gray-400">Operadora, valor e número</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Número */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Número do celular</label>
              <div className={`flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-900/50 focus-within:border-bitcoin focus-within:ring-2 focus-within:ring-bitcoin/20 ${focusRing}`}>
                <span className="pl-3 text-gray-500 font-mono text-sm">{COUNTRY_CODE}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  value={formatPhoneDisplay(phoneDigits)}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  placeholder="11 98765-4321"
                  className="flex-1 min-w-0 px-2 py-2 bg-transparent text-white text-sm outline-none placeholder-gray-500"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">DDD + 9 dígitos (ex: 11 98765-4321)</p>
            </div>

            {/* Operadora */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Operadora</label>
              <div className="grid grid-cols-4 gap-1.5">
                {operators.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => { setOperatorId(op.id); setAmount(''); }}
                    className={`py-2 px-1.5 rounded-lg border transition-all flex items-center justify-center ${operatorId === op.id ? 'border-bitcoin ring-2 ring-bitcoin/40 bg-gray-900' : 'border-gray-600 bg-gray-900/50 hover:border-gray-500'}`}
                  >
                    <img
                      src={`/operators/${op.id.toLowerCase()}.svg`}
                      alt={op.name}
                      className="h-7 w-full object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'block'; }}
                    />
                    <span className="text-xs font-bold text-white hidden">{op.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Valores */}
            {selectedOperator && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Valor da recarga</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {selectedOperator.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAmount(v)}
                      className={`py-2 px-1.5 rounded-lg border text-xs font-semibold transition-all ${amount === v ? 'bg-bitcoin border-bitcoin text-black' : 'bg-gray-900/50 border-gray-600 text-white hover:border-bitcoin/60'}`}
                    >
                      R$ {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1">
                <Tag className="w-3 h-3" /> Cupom (opcional)
              </label>
              <div className="flex gap-2">
                <input ref={couponInputRef} type="text" placeholder="Código" value={couponCode}
                  onChange={(e) => { const v = e.target.value.toUpperCase(); setCouponCode(v); setCouponError(''); if (appliedCoupon && v !== appliedCoupon) setAppliedCoupon(null); }}
                  className={`${inputClass} ${focusRing} flex-1 min-w-0`} disabled={!!appliedCoupon} />
                {appliedCoupon ? (
                  <button type="button" onClick={handleRemoveCoupon} className="shrink-0 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-xs font-medium flex items-center gap-1">
                    <X className="w-3 h-3" /> Remover
                  </button>
                ) : (
                  <button type="button" onClick={handleApplyCoupon} disabled={applyingCoupon || !couponCode.trim()}
                    className="shrink-0 px-3 py-1.5 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50">
                    {applyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Aplicar
                  </button>
                )}
              </div>
              {appliedCoupon && <p className="mt-1 text-[10px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Cupom {appliedCoupon} aplicado</p>}
              {referralAutoApplied && !appliedCoupon && <p className="mt-1 text-[10px] text-bitcoin flex items-center gap-1"><Tag className="w-3 h-3" /> Desconto de indicação (20% off)</p>}
              {couponError && (
                <div className="mt-1 flex items-center justify-between gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <span className="text-red-400 text-[10px] flex-1 min-w-0">{couponError}</span>
                  <button type="button" onClick={handleApplyCoupon} disabled={applyingCoupon || !couponCode.trim()}
                    className="shrink-0 px-2 py-1 bg-red-500/20 rounded text-red-300 text-[10px] font-medium flex items-center gap-1">
                    {applyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Tentar
                  </button>
                </div>
              )}
            </div>

            {previewCalc && numAmount >= MIN_RECHARGE_AMOUNT && (
              <div className="p-2.5 bg-bitcoin/10 border border-bitcoin/30 rounded-lg text-[11px] text-gray-300 space-y-1">
                {previewCalc.cupomValido ? (
                  (() => {
                    const base = localRechargeCalc(numAmount);
                    const discountAmount = base.totalAmount - previewCalc.totalAmount;
                    return (<>
                      <div className="flex justify-between"><span>Taxa original:</span><span className="line-through text-gray-500">R$ {base.fee.toFixed(2).replace('.', ',')}</span></div>
                      <div className="flex justify-between text-green-400"><span>Taxa c/ desconto ({previewCalc.descontoAplicado}):</span><span className="font-semibold">R$ {previewCalc.fee.toFixed(2).replace('.', ',')}</span></div>
                      {discountAmount > 0 && <div className="flex justify-between text-green-400"><span>Desconto:</span><span>-R$ {discountAmount.toFixed(2).replace('.', ',')}</span></div>}
                      <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-600"><span>Total:</span><span className="text-bitcoin">R$ {previewCalc.totalAmount.toFixed(2).replace('.', ',')}</span></div>
                    </>);
                  })()
                ) : (<>
                  <div className="flex justify-between"><span>Taxa (2% + R$ 0,99):</span><span className="text-bitcoin font-semibold">R$ {previewCalc.fee.toFixed(2).replace('.', ',')}</span></div>
                  <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-700"><span>Total:</span><span className="text-bitcoin">R$ {previewCalc.totalAmount.toFixed(2).replace('.', ',')}</span></div>
                </>)}
              </div>
            )}

            {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-2.5 rounded-lg flex items-center gap-2 text-xs"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}</div>}

            <button type="button" onClick={goToResumo} disabled={!operatorId || !amount || phoneDigits.length !== 11 || providerLoading}
              className={`w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-2.5 rounded-xl hover:shadow-lg hover:shadow-bitcoin/40 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm transition-all ${focusRing}`}>
              <Calculator className="w-4 h-4" /> Calcular e continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 2 - Resumo */}
      {step === 2 && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-xl p-4 border border-gray-700/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-bitcoin/10 rounded-lg"><Calculator className="w-4 h-4 text-bitcoin" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Resumo da Recarga</h2>
              <p className="text-[11px] text-gray-400">Confira antes de gerar o pagamento</p>
            </div>
          </div>

          {(() => {
            const hasCoupon = (appliedCoupon?.trim().length ?? 0) > 0;
            const step2Preview = previewCalc ?? (numAmount >= 20 && selectedOperator?.values.includes(numAmount) && !hasCoupon ? localRechargeCalc(numAmount) : null);
            return (
              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg">
                  <span className="text-gray-400 text-xs">Operadora</span>
                  <span className="font-bold text-white text-xs">{selectedOperator?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg">
                  <span className="text-gray-400 text-xs">Número</span>
                  <span className="font-mono text-white text-xs">{COUNTRY_CODE} {formatPhoneDisplay(phoneDigits)}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg">
                  <span className="text-gray-400 text-xs">Valor da recarga</span>
                  <span className="text-sm font-bold text-white">R$ {numAmount.toFixed(2).replace('.', ',')}</span>
                </div>
                {previewCalc?.cupomValido && step2Preview ? (
                  (() => {
                    const base = localRechargeCalc(numAmount);
                    const discountAmount = base.totalAmount - step2Preview.totalAmount;
                    return (<>
                      <div className="flex justify-between items-center p-2.5 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                        <span className="text-gray-400 text-xs">Taxa original</span>
                        <span className="text-gray-500 text-xs line-through">R$ {base.fee.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="flex justify-between items-center p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <span className="text-green-400 text-xs font-medium">Taxa c/ desconto ({previewCalc.descontoAplicado})</span>
                        <span className="font-bold text-green-400 text-xs">R$ {step2Preview.fee.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="flex justify-between items-center p-2.5 bg-green-500/10 border border-green-500/50 rounded-lg">
                        <span className="text-green-400 text-xs font-medium">🎉 Desconto cupom</span>
                        <span className="font-bold text-green-400 text-xs">-R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </>);
                  })()
                ) : (
                  <div className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg">
                    <span className="text-gray-400 text-xs">Taxa</span>
                    <span className="text-orange-400 font-semibold text-xs">{step2Preview ? `R$ ${step2Preview.fee.toFixed(2).replace('.', ',')}` : '—'}</span>
                  </div>
                )}
                <div className="flex justify-between items-center p-3 bg-gradient-to-r from-bitcoin/20 to-orange-500/20 border border-bitcoin rounded-lg">
                  <span className="text-sm font-bold text-white">Total a pagar</span>
                  <span className="text-xl font-black text-bitcoin">{step2Preview ? `R$ ${step2Preview.totalAmount.toFixed(2).replace('.', ',')}` : hasCoupon ? 'Calculando...' : '—'}</span>
                </div>
                <div className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg">
                  <span className="text-gray-400 text-xs">{paymentCurrency === 'DEPIX' ? 'Em Depix (DPX)' : paymentCurrency === 'USDT' ? 'Em USDT' : 'Em sats'}</span>
                  <span className="text-sm font-bold text-white font-mono">
                    {previewCalc?.cryptoAmount ? formatCryptoAmount(paymentCurrency, previewCalc.cryptoAmount) : step2Preview ? `${step2Preview.depixAmount.toFixed(2)} DPX` : '—'}
                  </span>
                </div>
                {previewCalc?.exchangeRate && (
                  <p className="text-[10px] text-gray-500 text-right">Cotação: {paymentCurrency === 'USDT' ? `1 USD = R$ ${previewCalc.exchangeRate.toFixed(2).replace('.', ',')}` : `1 BTC = R$ ${previewCalc.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</p>
                )}
              </div>
            );
          })()}

          {couponError && step === 2 && (
            <div className="mb-3 flex items-center justify-between gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <span className="text-red-400 text-xs flex-1">{couponError}</span>
              <button type="button" onClick={() => { setApplyingCoupon(true); setCouponError(''); fetchPreview(undefined, setCouponError); setTimeout(() => setApplyingCoupon(false), 800); }}
                disabled={applyingCoupon} className="shrink-0 px-2.5 py-1.5 bg-red-500/20 rounded-lg text-red-300 text-xs font-medium flex items-center gap-1">
                {applyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Tentar
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className={`flex-1 bg-gray-700 text-white font-bold py-2.5 rounded-xl hover:bg-gray-600 active:scale-[0.98] text-sm ${focusRing}`}>Voltar</button>
            <button type="button" onClick={handleCreateRecharge} disabled={loading || ((appliedCoupon?.trim().length ?? 0) > 0 && !previewCalc)}
              className={`flex-1 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-2.5 rounded-xl hover:shadow-lg hover:shadow-bitcoin/40 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm ${focusRing}`}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : (appliedCoupon?.trim().length ?? 0) > 0 && !previewCalc ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</> : <><Bitcoin className="w-4 h-4" /> Avançar</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Pagar */}
      {step === 3 && recharge && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-xl p-4 border border-gray-700/40">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-bitcoin/10 rounded-lg"><QrCodeIcon className="w-4 h-4 text-bitcoin" /></div>
            <div>
              <h2 className="text-sm font-bold text-white">Pagar com {(recharge as any).paymentCurrency === 'USDT' ? 'USDT' : (recharge as any).paymentCurrency === 'BTC' ? 'Bitcoin' : 'Depix'}</h2>
              <p className="text-[11px] text-gray-400">Escaneie o QR Code ou copie o endereço</p>
            </div>
          </div>

          {(recharge as any).rateLockExpiresAt && (
            <div className="mb-3"><RateLockCountdown expiresAt={(recharge as any).rateLockExpiresAt} onExpire={() => {}} /></div>
          )}

          <div className="flex flex-col items-center mb-3">
            <div className="w-full bg-gray-900/50 rounded-lg p-2.5 mb-2">
              <p className="text-[10px] text-gray-400 mb-1">Endereço:</p>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 text-bitcoin font-mono text-[11px] break-all min-w-0">{recharge.walletAddress}</code>
                <button type="button" onClick={handleCopyWallet} className={`p-1.5 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg transition-colors flex-shrink-0 ${focusRing}`}>
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-bitcoin" />}
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-900/50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-400 mb-1">Valor exato:</p>
              <p className="text-base font-bold text-white font-mono">
                {(recharge as any).cryptoAmount ? formatCryptoAmount((recharge as any).paymentCurrency || 'DEPIX', (recharge as any).cryptoAmount) : `${recharge.depixAmount?.toFixed(2)} DPX`}
              </p>
              {(recharge as any).exchangeRate && (
                <p className="text-[10px] text-gray-500 mt-0.5">Cotação travada: {(recharge as any).paymentCurrency === 'USDT' ? `1 USD = R$ ${(recharge as any).exchangeRate.toFixed(2).replace('.', ',')}` : `1 BTC = R$ ${(recharge as any).exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</p>
              )}
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg md:rounded-xl p-3 md:p-4 mb-4">
            <p className="text-xs md:text-sm text-amber-200 font-medium mb-2">Avisos importantes</p>
            <ul className="text-xs md:text-sm text-amber-100/90 space-y-1 list-disc list-inside">
              <li>A recarga será feita <strong>exatamente no número informado</strong>. A responsabilidade por números errados é do usuário.</li>
              <li>Envie <strong>exatamente</strong> o valor indicado para o endereço acima.</li>
            </ul>
          </div>

          {/* Status do pagamento */}
          {!paymentDetected ? (
            <div className="flex flex-col items-center gap-3 py-5">
              <Loader2 className="w-7 h-7 text-bitcoin animate-spin" />
              <p className="text-sm font-semibold text-white">Aguardando identificação do pagamento…</p>
              <p className="text-xs text-gray-400 text-center leading-relaxed">
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
                  <p className="text-xs text-gray-400">Já recebemos sua solicitação.</p>
                </div>
              </div>

              {/* Prazo */}
              <div className="p-3.5 bg-gray-900/50 border border-gray-700 rounded-xl space-y-3 text-xs">
                <div className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 text-bitcoin flex-shrink-0 mt-0.5" />
                  <p className="text-white leading-relaxed">
                    Processaremos a recarga em <strong>até 30 minutos</strong> dentro do horário comercial.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-gray-400 font-semibold">Horário de atendimento</p>
                    <p className="text-white">Segunda a Sexta, 9h às 18h (Brasília)</p>
                    {!isWithinBusinessHours() && (
                      <p className="text-amber-400 font-medium mt-1">
                        ⏰ Fora do horário comercial — sua recarga será processada no próximo dia útil.
                      </p>
                    )}
                  </div>
                </div>
                <div className="border-t border-gray-700 pt-3 text-gray-400 leading-relaxed">
                  Após o crédito, a operadora pode levar alguns minutos para refletir no saldo do número.
                </div>
              </div>

              {/* Link histórico */}
              <button
                type="button"
                onClick={() => navigate('/historico')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Ver comprovante em Histórico
              </button>

              {/* Nova recarga */}
              <button
                type="button"
                onClick={() => { setStep(1); setRecharge(null); setPaymentDetected(false); setPhoneDigits(''); setAmount(''); setCouponCode(''); }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-bitcoin/50 active:scale-[0.98] text-sm transition-all"
              >
                Fazer nova recarga
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lista de recargas */}
      {rechargeList.length > 0 && (
        <div className="mt-4 bg-gray-800/60 backdrop-blur-xl rounded-xl border border-gray-700/40 p-4">
          <h3 className="text-sm font-bold text-white mb-2.5">Suas recargas</h3>
          <div className="space-y-2">
            {rechargeList.map((rec) => (
              <div key={rec.id} className="bg-gray-900/50 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-medium text-xs">
                    {rec.operator} — {formatPhoneDisplayFromFull(rec.phoneNumber ?? '')}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    R$ {rec.amount?.toFixed(2).replace('.', ',')} + taxa = R$ {rec.totalAmount?.toFixed(2).replace('.', ',')} •{' '}
                    {rec.status === 'PENDING' && 'Aguardando pagamento'}
                    {rec.status === 'PAID' && 'Pago'}
                    {rec.couponUsed && <span className="text-green-400"> • Cupom: {rec.couponUsed}</span>}
                  </p>
                  {rec.txid && <p className="text-[10px] text-gray-500 font-mono mt-0.5">TXID: {rec.txid.substring(0, 16)}...</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {rec.status === 'PENDING' && (
                    <>
                      {editingPhoneId === rec.id ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={formatPhoneDisplay(editPhoneDigits)}
                            onChange={(e) => setEditPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 11))}
                            className={`w-28 px-2 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-white text-xs ${focusRing}`}
                          />
                          <button type="button" onClick={handleSavePhone} disabled={savingPhone || editPhoneDigits.length !== 11} className="text-bitcoin text-xs font-medium">
                            {savingPhone ? '...' : 'Salvar'}
                          </button>
                          <button type="button" onClick={() => setEditingPhoneId(null)} className="text-gray-400 text-xs">Cancelar</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => handleEditPhone(rec)} className={`p-1.5 rounded-lg bg-bitcoin/10 hover:bg-bitcoin/20 text-bitcoin ${focusRing}`} title="Editar número">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  {rec.status === 'PAID' && (
                    <>
                      {rec.receiptUrl ? (
                        <a
                          href={rec.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`p-1.5 rounded-lg bg-bitcoin/10 hover:bg-bitcoin/20 text-bitcoin text-xs font-medium flex items-center gap-1 ${focusRing}`}
                          title="Baixar comprovante"
                        >
                          <Download className="w-3.5 h-3.5" /> Comprovante
                        </a>
                      ) : (
                        <span className="p-1.5 rounded-lg bg-gray-700/50 text-gray-500" title="Pago"><Lock className="w-3.5 h-3.5" /></span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
