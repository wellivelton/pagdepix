import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
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
  X
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, formatCryptoAmount, type Currency } from '../components/CurrencySelector';
import { RateLockCountdown } from '../components/RateLockCountdown';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-4 py-3 md:py-3.5 bg-gray-900/50 rounded-xl md:rounded-xl border border-gray-600 text-white placeholder-gray-500 text-base focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all touch-manipulation';

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
  { id: 'Vivo', name: 'Vivo', values: [20, 25, 30, 35, 40, 50, 100, 200, 300] },
  { id: 'Claro', name: 'Claro', values: [20, 25, 30, 35, 40, 50, 100, 200, 300] },
  { id: 'TIM', name: 'TIM', values: [20, 30, 40, 50, 60, 100] },
  { id: 'Correios Celular', name: 'Correios Celular', values: [20, 30, 45, 55, 75, 120, 150, 180, 225] },
  { id: 'Surf Telecom', name: 'Surf Telecom', values: [25, 30, 40, 50, 75, 180] },
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

export default function RecargaCelular() {
  const { triggerPushActivation } = useNotifications();
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
  const [txid, setTxid] = useState('');
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
  const [rateExpired, setRateExpired] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [referralAutoApplied, setReferralAutoApplied] = useState(false);
  const calcRequestRef = useRef<string>('');
  const couponInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill indicação
  useEffect(() => {
    api.get('/user/referral').then(({ data }) => {
      if (data.referredByCode) setReferralAutoApplied(true);
    }).catch(() => {});
  }, []);

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
    if (numAmount < 20 || !selectedOperator?.values?.includes(numAmount)) return;
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
    if (numAmount < 20 || !selectedOperator?.values?.includes(numAmount)) {
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
    if (numAmount < 20 || !selectedOperator?.values?.includes(numAmount)) {
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
    if (numAmount < 20 || !selectedOperator?.values?.includes(numAmount)) return;
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
    if (!operatorId || !amount || !selectedOperator?.values.includes(Number(amount))) {
      setError('Selecione a operadora e um valor válido.');
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
    if (!operatorId || !amount || !selectedOperator?.values.includes(Number(amount))) {
      setError('Selecione a operadora e um valor válido.');
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

  const handleSubmitTxid = async () => {
    const rechargeId = recharge?.id;
    if (!rechargeId || !txid.trim()) return;
    setError('');
    setLoading(true);
    try {
      await api.put(`/recharge/${String(rechargeId)}/txid`, { txid: txid.trim() });
      setRecharge((r) => r ? { ...r, txid: txid.trim() } : null);
      setRechargeList((prev) =>
        prev.map((r) => (r.id === rechargeId ? { ...r, txid: txid.trim() } : r))
      );
      setStep(4);
      triggerPushActivation('recarga');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message;
      const status = err.response?.status;
      if (status === 401) setError('Sessão expirada. Faça login novamente.');
      else if (msg) setError(msg);
      else setError(err.message || 'Erro ao registrar TXID. Tente novamente.');
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
    <div className="min-h-dvh md:min-h-0 max-w-4xl mx-auto px-4 md:px-6 pt-safe-t pb-safe-b md:pt-6 md:pb-6 touch-manipulation">
      {/* Header estilo app */}
      <div className="flex items-center gap-3 mb-5 md:mb-6">
        <div className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-bitcoin/15">
          <Smartphone className="w-5 h-5 md:w-6 md:h-6 text-bitcoin flex-shrink-0" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white md:text-2xl tracking-tight">Recarga de Celular</h1>
          <p className="text-xs text-gray-500 md:text-sm">Rápido e seguro</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-5 md:mb-8">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-sm md:text-base font-bold transition-all ${
                  step >= s ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-700 text-gray-400'
                }`}
              >
                {s}
              </div>
              {s < 4 && <div className={`w-12 md:w-20 h-0.5 md:h-1 mx-1 md:mx-2 rounded transition-all ${step > s ? 'bg-bitcoin' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs md:text-sm text-gray-400">
          <span>Dados</span>
          <span>Resumo</span>
          <span>Pagar</span>
          <span>Confirmar</span>
        </div>
      </div>

      {/* Step 1 - Dados */}
      {step === 1 && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl md:rounded-2xl p-5 md:p-8 border border-gray-700/40 shadow-xl shadow-black/20 md:shadow-none">
          <div className="flex items-center gap-2.5 md:gap-3 mb-4 md:mb-6">
            <div className="p-2.5 md:p-3 bg-bitcoin/10 rounded-lg md:rounded-xl">
              <Smartphone className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white md:text-2xl">Dados da Recarga</h2>
              <p className="text-gray-400 text-sm md:text-base">Operadora, valor e número do celular</p>
            </div>
          </div>

          <div className="space-y-4 md:space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Operadora</label>
              <select
                value={operatorId}
                onChange={(e) => {
                  setOperatorId(e.target.value);
                  setAmount('');
                }}
                className={`${inputClass} ${focusRing}`}
              >
                <option value="">Selecione</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>

            {selectedOperator && (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Valor (R$)</label>
                <select
                  value={amount === '' ? '' : amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                  className={`${inputClass} ${focusRing}`}
                >
                  <option value="">Selecione</option>
                  {selectedOperator.values.map((v) => (
                    <option key={v} value={v}>R$ {v.toFixed(2).replace('.', ',')}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Número do celular</label>
              <div className={`flex items-center gap-2 rounded-lg md:rounded-xl border border-gray-600 bg-gray-900/50 focus-within:border-bitcoin focus-within:ring-2 focus-within:ring-bitcoin/20 ${focusRing}`}>
                <span className="pl-3 text-gray-500 font-mono text-sm md:text-base">{COUNTRY_CODE}</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={15}
                  value={formatPhoneDisplay(phoneDigits)}
                  onChange={(e) => handlePhoneInput(e.target.value)}
                  placeholder="11 98765-4321"
                  className="flex-1 min-w-0 px-3 py-3 md:py-3.5 bg-transparent text-white text-sm md:text-base outline-none placeholder-gray-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">DDD + 9 dígitos (celular)</p>
            </div>

            <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />

            <section>
              <h3 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                <Tag className="w-3.5 h-3.5 md:w-4 md:h-4" /> Cupom (opcional)
              </h3>
              <div className="flex gap-2">
                <input
                  ref={couponInputRef}
                  type="text"
                  placeholder="Código do cupom"
                  value={couponCode}
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    setCouponCode(v);
                    setCouponError('');
                    if (appliedCoupon && v !== appliedCoupon) setAppliedCoupon(null);
                  }}
                  className={`${inputClass} ${focusRing} flex-1 min-w-0`}
                  disabled={!!appliedCoupon}
                />
                {appliedCoupon ? (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="shrink-0 px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl font-medium flex items-center gap-1.5 transition-colors"
                    title="Remover cupom"
                  >
                    <X className="w-4 h-4" /> Remover
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={applyingCoupon || !couponCode.trim()}
                    className="shrink-0 px-4 py-3 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-xl font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Validar e aplicar cupom"
                  >
                    {applyingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Aplicar
                  </button>
                )}
              </div>
              {appliedCoupon && (
                <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Cupom {appliedCoupon} aplicado com sucesso
                </p>
              )}
              {referralAutoApplied && !appliedCoupon && (
                <p className="mt-2 text-xs text-bitcoin flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Desconto de indicação aplicado automaticamente (20% off)
                </p>
              )}
              {couponError && (
                <div className="mt-2 flex items-center justify-between gap-2 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <span className="text-red-400 text-xs md:text-sm flex-1 min-w-0">{couponError}</span>
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={applyingCoupon || !couponCode.trim()}
                    className="shrink-0 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-xs font-medium flex items-center gap-1"
                  >
                    {applyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Tentar
                  </button>
                </div>
              )}
            </section>

            {previewCalc && numAmount >= 20 && (
              <div className="p-2.5 md:p-3 bg-bitcoin/10 border border-bitcoin/30 rounded-lg">
                <div className="text-xs text-gray-300 space-y-1">
                  {previewCalc.cupomValido ? (
                    (() => {
                      const base = localRechargeCalc(numAmount);
                      const discountAmount = base.totalAmount - previewCalc.totalAmount;
                      return (
                        <>
                          <div className="flex justify-between items-center">
                            <span>Taxa (2% + R$ 0,99):</span>
                            <span className="line-through text-gray-500">R$ {base.fee.toFixed(2).replace('.', ',')}</span>
                          </div>
                          <div className="flex justify-between items-center text-green-400">
                            <span>Taxa com desconto ({previewCalc.descontoAplicado}):</span>
                            <span className="font-semibold">R$ {previewCalc.fee.toFixed(2).replace('.', ',')}</span>
                          </div>
                          {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-green-400">
                              <span>Desconto:</span>
                              <span>-R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-1 border-t border-gray-600">
                            <span>Subtotal:</span>
                            <span className="line-through text-gray-500">R$ {base.totalAmount.toFixed(2).replace('.', ',')}</span>
                          </div>
                          <div className="flex justify-between font-bold text-white">
                            <span>Total a pagar:</span>
                            <span className="text-bitcoin">R$ {previewCalc.totalAmount.toFixed(2).replace('.', ',')}</span>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Taxa (2% + R$ 0,99):</span>
                        <span className="text-bitcoin font-semibold">R$ {previewCalc.fee.toFixed(2).replace('.', ',')}</span>
                      </div>
                      <div className="flex justify-between font-bold text-white pt-1 border-t border-gray-700">
                        <span>Total a pagar:</span>
                        <span className="text-bitcoin">R$ {previewCalc.totalAmount.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 md:p-4 rounded-lg md:rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={goToResumo}
              disabled={!operatorId || !amount || phoneDigits.length !== 11}
              className={`w-full min-h-[48px] md:min-h-0 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3.5 md:py-4 rounded-xl md:rounded-xl hover:shadow-lg hover:shadow-bitcoin/50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base md:text-base transition-transform ${focusRing}`}
            >
              <Calculator className="w-4 h-4 md:w-5 md:h-5" />
              Calcular e continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 2 - Resumo */}
      {step === 2 && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl md:rounded-2xl p-5 md:p-8 border border-gray-700/40 shadow-xl shadow-black/20 md:shadow-none">
          <div className="flex items-center gap-2.5 md:gap-3 mb-4 md:mb-6">
            <div className="p-2.5 md:p-3 bg-bitcoin/10 rounded-lg md:rounded-xl">
              <Calculator className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white md:text-2xl">Resumo da Recarga</h2>
              <p className="text-gray-400 text-sm md:text-base">Confira antes de gerar o pagamento</p>
            </div>
          </div>

          {(() => {
            // Com cupom aplicado, NUNCA usar fallback local (não aplica desconto) - aguardar API
            const hasCoupon = (appliedCoupon?.trim().length ?? 0) > 0;
            const step2Preview = previewCalc ?? (numAmount >= 20 && selectedOperator?.values.includes(numAmount) && !hasCoupon ? localRechargeCalc(numAmount) : null);
            return (
              <div className="space-y-3 md:space-y-4 mb-5 md:mb-6">
                <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                  <span className="text-gray-400 text-sm md:text-base">Operadora</span>
                  <span className="font-bold text-white text-sm md:text-base">{selectedOperator?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                  <span className="text-gray-400 text-sm md:text-base">Número</span>
                  <span className="font-mono text-white text-sm md:text-base">{COUNTRY_CODE} {formatPhoneDisplay(phoneDigits)}</span>
                </div>
                <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                  <span className="text-gray-400 text-sm md:text-base">Valor da recarga</span>
                  <span className="text-lg font-bold text-white md:text-xl">R$ {numAmount.toFixed(2).replace('.', ',')}</span>
                </div>
                {previewCalc?.cupomValido && step2Preview ? (
                  (() => {
                    const base = localRechargeCalc(numAmount);
                    const discountAmount = base.totalAmount - step2Preview.totalAmount;
                    return (
                      <>
                        <div className="flex justify-between items-center p-3 md:p-4 bg-orange-500/5 border border-orange-500/20 rounded-lg md:rounded-xl">
                          <span className="text-gray-400 text-sm md:text-base">Taxa (2% + R$ 0,99)</span>
                          <span className="text-orange-400 font-semibold text-sm md:text-base line-through text-gray-500">
                            R$ {base.fee.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 md:p-4 bg-green-500/10 border border-green-500/30 rounded-lg md:rounded-xl">
                          <span className="text-green-400 text-sm md:text-base font-medium">Taxa com desconto ({previewCalc.descontoAplicado})</span>
                          <span className="font-bold text-green-400 text-sm md:text-base">
                            R$ {step2Preview.fee.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                          <span className="text-gray-400 text-sm md:text-base">Subtotal (valor + taxa original)</span>
                          <span className="font-bold text-white text-sm md:text-base line-through text-gray-500">
                            R$ {base.totalAmount.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center p-3 md:p-4 bg-green-500/10 border border-green-500/50 rounded-lg md:rounded-xl">
                          <span className="text-green-400 text-sm md:text-base font-medium">🎉 Cupom aplicado</span>
                          <span className="font-bold text-green-400 text-sm md:text-base">
                            -R$ {discountAmount.toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                    <span className="text-gray-400 text-sm md:text-base">Taxa</span>
                    <span className="text-orange-400 font-semibold text-sm md:text-base">
                      {step2Preview ? `R$ ${step2Preview.fee.toFixed(2).replace('.', ',')}` : '—'}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center p-4 md:p-6 bg-gradient-to-r from-bitcoin/20 to-orange-500/20 border border-bitcoin rounded-lg md:rounded-xl">
                  <span className="text-lg font-bold text-white md:text-xl">Total a pagar</span>
                  <span className="text-2xl font-black text-bitcoin md:text-3xl">
                    {step2Preview ? `R$ ${step2Preview.totalAmount.toFixed(2).replace('.', ',')}` : hasCoupon ? 'Carregando...' : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 md:p-4 bg-gray-900/50 rounded-lg md:rounded-xl">
                  <span className="text-gray-400 text-sm md:text-base">
                    {paymentCurrency === 'DEPIX' ? 'Valor em Depix (DPX)' : paymentCurrency === 'USDT' ? 'Valor em USDT' : 'Valor em sats'}
                  </span>
                  <span className="text-lg font-bold text-white font-mono md:text-xl">
                    {previewCalc?.cryptoAmount
                      ? formatCryptoAmount(paymentCurrency, previewCalc.cryptoAmount)
                      : step2Preview ? `${step2Preview.depixAmount.toFixed(2)} DPX` : '—'}
                  </span>
                </div>
                {previewCalc?.exchangeRate && (
                  <p className="text-xs text-gray-500 text-right">
                    Cotação: {paymentCurrency === 'USDT'
                      ? `1 USD = R$ ${previewCalc.exchangeRate.toFixed(2).replace('.', ',')}`
                      : `1 BTC = R$ ${previewCalc.exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                  </p>
                )}
              </div>
            );
          })()}

          {couponError && step === 2 && (
            <div className="mb-4 flex items-center justify-between gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <span className="text-red-400 text-xs md:text-sm flex-1">{couponError}</span>
              <button
                type="button"
                onClick={() => { setApplyingCoupon(true); setCouponError(''); fetchPreview(undefined, setCouponError); setTimeout(() => setApplyingCoupon(false), 800); }}
                disabled={applyingCoupon}
                className="shrink-0 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-xs font-medium flex items-center gap-1"
              >
                {applyingCoupon ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                Tentar novamente
              </button>
            </div>
          )}

          <p className="text-gray-400 text-xs md:text-sm mb-4 text-center">
            Revise os dados acima. Use <strong className="text-gray-300">Voltar e revisar</strong> para alterar ou <strong className="text-bitcoin">Avançar para pagamento</strong> para gerar o QR Code.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={`flex-1 min-h-[48px] md:min-h-0 bg-gray-700 text-white font-bold py-3.5 md:py-4 px-4 md:px-6 rounded-xl md:rounded-xl hover:bg-gray-600 active:scale-[0.98] transition-all text-base md:text-base ${focusRing}`}
            >
              Voltar e revisar
            </button>
            <button
              type="button"
              onClick={handleCreateRecharge}
              disabled={loading || ((appliedCoupon?.trim().length ?? 0) > 0 && !previewCalc)}
              className={`flex-1 min-h-[48px] md:min-h-0 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3.5 md:py-4 px-4 md:px-6 rounded-xl md:rounded-xl hover:shadow-lg hover:shadow-bitcoin/50 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-base md:text-base transition-all ${focusRing}`}
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Gerando...</>
              ) : (appliedCoupon?.trim().length ?? 0) > 0 && !previewCalc ? (
                <><Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Calculando desconto...</>
              ) : (
                <><Bitcoin className="w-4 h-4 md:w-5 md:h-5" /> Avançar para pagamento</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Pagar (QR, endereço, avisos, TXID) */}
      {step === 3 && recharge && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl md:rounded-2xl p-5 md:p-8 border border-gray-700/40 shadow-xl shadow-black/20 md:shadow-none">
          <div className="flex items-center gap-2.5 md:gap-3 mb-4 md:mb-6">
            <div className="p-2.5 md:p-3 bg-bitcoin/10 rounded-lg md:rounded-xl">
              <QrCodeIcon className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white md:text-2xl">
                Pagar com {(recharge as any).paymentCurrency === 'USDT' ? 'USDT' : (recharge as any).paymentCurrency === 'BTC' ? 'Bitcoin' : 'Depix'}
              </h2>
              <p className="text-gray-400 text-sm md:text-base">Escaneie o QR Code ou copie o endereço</p>
            </div>
          </div>

          {(recharge as any).rateLockExpiresAt && (
            <div className="mb-4">
              <RateLockCountdown expiresAt={(recharge as any).rateLockExpiresAt} onExpire={() => setRateExpired(true)} />
            </div>
          )}

          <div className="flex flex-col items-center mb-5 md:mb-6">
            <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl mb-3 md:mb-4">
              <img src="/qr-code.png" alt="QR Code" className="w-48 h-48 md:w-64 md:h-64" />
            </div>
            <div className="w-full bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 mb-3 md:mb-4">
              <p className="text-xs md:text-sm text-gray-400 mb-2">Endereço Liquid:</p>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 text-bitcoin font-mono text-xs md:text-sm break-all min-w-0">{recharge.walletAddress}</code>
                <button
                  type="button"
                  onClick={handleCopyWallet}
                  className={`p-2 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg transition-colors flex-shrink-0 ${focusRing}`}
                  aria-label="Copiar endereço"
                >
                  {copied ? <Check className="w-4 h-4 md:w-5 md:h-5 text-green-400" /> : <Copy className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />}
                </button>
              </div>
            </div>
            <div className="w-full bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
              <p className="text-xs md:text-sm text-gray-400 mb-2">Valor exato a enviar:</p>
              <p className="text-xl font-bold text-white font-mono md:text-2xl">
                {(recharge as any).cryptoAmount
                  ? formatCryptoAmount((recharge as any).paymentCurrency || 'DEPIX', (recharge as any).cryptoAmount)
                  : `${recharge.depixAmount?.toFixed(2)} DPX`}
              </p>
              {(recharge as any).exchangeRate && (
                <p className="text-xs text-gray-500 mt-1">
                  Cotação travada: {(recharge as any).paymentCurrency === 'USDT'
                    ? `1 USD = R$ ${(recharge as any).exchangeRate.toFixed(2).replace('.', ',')}`
                    : `1 BTC = R$ ${(recharge as any).exchangeRate.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </p>
              )}
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg md:rounded-xl p-3 md:p-4 mb-3 md:mb-4">
            <p className="text-xs md:text-sm text-amber-200 font-medium mb-2">Avisos importantes</p>
            <ul className="text-xs md:text-sm text-amber-100/90 space-y-1 list-disc list-inside">
              <li>A recarga será feita <strong>exatamente no número informado</strong>. A responsabilidade por números errados é do usuário.</li>
              <li>Após a liquidação do pagamento, você receberá o comprovante.</li>
              <li>Após enviar o valor, insira o <strong>TXID da transação</strong> abaixo.</li>
            </ul>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg md:rounded-xl p-3 md:p-4 mb-5 md:mb-6">
            <p className="text-xs md:text-sm text-blue-400">
              Envie exatamente o valor indicado para o endereço acima. Depois informe o TXID da transação.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">TXID da transação</label>
              <input
                type="text"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                placeholder="Cole o TXID da transação Depix (mín. 10 caracteres)"
                className={`${inputClass} font-mono ${focusRing}`}
              />
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 md:p-4 rounded-lg md:rounded-xl flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={handleSubmitTxid}
              disabled={loading || !txid.trim() || txid.trim().length < 10 || rateExpired}
              className={`w-full min-h-[48px] md:min-h-0 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3.5 md:py-4 rounded-xl md:rounded-xl hover:shadow-lg hover:shadow-bitcoin/50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base md:text-base transition-transform ${focusRing}`}
            >
              {loading ? <><Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Verificando...</> : <><Check className="w-4 h-4 md:w-5 md:h-5" /> Já paguei — registrar TXID</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 - Sucesso */}
      {step === 4 && (
        <div className="bg-gray-800/60 backdrop-blur-xl rounded-2xl md:rounded-2xl p-5 md:p-8 border border-gray-700/40 shadow-xl shadow-black/20 md:shadow-none text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-6">
            <Check className="w-8 h-8 md:w-10 md:h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3 md:mb-4 md:text-3xl">Pagamento registrado!</h2>
          <p className="text-gray-400 text-sm md:text-base mb-6 md:mb-8">
            Seu TXID foi registrado. Aguarde a confirmação do admin. Após a liquidação você receberá o comprovante.
          </p>
          <button
            type="button"
            onClick={() => { setStep(1); setRecharge(null); setTxid(''); setPhoneDigits(''); setAmount(''); setCouponCode(''); }}
            className={`min-h-[48px] md:min-h-0 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3.5 md:py-4 px-6 md:px-8 rounded-xl hover:shadow-lg hover:shadow-bitcoin/50 active:scale-[0.98] text-base md:text-base transition-transform ${focusRing}`}
          >
            Fazer nova recarga
          </button>
        </div>
      )}

      {/* Lista de recargas */}
      {rechargeList.length > 0 && (
        <div className="mt-6 md:mt-8 bg-gray-800/60 backdrop-blur-xl rounded-2xl border border-gray-700/40 shadow-xl shadow-black/20 md:shadow-none p-4 md:p-6">
          <h3 className="text-base font-bold text-white mb-3 md:mb-4 md:text-lg">Suas recargas</h3>
          <div className="space-y-2.5 md:space-y-3">
            {rechargeList.map((rec) => (
              <div key={rec.id} className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <div className="min-w-0">
                  <p className="text-white font-medium text-sm md:text-base">
                    {rec.operator} — {formatPhoneDisplayFromFull(rec.phoneNumber ?? '')}
                  </p>
                  <p className="text-xs md:text-sm text-gray-400">
                    R$ {rec.amount?.toFixed(2).replace('.', ',')} + taxa = R$ {rec.totalAmount?.toFixed(2).replace('.', ',')} •{' '}
                    {rec.status === 'PENDING' && 'Aguardando pagamento'}
                    {rec.status === 'PAID' && 'Pago'}
                    {rec.couponUsed && <span className="text-green-400"> • Cupom: {rec.couponUsed}</span>}
                  </p>
                  {rec.txid && <p className="text-xs text-gray-500 font-mono mt-1">TXID: {rec.txid.substring(0, 16)}...</p>}
                </div>
                <div className="flex items-center gap-1.5 md:gap-2">
                  {rec.status === 'PENDING' && (
                    <>
                      {editingPhoneId === rec.id ? (
                        <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                          <input
                            type="tel"
                            inputMode="numeric"
                            value={formatPhoneDisplay(editPhoneDigits)}
                            onChange={(e) => setEditPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 11))}
                            className={`w-28 md:w-32 px-2 py-1.5 rounded-lg border border-gray-600 bg-gray-800 text-white text-xs md:text-sm ${focusRing}`}
                          />
                          <button type="button" onClick={handleSavePhone} disabled={savingPhone || editPhoneDigits.length !== 11} className="text-bitcoin text-xs md:text-sm font-medium">
                            {savingPhone ? '...' : 'Salvar'}
                          </button>
                          <button type="button" onClick={() => setEditingPhoneId(null)} className="text-gray-400 text-xs md:text-sm">Cancelar</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => handleEditPhone(rec)} className={`p-2 rounded-lg bg-bitcoin/10 hover:bg-bitcoin/20 text-bitcoin ${focusRing}`} title="Editar número">
                          <Edit3 className="w-3.5 h-3.5 md:w-4 md:h-4" />
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
                          className={`p-2 rounded-lg bg-bitcoin/10 hover:bg-bitcoin/20 text-bitcoin text-xs md:text-sm font-medium flex items-center gap-1 ${focusRing}`}
                          title="Baixar comprovante"
                        >
                          <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Comprovante
                        </a>
                      ) : (
                        <span className="p-2 rounded-lg bg-gray-700/50 text-gray-500" title="Pago"><Lock className="w-3.5 h-3.5 md:w-4 md:h-4" /></span>
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
