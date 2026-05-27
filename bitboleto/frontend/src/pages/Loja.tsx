import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import {
  ShoppingBag, Loader2, Copy, Check,
  Tag, X, ChevronRight, Gift, AlertCircle, Clock,
} from 'lucide-react';
import api from '../services/api';
import { CurrencySelector, type Currency } from '../components/CurrencySelector';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-3 py-2 bg-gray-900/50 rounded-lg border border-gray-600 text-white placeholder-gray-500 text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all';

const CATEGORIES = [
  { id: 'all',       label: 'Todos' },
  { id: 'games',     label: 'Games' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'food',      label: 'Alimentação' },
  { id: 'apps',      label: 'Apps' },
  { id: 'outros',    label: 'Outros' },
];

const BRAND_LOGO: Record<string, string> = {
  'Google Play': '/brands/google-play.svg',
  'Netflix':     '/brands/netflix.svg',
  'Xbox':        '/brands/xbox.svg',
  'Level Up':    '/brands/level-up.svg',
};

const BRAND_BG: Record<string, string> = {
  'Google Play':  'from-[#01875f] to-[#34a853]',
  'Netflix':      'from-[#831010] to-[#E50914]',
  'Xbox':         'from-[#0a4f0a] to-[#107C10]',
  'Level Up':     'from-[#cc4400] to-[#FF6600]',
  'TopRecargas':  'from-[#b25d00] to-[#f7931a]',
};

interface PinProduct {
  productId: string;
  name: string;
  brand: string;
  amount: number;
  category: string;
  variable?: boolean;
  minAmount?: number;
  maxAmount?: number;
  estoqueDisponivel?: number;
  descricao?: string;
}

interface OrderState {
  id: string;
  productName: string;
  fee: number;
  totalAmount: number;
  depixAmount: number;
  walletAddress: string;
  status: string;
  txid?: string | null;
  pinCode?: string | null;
  pinMessage?: string | null;
  authorizationCode?: string | null;
  serialNumber?: string | null;
  couponUsed?: string | null;
  codigoEntregue?: string | null;
  codigoMensagem?: string | null;
  createdAt: string;
  paidAt?: string | null;
}

// kept for my-orders list (legacy pin orders)
interface PinTopup {
  id: string;
  productName: string;
  brand: string;
  amount: number;
  fee: number;
  totalAmount: number;
  depixAmount: number;
  walletAddress: string;
  status: string;
  pinCode?: string | null;
  createdAt: string;
}

export default function Loja() {
  const { triggerPushActivation } = useNotifications();
  const [products, setProducts] = useState<PinProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [category, setCategory] = useState('all');
  const [step, setStep] = useState(0); // 0=loja, 1=resumo, 2=pagamento
  const [selected, setSelected] = useState<PinProduct | null>(null);
  const [orderSource, setOrderSource] = useState<'pin' | 'toprecargas'>('pin');
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DEPIX');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<OrderState | null>(null);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [myOrders, setMyOrders] = useState<PinTopup[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const couponInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const pinReq = api.get('/pin/products')
      .then(({ data }) => data.products ?? [] as PinProduct[])
      .catch(() => [] as PinProduct[]);
    const trReq = api.get('/toprecargas/products')
      .then(({ data }) => data.products ?? [] as PinProduct[])
      .catch(() => [] as PinProduct[]);
    Promise.all([pinReq, trReq]).then(([pin, tr]) => {
      setProducts([...pin, ...tr]);
    }).finally(() => setLoadingProducts(false));
    api.get('/pin/list').then(({ data }) => setMyOrders(data.pinTopups ?? [])).catch(() => {});
  }, []);

  // Polling step 2
  useEffect(() => {
    if (step !== 2 || !order?.id || paymentDetected) return;
    const poll = async () => {
      try {
        if (orderSource === 'toprecargas') {
          const { data } = await api.get(`/toprecargas/order/${order.id}`);
          if (data?.status === 'DELIVERED') {
            setOrder(prev => prev ? {
              ...prev,
              status: 'DELIVERED',
              codigoEntregue: data.codigoEntregue,
              codigoMensagem: data.codigoMensagem,
            } : prev);
            setPaymentDetected(true);
            triggerPushActivation('recarga');
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        } else {
          const { data } = await api.get(`/pin/${order.id}`);
          if (data?.status === 'PAID') {
            setOrder(data);
            setPaymentDetected(true);
            triggerPushActivation('recarga');
            if (pollingRef.current) clearInterval(pollingRef.current);
          }
        }
      } catch {}
    };
    poll();
    pollingRef.current = setInterval(poll, 8000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [step, order?.id, paymentDetected, triggerPushActivation, orderSource]);

  const filtered = category === 'all' ? products : products.filter((p) => p.category === category);

  const grouped = filtered.reduce<Record<string, PinProduct[]>>((acc, p) => {
    (acc[p.brand] = acc[p.brand] ?? []).push(p);
    return acc;
  }, {});

  const handleSelect = (product: PinProduct, varAmount?: number) => {
    setSelected(product);
    setCustomAmount(varAmount ?? 0);
    setStep(1);
    setError('');
    setCouponCode('');
    setAppliedCoupon(null);
  };

  const handleCreateOrder = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    const isTR = selected.productId.startsWith('tr-');
    try {
      if (isTR) {
        const externalProductId = parseInt(selected.productId.slice(3), 10);
        const { data } = await api.post('/toprecargas/order', {
          externalProductId,
          paymentCurrency,
        });
        if (!data?.order) { setError('Resposta inválida.'); return; }
        setOrder({ ...data.order, fee: 0 });
        setOrderSource('toprecargas');
        setStep(2);
        setPaymentDetected(false);
      } else {
        const { data } = await api.post('/pin/create', {
          productId: selected.productId,
          paymentCurrency,
          ...(selected.variable ? { customAmount } : {}),
          ...(appliedCoupon ? { couponCode: appliedCoupon } : {}),
        });
        if (!data?.pinTopup) { setError('Resposta inválida.'); return; }
        setOrder(data.pinTopup);
        setMyOrders((prev) => [data.pinTopup, ...prev]);
        setOrderSource('pin');
        setStep(2);
        setPaymentDetected(false);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar pedido.');
    } finally {
      setLoading(false);
    }
  };

  const isTRSelected = selected?.productId.startsWith('tr-') ?? false;
  const effectiveAmount = selected?.variable ? customAmount : (selected?.amount ?? 0);
  const fee = isTRSelected ? 0 : (selected ? Math.ceil((effectiveAmount * 0.02 + 0.99) * 100) / 100 : 0);
  const total = isTRSelected ? effectiveAmount : (selected ? Math.ceil((effectiveAmount + fee) * 100) / 100 : 0);

  const copy = (text: string, setPinCopied?: boolean) => {
    navigator.clipboard.writeText(text);
    if (setPinCopied) { setCopiedPin(true); setTimeout(() => setCopiedPin(false), 2000); }
    else { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const reset = () => {
    setStep(0); setSelected(null); setOrder(null);
    setPaymentDetected(false); setError('');
    setCouponCode(''); setAppliedCoupon(null); setCustomAmount(0);
    setOrderSource('pin');
  };

  if (loadingProducts) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-7 h-7 text-bitcoin animate-spin" />
      </div>
    );
  }

  // ── STEP 2: PAGAMENTO ──────────────────────────────────────
  if (step === 2 && order) {
    const successCode = orderSource === 'toprecargas' ? order.codigoEntregue : order.pinCode;
    const successMessage = orderSource === 'toprecargas' ? order.codigoMensagem : order.pinMessage;
    const successLabel = orderSource === 'toprecargas' ? 'Código do app' : 'Código do gift card';

    return (
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bitcoin/15">
            <Gift className="w-4 h-4 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Loja</h1>
            <p className="text-xs text-gray-500">{order.productName}</p>
          </div>
        </div>

        {paymentDetected && successCode ? (
          <div className="bg-gradient-to-br from-green-900/40 to-emerald-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-4">
            <div className="text-4xl">🎁</div>
            <h2 className="text-lg font-bold text-white">Seu código chegou!</h2>
            <p className="text-sm text-gray-400">{order.productName}</p>

            <div className="bg-gray-900/80 rounded-xl p-4 border border-green-500/30">
              <p className="text-xs text-gray-500 mb-2">{successLabel}</p>
              <p className="font-mono text-2xl font-bold text-green-400 tracking-widest">{successCode}</p>
              <button
                onClick={() => copy(successCode, true)}
                className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                {copiedPin ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar código</>}
              </button>
            </div>

            {successMessage && (
              successMessage.length <= 50 && !/\s{2,}/.test(successMessage) ? (
                <div className="bg-gray-900/80 rounded-xl p-4 border border-purple-500/30">
                  <p className="text-xs text-gray-500 mb-2">Instruções de uso</p>
                  <p className="font-mono text-xl font-bold text-purple-400 tracking-widest">{successMessage}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(successMessage); }}
                    className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Copy className="w-4 h-4" /> Copiar
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500 leading-relaxed">{successMessage}</p>
              )
            )}

            {order.authorizationCode && (
              <p className="text-xs text-gray-600">Auth: {order.authorizationCode} · NSU: {order.serialNumber}</p>
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-bitcoin text-black font-bold text-sm hover:bg-orange-400">
                Comprar outro
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700/40 p-5 space-y-4">
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Aguardando pagamento</span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Produto</span><span className="text-white font-medium">{order.productName}</span></div>
              {order.fee > 0 && (
                <div className="flex justify-between text-gray-400"><span>Taxa</span><span className="text-bitcoin">R$ {order.fee.toFixed(2).replace('.', ',')}</span></div>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-gray-700"><span className="text-gray-300">Total</span><span className="text-bitcoin">R$ {order.totalAmount.toFixed(2).replace('.', ',')}</span></div>
            </div>

            <div className="bg-gray-900/50 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-2">Envie DePix para este endereço</p>
              <p className="font-mono text-xs text-gray-200 break-all leading-relaxed">{order.walletAddress}</p>
              <button
                onClick={() => copy(order.walletAddress)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin rounded-lg text-xs font-medium transition-colors"
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> Copiado!</> : <><Copy className="w-3.5 h-3.5" /> Copiar endereço</>}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-bitcoin shrink-0" />
              Detectando pagamento automaticamente...
            </div>

            <button onClick={reset} className="w-full py-2 rounded-xl bg-gray-700/50 text-gray-400 text-sm hover:bg-gray-700">
              Cancelar e voltar à loja
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── STEP 1: RESUMO ─────────────────────────────────────────
  if (step === 1 && selected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="flex items-center gap-2.5 mb-4">
          <button onClick={() => setStep(0)} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bitcoin/15">
            <Gift className="w-4 h-4 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Resumo do pedido</h1>
            <p className="text-xs text-gray-500">{selected.name}</p>
          </div>
        </div>

        <div className="bg-gray-800/60 rounded-xl border border-gray-700/40 p-5 space-y-4">
          {/* Product card */}
          <div className={`rounded-xl p-4 bg-gradient-to-r ${BRAND_BG[selected.brand] ?? 'from-gray-700 to-gray-600'} flex items-center gap-3`}>
            {BRAND_LOGO[selected.brand] ? (
              <img src={BRAND_LOGO[selected.brand]} alt={selected.brand} className="w-10 h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Gift className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <p className="font-bold text-white">{selected.name}</p>
              <p className="text-sm text-white/70">{selected.brand}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold text-white">R$ {effectiveAmount}</p>
            </div>
          </div>

          {/* Fee breakdown */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>{isTRSelected ? 'Valor do produto' : 'Valor do gift card'}</span>
              <span className="text-white">R$ {effectiveAmount.toFixed(2).replace('.', ',')}</span>
            </div>
            {isTRSelected ? (
              <div className="flex justify-between text-gray-400">
                <span>Taxa</span>
                <span className="text-green-400">Sem taxas</span>
              </div>
            ) : (
              <div className="flex justify-between text-gray-400">
                <span>Taxa (2% + R$ 0,99)</span>
                <span className="text-bitcoin">R$ {fee.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-700">
              <span className="text-white">Total em DePix</span>
              <span className="text-bitcoin">R$ {total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>

          <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />

          {/* Coupon — only for pin products */}
          {!isTRSelected && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1">
                <Tag className="w-3 h-3" /> Cupom (opcional)
              </label>
              <div className="flex gap-2">
                <input
                  ref={couponInputRef}
                  type="text"
                  placeholder="Código"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                  className={`${inputClass} ${focusRing} flex-1`}
                  disabled={!!appliedCoupon}
                />
                {appliedCoupon ? (
                  <button onClick={() => { setAppliedCoupon(null); setCouponCode(''); }} className="shrink-0 px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg text-xs font-medium flex items-center gap-1">
                    <X className="w-3 h-3" /> Remover
                  </button>
                ) : (
                  <button onClick={() => { if (couponCode.trim()) setAppliedCoupon(couponCode.trim()); }} disabled={!couponCode.trim()} className="shrink-0 px-3 py-1.5 bg-bitcoin/20 text-bitcoin rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-50">
                    <Check className="w-3 h-3" /> Aplicar
                  </button>
                )}
              </div>
              {appliedCoupon && <p className="mt-1 text-[10px] text-green-400 flex items-center gap-1"><Check className="w-3 h-3" /> Cupom {appliedCoupon} aplicado</p>}
              {couponError && <p className="mt-1 text-[10px] text-red-400">{couponError}</p>}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleCreateOrder}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-sm hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando pedido...</> : 'Confirmar e Pagar'}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 0: LOJA ───────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-bitcoin/15">
          <ShoppingBag className="w-5 h-5 text-bitcoin" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Loja</h1>
          <p className="text-xs text-gray-500">Gift cards e apps pagos com DePix</p>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              category === cat.id
                ? 'bg-bitcoin text-black'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Products */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum produto nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([brand, prods]) => {
            const isTRBrand = brand === 'TopRecargas';
            return (
              <div key={brand}>
                {/* Brand header */}
                <div className={`rounded-2xl p-5 bg-gradient-to-r ${BRAND_BG[brand] ?? 'from-gray-700 to-gray-600'} mb-3`}>
                  <div className="flex items-center gap-3">
                    {BRAND_LOGO[brand] ? (
                      <img src={BRAND_LOGO[brand]} alt={brand} className="w-10 h-10 object-contain" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                        <Gift className="w-5 h-5 text-white" />
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-white text-base">{brand}</p>
                      <p className="text-xs text-white/60">{prods.length} opção{prods.length > 1 ? 'ões' : ''} disponível{prods.length > 1 ? 'is' : ''}</p>
                    </div>
                    {isTRBrand && (
                      <span className="ml-auto text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">Sem taxas</span>
                    )}
                  </div>
                </div>

                {/* Value cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {prods.map((product) => product.variable ? (
                    <div
                      key={product.productId}
                      className="col-span-2 sm:col-span-3 bg-gray-800/60 border border-gray-700/40 rounded-xl p-4"
                    >
                      <p className="text-xs text-gray-500 mb-0.5">{brand} · Valor livre</p>
                      <p className="text-xs text-gray-400 mb-3">R$ {product.minAmount} – R$ {product.maxAmount}</p>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">R$</span>
                          <input
                            type="number"
                            min={product.minAmount}
                            max={product.maxAmount}
                            step="1"
                            placeholder={`${product.minAmount}–${product.maxAmount}`}
                            value={customAmounts[product.productId] ?? ''}
                            onChange={(e) => setCustomAmounts((prev) => ({ ...prev, [product.productId]: e.target.value }))}
                            className="w-full pl-9 pr-3 py-2.5 bg-gray-900/50 rounded-lg border border-gray-600 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const val = parseFloat(customAmounts[product.productId] ?? '');
                            if (!Number.isFinite(val) || val < (product.minAmount ?? 0) || val > (product.maxAmount ?? Infinity)) return;
                            handleSelect(product, val);
                          }}
                          disabled={(() => {
                            const val = parseFloat(customAmounts[product.productId] ?? '');
                            return !Number.isFinite(val) || val < (product.minAmount ?? 0) || val > (product.maxAmount ?? Infinity);
                          })()}
                          className="shrink-0 px-4 py-2.5 bg-bitcoin text-black font-bold rounded-lg text-sm disabled:opacity-40 flex items-center gap-1 hover:bg-orange-400 transition-colors"
                        >
                          Comprar <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      key={product.productId}
                      onClick={() => handleSelect(product)}
                      className="group bg-gray-800/60 hover:bg-gray-800 border border-gray-700/40 hover:border-bitcoin/50 rounded-xl p-4 text-left transition-all hover:shadow-lg hover:shadow-bitcoin/10"
                    >
                      <p className="text-xs text-gray-500 mb-1">{product.descricao ?? brand}</p>
                      <p className="text-2xl font-bold text-white mb-1">R$ {product.amount}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="text-[10px] text-gray-500">
                          {isTRBrand
                            ? <span className="text-green-400">Sem taxas</span>
                            : `+R$ ${Math.ceil((product.amount * 0.02 + 0.99) * 100) / 100} taxa`
                          }
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] text-bitcoin font-semibold group-hover:gap-1 transition-all">
                          Comprar <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My recent orders */}
      {myOrders.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Meus pedidos recentes</h2>
          <div className="space-y-2">
            {myOrders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 bg-gray-800/40 rounded-xl border border-gray-700/30">
                <div>
                  <p className="text-sm text-white font-medium">{o.productName}</p>
                  <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  {o.status === 'PAID' ? (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                      {o.pinCode ? `PIN: ${o.pinCode.slice(0, 4)}...` : 'Pago'}
                    </span>
                  ) : o.status === 'PENDING' ? (
                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium">Aguardando</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full text-xs">{o.status}</span>
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
