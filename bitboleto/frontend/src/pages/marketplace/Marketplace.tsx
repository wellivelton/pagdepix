import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { ProductCard } from '../../components/marketplace/ProductCard';
import api from '../../services/api';
import {
  Search, Filter, ShoppingBag, ChevronLeft, ChevronRight, Sparkles,
  Gift, Tv2, Loader2, Copy, Check, Clock, AlertCircle,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS } from '../../constants/productForm';
import { useNotifications } from '../../contexts/NotificationContext';
import { CurrencySelector, type Currency } from '../../components/CurrencySelector';

// ── Tipos ──────────────────────────────────────────────────────────────────────

type RvHubType = 'pin' | 'tv';

interface RvHubProduct {
  productId: string;
  name: string;
  brand?: string;
  provider?: string;
  amount: number;
  category: string;
  variable?: boolean;
  minAmount?: number;
  maxAmount?: number;
  expiresInDays?: number;
}

interface RvHubOrder {
  id: string;
  productName: string;
  brand?: string;
  provider?: string;
  amount: number;
  fee: number;
  totalAmount: number;
  walletAddress: string;
  status: string;
  pinCode?: string | null;
  pinMessage?: string | null;
  authorizationCode?: string | null;
  serialNumber?: string | null;
  createdAt: string;
}

// ── Visuais de marca ───────────────────────────────────────────────────────────

const BRAND_BG: Record<string, string> = {
  'Google Play': 'from-[#01875f] to-[#34a853]',
  'Netflix':     'from-[#831010] to-[#E50914]',
  'Xbox':        'from-[#0a4f0a] to-[#107C10]',
  'Level Up':    'from-[#cc4400] to-[#FF6600]',
  'PaySafeCard': 'from-[#003087] to-[#0070e0]',
  'SKY':         'from-[#0a1520] to-[#1a3a5c]',
  'OI TV':       'from-[#b89a00] to-[#FFD400]',
  'CLARO TV':    'from-[#9a0008] to-[#E3000F]',
};

const BRAND_TEXT: Record<string, string> = {
  'OI TV': 'text-gray-900',
};

const BRAND_LOGO: Record<string, string> = {
  'Google Play': '/brands/google-play.svg',
  'Netflix':     '/brands/netflix.svg',
  'Xbox':        '/brands/xbox.svg',
  'Level Up':    '/brands/level-up.svg',
  'SKY':         '/brands/sky.svg',
  'OI TV':       '/brands/oi-tv.svg',
  'CLARO TV':    '/brands/claro-tv.svg',
};

// Categorias RV Hub mapeadas para exibição e dropdown unificado
const RVHUB_CAT_LABELS: Record<string, string> = {
  games:     'Games',
  streaming: 'Streaming',
  tv:        'TV',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcFee(amount: number) {
  return Math.ceil((amount * 0.02 + 0.99) * 100) / 100;
}

// ── RvHubBrandCard — um card por marca, pills de valor internos ───────────────

function RvHubBrandCard({
  brandKey,
  prods,
  onSelect,
}: {
  brandKey: string;
  prods: Array<RvHubProduct & { _type: RvHubType }>;
  onSelect: (p: RvHubProduct & { _type: RvHubType }, varAmount?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [freeValue, setFreeValue] = useState('');

  const fixedProds = prods.filter((p) => !p.variable);
  const varProd    = prods.find((p) => p.variable);

  const MAX_VISIBLE = 4;
  const visible   = expanded ? fixedProds : fixedProds.slice(0, MAX_VISIBLE);
  const hiddenCnt = fixedProds.length - MAX_VISIBLE;

  const freeNum   = parseFloat(freeValue);
  const freeValid = Number.isFinite(freeNum)
    && freeNum >= (varProd?.minAmount ?? 0)
    && freeNum <= (varProd?.maxAmount ?? Infinity);

  // Expiração: pegar do primeiro produto (TV)
  const expiresInDays = prods[0]?.expiresInDays;

  return (
    <div className="bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 hover:border-gray-600/60 transition overflow-hidden flex flex-col">
      {/* Área de imagem — gradiente da marca + logo */}
      <div
        className={`aspect-[3/2] bg-gradient-to-br ${BRAND_BG[brandKey] ?? 'from-gray-700 to-gray-600'} flex items-center justify-center relative overflow-hidden flex-shrink-0`}
      >
        {BRAND_LOGO[brandKey] ? (
          <img
            src={BRAND_LOGO[brandKey]}
            alt={brandKey}
            className="w-1/2 object-contain drop-shadow-lg"
          />
        ) : (
          <span className={`font-bold text-lg px-2 text-center ${BRAND_TEXT[brandKey] ?? 'text-white'}`}>
            {brandKey}
          </span>
        )}
        {expiresInDays && (
          <div className="absolute top-2 right-2 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {expiresInDays}d
          </div>
        )}
      </div>

      {/* Corpo */}
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div>
          <h3 className="text-sm font-semibold text-white leading-snug truncate">{brandKey}</h3>
          <p className="text-[11px] text-gray-400">{RVHUB_CAT_LABELS[prods[0]?.category] ?? prods[0]?.category}</p>
        </div>

        {/* Pills de valor fixo */}
        {fixedProds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visible.map((p) => (
              <button
                key={p.productId}
                onClick={() => onSelect(p)}
                className="px-2 py-0.5 rounded-full bg-gray-700/80 border border-gray-600/60 text-[11px] font-medium text-gray-200 hover:border-bitcoin/70 hover:text-bitcoin transition-all"
              >
                R${p.amount % 1 === 0 ? p.amount.toFixed(0) : p.amount.toFixed(2)}
              </button>
            ))}
            {!expanded && hiddenCnt > 0 && (
              <button
                onClick={() => setExpanded(true)}
                className="px-2 py-0.5 rounded-full bg-gray-700/60 border border-gray-600/40 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                +{hiddenCnt}
              </button>
            )}
          </div>
        )}

        {/* Input de valor livre */}
        {varProd && (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-500">R$ {varProd.minAmount} – R$ {varProd.maxAmount}</p>
            <div className="flex gap-1">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-[11px] pointer-events-none">R$</span>
                <input
                  type="number"
                  min={varProd.minAmount}
                  max={varProd.maxAmount}
                  step="1"
                  placeholder={`${varProd.minAmount}–${varProd.maxAmount}`}
                  value={freeValue}
                  onChange={(e) => setFreeValue(e.target.value)}
                  className="w-full pl-6 pr-1 py-1 bg-gray-900/70 rounded-md border border-gray-600 text-white text-[11px] focus:border-bitcoin outline-none transition-colors"
                />
              </div>
              <button
                onClick={() => { if (freeValid) onSelect(varProd, freeNum); }}
                disabled={!freeValid}
                className="px-2.5 py-1 bg-bitcoin disabled:opacity-40 text-black font-bold text-[11px] rounded-md hover:bg-orange-400 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Marketplace unificado ──────────────────────────────────────────────────────

export default function Marketplace() {
  const { triggerPushActivation } = useNotifications();

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [pinProducts, setPinProducts]   = useState<RvHubProduct[]>([]);
  const [tvProducts, setTvProducts]     = useState<RvHubProduct[]>([]);
  const [rvLoading, setRvLoading]       = useState(true);

  const [sellerProducts, setSellerProducts]   = useState<any[]>([]);
  const [sellerCategories, setSellerCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [sellerLoading, setSellerLoading]       = useState(true);
  const [pagination, setPagination]             = useState({ page: 1, pages: 1, total: 0 });

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [search, setSearch]   = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort]         = useState('newest');
  const [page, setPage]         = useState(1);
  const [debSearch, setDebSearch] = useState('');

  // ── Fluxo de compra RV Hub ─────────────────────────────────────────────────
  const [step, setStep]                       = useState(0); // 0=browse, 1=resumo, 2=pagamento
  const [selected, setSelected]               = useState<(RvHubProduct & { _type: RvHubType }) | null>(null);
  const [selectedType, setSelectedType]       = useState<RvHubType>('pin');
  const [customAmount, setCustomAmount]       = useState<number | ''>('');
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DEPIX');
  const [buying, setBuying]                   = useState(false);
  const [buyError, setBuyError]               = useState('');
  const [order, setOrder]                     = useState<RvHubOrder | null>(null);
  const [paymentDetected, setPaymentDetected] = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [copiedPin, setCopiedPin]             = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch RV Hub ───────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.get('/pin/products').then(({ data }) => data.products ?? []).catch(() => []),
      api.get('/tv/products').then(({ data }) => data.products ?? []).catch(() => []),
    ]).then(([pin, tv]) => {
      setPinProducts(pin);
      setTvProducts(tv);
    }).finally(() => setRvLoading(false));
  }, []);

  // ── Fetch categorias de vendedores ─────────────────────────────────────────
  useEffect(() => {
    api.get('/marketplace/categories')
      .then(({ data }) => setSellerCategories(Array.isArray(data) ? data : []))
      .catch(() => setSellerCategories([]));
  }, []);

  // ── Debounce de busca ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Fetch produtos de vendedores ───────────────────────────────────────────
  useEffect(() => {
    setSellerLoading(true);
    const params: any = { page, limit: 20, sort };
    if (debSearch) params.search = debSearch;
    if (category) {
      // Categoria RV Hub pura: não filtra servidor (já filtramos client-side)
      // Categoria de vendedor: filtra no servidor
      if (!RVHUB_CAT_LABELS[category]) {
        if (sellerCategories.some((c) => c.id === category)) params.categoryId = category;
        else params.category = category;
      } else {
        // categoria RV Hub → filtra vendedores por mesmo slug, se houver
        params.category = category;
      }
    }
    api.get('/marketplace/products', { params })
      .then(({ data }) => {
        setSellerProducts(data.products || []);
        setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch(() => setSellerProducts([]))
      .finally(() => setSellerLoading(false));
  }, [page, debSearch, category, sellerCategories, sort]);

  // ── Polling pagamento (step 2) ─────────────────────────────────────────────
  useEffect(() => {
    if (step !== 2 || !order?.id || paymentDetected) return;
    const endpoint = selectedType === 'pin' ? `/pin/${order.id}` : `/tv/${order.id}`;
    const poll = async () => {
      try {
        const { data } = await api.get(endpoint);
        if (data?.status === 'PAID') {
          setOrder(data);
          setPaymentDetected(true);
          triggerPushActivation('loja');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch {}
    };
    poll();
    pollingRef.current = setInterval(poll, 8000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [step, order?.id, paymentDetected, selectedType, triggerPushActivation]);

  // ── RV Hub filtrado (client-side) ──────────────────────────────────────────
  const allRv: (RvHubProduct & { _type: RvHubType })[] = [
    ...pinProducts.map((p) => ({ ...p, _type: 'pin' as RvHubType })),
    ...tvProducts.map((p) => ({ ...p, _type: 'tv' as RvHubType })),
  ];

  const filteredRv = allRv.filter((p) => {
    const brandKey = (p.brand ?? p.provider ?? '').toLowerCase();
    const matchSearch = !debSearch || p.name.toLowerCase().includes(debSearch.toLowerCase()) || brandKey.includes(debSearch.toLowerCase());
    const matchCategory = !category || p.category === category;
    return matchSearch && matchCategory;
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectRv = (product: RvHubProduct & { _type: RvHubType }, varAmount?: number) => {
    setSelected(product);
    setSelectedType(product._type);
    setCustomAmount(varAmount !== undefined ? varAmount : (product.variable ? '' : product.amount));
    setStep(1);
    setBuyError('');
  };

  const handleCreateOrder = async () => {
    if (!selected) return;
    const amount = selected.variable ? Number(customAmount) : selected.amount;
    if (!Number.isFinite(amount) || amount <= 0) { setBuyError('Valor inválido.'); return; }
    setBuying(true);
    setBuyError('');
    try {
      const endpoint = selectedType === 'pin' ? '/pin/create' : '/tv/create';
      const body: any = { productId: selected.productId, paymentCurrency };
      if (selected.variable) body.customAmount = amount;
      const { data } = await api.post(endpoint, body);
      const orderData = data?.pinTopup ?? data?.tvTopup;
      if (!orderData) { setBuyError('Resposta inválida.'); return; }
      setOrder(orderData);
      setStep(2);
      setPaymentDetected(false);
    } catch (err: any) {
      setBuyError(err.response?.data?.error || 'Erro ao criar pedido.');
    } finally {
      setBuying(false);
    }
  };

  const copy = (text: string, isPin?: boolean) => {
    navigator.clipboard.writeText(text);
    if (isPin) { setCopiedPin(true); setTimeout(() => setCopiedPin(false), 2000); }
    else       { setCopied(true);    setTimeout(() => setCopied(false), 2000); }
  };

  const resetPurchase = () => {
    setStep(0); setSelected(null); setOrder(null);
    setPaymentDetected(false); setBuyError(''); setCustomAmount('');
  };

  const effectiveAmount = selected?.variable ? Number(customAmount) : (selected?.amount ?? 0);
  const fee   = calcFee(effectiveAmount);
  const total = Math.ceil((effectiveAmount + fee) * 100) / 100;
  const varValid = selected?.variable
    ? Number.isFinite(effectiveAmount) && effectiveAmount >= (selected.minAmount ?? 0) && effectiveAmount <= (selected.maxAmount ?? Infinity)
    : true;

  // ── STEP 2: PAGAMENTO ──────────────────────────────────────────────────────
  if (step === 2 && order) {
    const isPin = selectedType === 'pin';
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-bitcoin/15">
            {isPin ? <Gift className="w-4 h-4 text-bitcoin" /> : <Tv2 className="w-4 h-4 text-bitcoin" />}
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{isPin ? 'Gift Card' : 'Recarga TV'}</h2>
            <p className="text-xs text-gray-500">{order.productName}</p>
          </div>
        </div>

        {paymentDetected && (isPin ? order.pinCode : true) ? (
          <div className="bg-gradient-to-br from-green-900/40 to-emerald-900/30 border border-green-500/40 rounded-2xl p-6 text-center space-y-4">
            <div className="text-4xl">{isPin ? '🎁' : '📺'}</div>
            <h3 className="text-lg font-bold text-white">
              {isPin ? 'Seu código chegou!' : 'Recarga confirmada!'}
            </h3>
            <p className="text-sm text-gray-400">{order.productName}</p>
            {isPin && order.pinCode ? (
              <div className="bg-gray-900/80 rounded-xl p-4 border border-green-500/30">
                <p className="text-xs text-gray-500 mb-2">Código do gift card</p>
                <p className="font-mono text-2xl font-bold text-green-400 tracking-widest">{order.pinCode}</p>
                <button
                  onClick={() => copy(order.pinCode!, true)}
                  className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
                >
                  {copiedPin ? <><Check className="w-4 h-4" /> Copiado!</> : <><Copy className="w-4 h-4" /> Copiar código</>}
                </button>
              </div>
            ) : (
              <div className="bg-gray-900/80 rounded-xl p-4 border border-green-500/30">
                <p className="text-xs text-gray-500 mb-1">Sua recarga foi processada</p>
                <p className="text-sm text-green-400 font-medium">
                  {order.authorizationCode ? `Código: ${order.authorizationCode}` : 'Ativação em até 24h'}
                </p>
                {order.serialNumber && <p className="text-xs text-gray-500 mt-1">NSU: {order.serialNumber}</p>}
              </div>
            )}
            {isPin && order.pinMessage && (
              <p className="text-xs text-gray-500 leading-relaxed">{order.pinMessage}</p>
            )}
            <button onClick={resetPurchase} className="w-full py-2.5 rounded-xl bg-bitcoin text-black font-bold text-sm hover:bg-orange-400">
              {isPin ? 'Comprar outro' : 'Nova recarga'}
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/60 rounded-xl border border-gray-700/40 p-5 space-y-4">
            <div className="flex items-center gap-2 text-yellow-400 text-sm">
              <Clock className="w-4 h-4 shrink-0" />
              <span>Aguardando pagamento</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400"><span>Produto</span><span className="text-white font-medium">{order.productName}</span></div>
              <div className="flex justify-between text-gray-400"><span>Taxa</span><span className="text-bitcoin">R$ {order.fee.toFixed(2).replace('.', ',')}</span></div>
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
            <button onClick={resetPurchase} className="w-full py-2 rounded-xl bg-gray-700/50 text-gray-400 text-sm hover:bg-gray-700">
              Cancelar e voltar
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── STEP 1: RESUMO ─────────────────────────────────────────────────────────
  if (step === 1 && selected) {
    const brandKey = selected.brand ?? selected.provider ?? '';
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2.5 mb-4">
          <button onClick={resetPurchase} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400">
            <ChevronRightIcon className="w-4 h-4 rotate-180" />
          </button>
          <div>
            <h2 className="text-base font-bold text-white">Resumo do pedido</h2>
            <p className="text-xs text-gray-500">{selected.name}</p>
          </div>
        </div>

        <div className="bg-gray-800/60 rounded-xl border border-gray-700/40 p-5 space-y-4">
          {/* Banner da marca */}
          <div className={`rounded-xl p-4 bg-gradient-to-r ${BRAND_BG[brandKey] ?? 'from-gray-700 to-gray-600'} flex items-center gap-3`}>
            {BRAND_LOGO[brandKey] ? (
              <img src={BRAND_LOGO[brandKey]} alt={brandKey} className="w-10 h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                {selectedType === 'tv' ? <Tv2 className="w-5 h-5 text-white" /> : <Gift className="w-5 h-5 text-white" />}
              </div>
            )}
            <div>
              <p className={`font-bold ${BRAND_TEXT[brandKey] ?? 'text-white'}`}>{selected.name}</p>
              <p className={`text-sm ${BRAND_TEXT[brandKey] ? 'text-gray-700' : 'text-white/70'}`}>{brandKey}</p>
            </div>
            {!selected.variable && (
              <div className="ml-auto text-right">
                <p className={`text-2xl font-bold ${BRAND_TEXT[brandKey] ?? 'text-white'}`}>
                  R$ {effectiveAmount.toFixed(2).replace('.', ',')}
                </p>
              </div>
            )}
          </div>

          {/* Input de valor livre */}
          {selected.variable && (
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">
                Valor (R$ {selected.minAmount} – R$ {selected.maxAmount})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">R$</span>
                <input
                  type="number"
                  min={selected.minAmount}
                  max={selected.maxAmount}
                  step="1"
                  placeholder={`${selected.minAmount}–${selected.maxAmount}`}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-900/60 rounded-lg border border-gray-600 text-white focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Breakdown de preço */}
          {(!selected.variable || varValid) && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>{selectedType === 'pin' ? 'Valor do gift card' : 'Valor da recarga'}</span>
                <span className="text-white">R$ {effectiveAmount.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Taxa (2% + R$ 0,99)</span>
                <span className="text-bitcoin">R$ {fee.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-700">
                <span className="text-white">Total em DePix</span>
                <span className="text-bitcoin">R$ {total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          )}

          <CurrencySelector value={paymentCurrency} onChange={setPaymentCurrency} />

          {buyError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {buyError}
            </div>
          )}

          <button
            onClick={handleCreateOrder}
            disabled={buying || !varValid}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-sm hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {buying ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando pedido...</> : 'Confirmar e Pagar'}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 0: CATÁLOGO UNIFICADO ─────────────────────────────────────────────

  const isRvHubCategory = Boolean(RVHUB_CAT_LABELS[category]);

  // Agrupa produtos RV Hub por marca — um card por marca no grid
  const rvByBrand = filteredRv.reduce<Record<string, Array<RvHubProduct & { _type: RvHubType }>>>((acc, p) => {
    const key = p.brand ?? p.provider ?? 'Outros';
    (acc[key] = acc[key] ?? []).push(p);
    return acc;
  }, {});
  const loadingProducts = rvLoading || sellerLoading;

  return (
    <div className="space-y-5 animate-fade-in">
      <Helmet>
        <title>Loja | Gift Cards, TV e Produtos Digitais | PagDepix</title>
        <meta name="description" content="Gift cards, recargas de TV e produtos digitais pagos com DePix. Google Play, Netflix, Xbox, SKY e muito mais." />
      </Helmet>

      {/* Hero compacto */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5 text-bitcoin flex-shrink-0" />
            <span className="text-bitcoin font-semibold text-xs">Loja PagDepix</span>
          </div>
          <h1 className="text-base font-bold text-white leading-snug">
            Gift Cards, TV e Produtos Digitais
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Pague com DePix em segundos</p>
        </div>
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-bitcoin/15 flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-bitcoin" />
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Busca */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar produtos, marcas..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition"
            />
          </div>

          {/* Categoria — RV Hub + vendedores unificados */}
          <div className="relative sm:w-52">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition appearance-none cursor-pointer"
            >
              <option value="">Todas as categorias</option>
              {Object.entries(RVHUB_CAT_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
              {sellerCategories.length > 0 && (
                sellerCategories.flatMap((c: any) => [
                  <option key={c.id} value={c.id}>{c.name}</option>,
                  ...(c.children || []).map((ch: any) => (
                    <option key={ch.id} value={ch.id}>— {ch.name}</option>
                  )),
                ])
              )}
              {sellerCategories.length === 0 && (
                Object.entries(CATEGORY_LABELS)
                  .filter(([val]) => !RVHUB_CAT_LABELS[val])
                  .map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))
              )}
            </select>
          </div>

          {/* Ordenação */}
          <div className="relative sm:w-44">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition appearance-none cursor-pointer"
            >
              <option value="newest">Mais recentes</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="rating">Melhor avaliados</option>
            </select>
          </div>

          {/* Favoritos */}
          <Link
            to="/loja/favoritos"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-bitcoin/50 text-white transition text-sm"
          >
            Favoritos
          </Link>
        </div>
      </div>

      {/* Grade unificada */}
      {loadingProducts ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden animate-pulse">
              <div className="aspect-[3/2] bg-gray-700/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-gray-700/50 rounded w-3/4" />
                <div className="h-3 bg-gray-700/50 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : Object.keys(rvByBrand).length === 0 && sellerProducts.length === 0 ? (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-12 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <h3 className="text-base font-bold text-white mb-1">Nenhum produto encontrado</h3>
          <p className="text-sm text-gray-500 mb-4">
            {search || category ? 'Ajuste os filtros para encontrar o que procura.' : 'Nenhum produto disponível no momento.'}
          </p>
          {(search || category) && (
            <button
              onClick={() => { setSearch(''); setCategory(''); setPage(1); }}
              className="px-4 py-2 rounded-lg bg-bitcoin hover:bg-orange-500 text-black font-semibold text-sm transition"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Contagem total */}
          {!rvLoading && !sellerLoading && (
            <p className="text-gray-500 text-xs">
              {Object.keys(rvByBrand).length + pagination.total}{' '}
              {(Object.keys(rvByBrand).length + pagination.total) === 1 ? 'produto' : 'produtos'} encontrado
              {(Object.keys(rvByBrand).length + pagination.total) !== 1 ? 's' : ''}
            </p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {/* RV Hub — um card por marca, valores como pills */}
            {!rvLoading && Object.entries(rvByBrand).map(([brandKey, prods]) => (
              <RvHubBrandCard
                key={brandKey}
                brandKey={brandKey}
                prods={prods}
                onSelect={handleSelectRv}
              />
            ))}

            {/* Vendedores — paginado pelo servidor */}
            {!sellerLoading && sellerProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          {/* Paginação (só vendedores) */}
          {pagination.pages > 1 && !isRvHubCategory && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((x) => Math.max(1, x - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white hover:bg-gray-700/50 disabled:opacity-50 transition text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="px-4 py-2 text-gray-500 text-sm">Página {page} de {pagination.pages}</span>
              <button
                onClick={() => setPage((x) => Math.min(pagination.pages, x + 1))}
                disabled={page >= pagination.pages}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700 text-white hover:bg-gray-700/50 disabled:opacity-50 transition text-sm"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
