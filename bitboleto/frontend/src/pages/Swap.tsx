import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeftRight, ArrowRight, CheckCircle, Clock, RefreshCw, XCircle, Search, ChevronDown, Zap, Globe, Bell } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import api from '../services/api';

type SwapMode = 'liquid' | 'multi';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Coin {
  coin: string;
  name: string;
  networks: string[];
  networksWithMemo: string[];
  fixedOnly: boolean | string[];
  variableOnly: boolean | string[];
}

interface Pair {
  min: string;
  max: string;
  rate: string;
  depositCoin: string;
  settleCoin: string;
  depositNetwork: string;
  settleNetwork: string;
}

interface Shift {
  id: string;
  status: string;
  type: string;
  depositAddress: string;
  depositMemo?: string;
  depositCoin: string;
  depositNetwork: string;
  settleCoin: string;
  settleNetwork: string;
  depositAmount?: string;
  settleAmount?: string;
  depositMin?: string;
  depositMax?: string;
  expiresAt?: string;
  depositHash?: string;
  settleHash?: string;
  averageShiftSeconds?: number;
  rate?: string;
}

type ShiftType = 'fixed' | 'variable';

const POPULAR = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'MATIC', 'LTC', 'TRX']);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Aguardando depósito', color: 'text-yellow-400' },
  pending: { label: 'Processando', color: 'text-blue-400' },
  settled: { label: 'Concluído', color: 'text-green-400' },
  refund: { label: 'Reembolso pendente', color: 'text-orange-400' },
  refunded: { label: 'Reembolsado', color: 'text-gray-400' },
  expired: { label: 'Expirado', color: 'text-red-400' },
  multiple: { label: 'Múltiplos depósitos', color: 'text-orange-400' },
};

// ─── CoinSelector ─────────────────────────────────────────────────────────────

function CoinSelector({
  coins,
  value,
  network,
  onChange,
  label,
}: {
  coins: Coin[];
  value: string;
  network: string;
  onChange: (coin: string, network: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = coins.filter(
    (c) =>
      c.coin.toUpperCase().includes(search.toUpperCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selected = coins.find((c) => c.coin === value);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-800/60
          border border-[rgba(214,235,253,0.19)] rounded-lg text-sm text-white
          hover:border-bitcoin/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="font-bold text-bitcoin">{value || '—'}</span>
          {selected && <span className="text-gray-400 text-xs">{selected.name}</span>}
          {network && <span className="text-gray-600 text-xs">· {network}</span>}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-gray-900 border border-[rgba(214,235,253,0.19)]
          rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-[rgba(214,235,253,0.19)]">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-800/60 rounded-lg">
              <Search className="w-3.5 h-3.5 text-gray-500" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar moeda..."
                className="bg-transparent text-sm text-white placeholder-gray-600 outline-none flex-1"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-600 text-center py-4">Nenhuma moeda encontrada.</p>
            )}
            {filtered.map((c) =>
              c.networks.map((net) => (
                <button
                  key={`${c.coin}-${net}`}
                  type="button"
                  onClick={() => { onChange(c.coin, net); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm
                    hover:bg-bitcoin/10 transition-colors text-left
                    ${c.coin === value && net === network ? 'bg-bitcoin/10 text-bitcoin' : 'text-gray-300'}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`font-bold ${POPULAR.has(c.coin) ? 'text-white' : ''}`}>{c.coin}</span>
                    <span className="text-gray-500 text-xs">{c.name}</span>
                  </span>
                  <span className="text-gray-600 text-xs">{net}</span>
                </button>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ShiftStatus ──────────────────────────────────────────────────────────────

function ShiftStatus({ shift, onReset }: { shift: Shift; onReset: () => void }) {
  const [current, setCurrent] = useState(shift);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCurrent(shift);
    if (['settled', 'refunded', 'expired'].includes(shift.status)) return;

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get<Shift>(`/sideshift/shift/${shift.id}`);
        setCurrent(data);
        if (['settled', 'refunded', 'expired'].includes(data.status)) {
          clearInterval(pollRef.current!);
        }
      } catch {}
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [shift.id]);

  const s = STATUS_LABELS[current.status] ?? { label: current.status, color: 'text-gray-400' };
  const done = current.status === 'settled';
  const failed = ['expired', 'refunded'].includes(current.status);

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle className="w-5 h-5 text-green-400" /> :
           failed ? <XCircle className="w-5 h-5 text-red-400" /> :
           <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
          <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
        </div>
        <button onClick={onReset} className="text-xs text-gray-500 hover:text-bitcoin transition-colors">
          Novo swap
        </button>
      </div>

      {/* Deposit box */}
      {!done && !failed && (
        <div className="bg-bitcoin/5 border border-bitcoin/20 rounded-xl p-4 space-y-3">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Envie exatamente</p>
          <div className="flex items-center justify-between">
            <span className="text-xl font-black text-white">
              {current.depositAmount ?? `${current.depositMin}–${current.depositMax}`}
            </span>
            <span className="text-bitcoin font-bold text-sm">
              {current.depositCoin} <span className="text-gray-500">· {current.depositNetwork}</span>
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Para o endereço</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-300 break-all flex-1 bg-gray-800/60 rounded px-2 py-1.5">
                {current.depositAddress}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(current.depositAddress)}
                className="text-xs text-bitcoin hover:text-orange-400 whitespace-nowrap transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>
          {current.depositMemo && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Memo (obrigatório)</p>
              <code className="text-xs text-yellow-400 break-all">{current.depositMemo}</code>
            </div>
          )}
          {current.expiresAt && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              Expira: {new Date(current.expiresAt).toLocaleTimeString('pt-BR')}
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {done && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-400">Você receberá</p>
          <p className="text-xl font-black text-green-400">
            {current.settleAmount} {current.settleCoin}
          </p>
          {current.settleHash && (
            <p className="text-xs text-gray-500 break-all">TX: {current.settleHash}</p>
          )}
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
        <div>
          <span className="text-gray-600">Par</span>
          <p className="text-gray-300 font-medium">
            {current.depositCoin} → {current.settleCoin}
          </p>
        </div>
        <div>
          <span className="text-gray-600">ID</span>
          <p className="text-gray-400 font-mono">{current.id.slice(0, 12)}…</p>
        </div>
        {current.rate && (
          <div>
            <span className="text-gray-600">Taxa de câmbio</span>
            <p className="text-gray-300">1 {current.depositCoin} ≈ {parseFloat(current.rate).toFixed(6)} {current.settleCoin}</p>
          </div>
        )}
        {current.averageShiftSeconds && (
          <div>
            <span className="text-gray-600">Tempo médio</span>
            <p className="text-gray-300">{Math.ceil(current.averageShiftSeconds / 60)} min</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SideSwap types ───────────────────────────────────────────────────────────

interface SideSwapQuoteResponse {
  swapId: string;
  depositAddress: string;
  depositAsset: string;
  settleAsset: string;
  status: string;
  testnet?: boolean;
  warning?: string;
}

interface SideSwapSwapStatus {
  id: string;
  status: string;
  depositAsset: string;
  settleAsset: string;
  depositAmount: string | null;
  settleAmount: string | null;
  depositAddress: string | null;
  depositTxid: string | null;
  settleTxid: string | null;
  errorMessage: string | null;
  createdAt: string;
  testnet?: boolean;
}

interface PreviewData {
  depositAsset: string;
  settleAsset: string;
  sendAmount: number;
  receiveAmount: number;
  fixedFeeAmount: number;
  feeAsset: string;
  serviceFeePercent: number;
  rate: number;
  testnet?: boolean;
}

const SIDESWAP_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_deposit: { label: 'Aguardando depósito', color: 'text-yellow-400' },
  broadcasting:   { label: 'Executando swap atômico',   color: 'text-blue-400' },
  completed:      { label: 'Swap concluído',             color: 'text-green-400' },
  failed:         { label: 'Falhou',                     color: 'text-red-400' },
  refunded:       { label: 'Reembolsado',                color: 'text-gray-400' },
};

interface LiquidAsset {
  ticker: string;
  display: string;
  fullName: string;
  apiKey: string;
  color: string;
}

const LIQUID_ASSETS: LiquidAsset[] = [
  { ticker: 'DEPIX', display: 'DePix', fullName: 'DePix (BRL)',         apiKey: 'DEPIX', color: '#22c55e' },
  { ticker: 'USDT',  display: 'USDT',  fullName: 'Tether USD (Liquid)', apiKey: 'USDT',  color: '#26a17b' },
  { ticker: 'LBTC',  display: 'L-BTC', fullName: 'Liquid Bitcoin',      apiKey: 'LBTC',  color: '#f7931a' },
];

// Mínimos conservadores — taxa fixa SideSwap (~0.08 USDT) ≤ 10% do swap
const ASSET_MIN: Record<string, number> = {
  DEPIX: 5,       // ~R$5 — taxa fica <2%
  USDT:  1,       // ~1 USD
  LBTC:  0.00005, // ~5000 sats
};

// ─── AssetPill ────────────────────────────────────────────────────────────────

function AssetPill({
  asset,
  exclude,
  onChange,
}: {
  asset: LiquidAsset;
  exclude: string;
  onChange: (a: LiquidAsset) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const options = LIQUID_ASSETS.filter(a => a.ticker !== exclude);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800 border border-[rgba(214,235,253,0.15)]
          hover:border-[rgba(214,235,253,0.35)] transition-colors"
      >
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: asset.color }} />
        <span className="font-bold text-white text-sm">{asset.display}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 bg-gray-900 border border-[rgba(214,235,253,0.19)]
          rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
          {options.map(opt => (
            <button
              key={opt.ticker}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: opt.color }} />
              <div>
                <p className="text-sm font-bold text-white">{opt.display}</p>
                <p className="text-xs text-gray-500">{opt.fullName}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SideSwapStatus ───────────────────────────────────────────────────────────

const LOCK_DURATION_MS = 2 * 60 * 1000; // 2 min = 2 confirmações Liquid

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function SideSwapStatus({ swapId, onReset }: { swapId: string; onReset: () => void }) {
  const [status, setStatus] = useState<SideSwapSwapStatus | null>(null);
  const [verifying, setVerifying]   = useState(false);
  const [remaining, setRemaining]   = useState<number>(LOCK_DURATION_MS);
  const [refundAddr, setRefundAddr] = useState('');
  const [refundSent, setRefundSent] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundError, setRefundError] = useState('');
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { permission, isSubscribed, subscribe } = usePushNotifications();

  // Poll swap status
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<SideSwapSwapStatus>(`/sideswap/swap/${swapId}`);
        setStatus(data);
        if (['completed', 'failed', 'refunded'].includes(data.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
        // Deposit not found — allow retry
        if (data.status === 'pending_deposit') setVerifying(false);
      } catch {}
    };
    load();
    pollRef.current = setInterval(load, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [swapId]);

  // Countdown timer based on createdAt
  useEffect(() => {
    if (!status?.createdAt) return;
    const lockedUntil = new Date(status.createdAt).getTime() + LOCK_DURATION_MS;

    const tick = () => {
      const left = lockedUntil - Date.now();
      setRemaining(left);
      if (left <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status?.createdAt]);

  async function handleRefund() {
    if (!refundAddr.trim()) return;
    setRefundLoading(true);
    setRefundError('');
    try {
      await api.post(`/sideswap/refund/${swapId}`, { refundAddress: refundAddr.trim() });
      setRefundSent(true);
    } catch (e: any) {
      setRefundError(e?.response?.data?.error || 'Erro ao enviar solicitação.');
    } finally {
      setRefundLoading(false);
    }
  }

  async function handleConfirm() {
    setVerifying(true);
    try {
      await api.post(`/sideswap/confirm/${swapId}`);
    } catch {
      setVerifying(false);
    }
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 text-bitcoin animate-spin" />
      </div>
    );
  }

  const s    = SIDESWAP_STATUS_LABELS[status.status] ?? { label: status.status, color: 'text-gray-400' };
  const done   = status.status === 'completed';
  const failed = status.status === 'failed';
  const locked = remaining > 0;

  const canShowPushCTA = !isSubscribed && permission !== 'denied' && permission !== 'unsupported';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done   ? <CheckCircle className="w-5 h-5 text-green-400" /> :
           failed ? <XCircle className="w-5 h-5 text-red-400" /> :
           <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />}
          <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
        </div>
        <button onClick={onReset} className="text-xs text-gray-500 hover:text-bitcoin transition-colors">
          Novo swap
        </button>
      </div>

      {/* Push notification CTA */}
      {canShowPushCTA && !done && !failed && (
        <button
          type="button"
          onClick={subscribe}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl
            bg-gray-800/60 border border-[rgba(214,235,253,0.15)]
            hover:border-bitcoin/30 transition-colors text-left"
        >
          <Bell className="w-3.5 h-3.5 text-bitcoin flex-shrink-0" />
          <span className="text-xs text-gray-400">
            Ativar notificações — te avisamos quando o swap concluir
          </span>
        </button>
      )}

      {status.depositAddress && !done && !failed && (
        <div className="bg-bitcoin/5 border border-bitcoin/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-bitcoin" />
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
              Envie {status.depositAsset} para este endereço Liquid
            </p>
          </div>
          {status.depositAmount && (
            <p className="text-xl font-black text-white">
              {status.depositAmount} <span className="text-bitcoin">{status.depositAsset}</span>
            </p>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-1">Endereço de depósito</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-300 break-all flex-1 bg-gray-800/60 rounded px-2 py-1.5">
                {status.depositAddress}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(status.depositAddress!)}
                className="text-xs text-bitcoin hover:text-orange-400 whitespace-nowrap transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>

          {status.status === 'pending_deposit' && !verifying && (
            <>
              {/* Countdown progress bar */}
              {locked && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Aguardando confirmações Liquid</span>
                    <span className="font-mono text-gray-400">{formatCountdown(remaining)}</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-bitcoin/60 rounded-full transition-all duration-1000"
                      style={{ width: `${Math.max(0, ((LOCK_DURATION_MS - remaining) / LOCK_DURATION_MS) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirm}
                disabled={locked}
                className="w-full h-9 rounded-full bg-bitcoin/20 border border-bitcoin/30 text-bitcoin
                  text-sm font-semibold hover:bg-bitcoin/30 transition-all flex items-center justify-center gap-2
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Zap className="w-3.5 h-3.5" />
                {locked
                  ? `Disponível em ${formatCountdown(remaining)}`
                  : 'Já enviei — executar swap'}
              </button>
            </>
          )}

          {/* Verifying state */}
          {verifying && (
            <div className="flex items-center gap-2 py-1">
              <RefreshCw className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-400 font-semibold">Verificando sua transação…</p>
            </div>
          )}
          {verifying && (
            <p className="text-xs text-gray-500">
              Estamos verificando suas confirmações na Liquid Network. Você receberá uma notificação quando o swap for executado.
            </p>
          )}
        </div>
      )}

      {done && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-2">
          <p className="text-xs text-gray-400">Você recebeu</p>
          <p className="text-xl font-black text-green-400">
            {status.settleAmount} <span className="text-sm font-normal">{status.settleAsset}</span>
          </p>
          {status.settleTxid && (
            <p className="text-xs text-gray-500 break-all">TX: {status.settleTxid}</p>
          )}
        </div>
      )}

      {failed && (
        <div className="space-y-3">
          {status.errorMessage && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs text-red-400">{status.errorMessage}</p>
            </div>
          )}

          {refundSent ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
              <p className="text-xs text-green-400 font-medium">✓ Solicitação registrada</p>
              <p className="text-xs text-gray-400 mt-1">
                Entraremos em contato em até 24h para processar o reembolso.
              </p>
            </div>
          ) : (
            <div className="bg-gray-900/40 border border-[rgba(214,235,253,0.12)] rounded-xl p-3 space-y-2">
              <p className="text-xs text-gray-400 font-medium">Solicitar reembolso</p>
              <p className="text-xs text-gray-500">
                Informe um endereço Liquid (Blockstream Green, Aqua etc.) para receber seus {status.depositAsset} de volta.
              </p>
              <input
                type="text"
                placeholder="Endereço Liquid (ex: lq1qq...)"
                value={refundAddr}
                onChange={e => setRefundAddr(e.target.value)}
                className="w-full bg-gray-800 border border-[rgba(214,235,253,0.15)] rounded-lg px-3 py-2
                  text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-bitcoin/40"
              />
              {refundError && <p className="text-xs text-red-400">{refundError}</p>}
              <button
                onClick={handleRefund}
                disabled={!refundAddr.trim() || refundLoading}
                className="w-full py-2 rounded-lg text-xs font-semibold transition-colors
                  bg-bitcoin/10 border border-bitcoin/30 text-bitcoin
                  hover:bg-bitcoin/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {refundLoading ? 'Enviando...' : 'Solicitar reembolso'}
              </button>
            </div>
          )}
        </div>
      )}

      {status.testnet && (
        <p className="text-xs text-yellow-600 text-center">⚠ Testnet — valores de teste apenas</p>
      )}
    </div>
  );
}

// ─── SideSwapForm ─────────────────────────────────────────────────────────────

const LS_KEY = 'sideswap_active_id';

function SideSwapForm() {
  const [fromAsset, setFromAsset] = useState<LiquidAsset>(LIQUID_ASSETS[0]);
  const [toAsset,   setToAsset]   = useState<LiquidAsset>(LIQUID_ASSETS[1]);
  const [amount, setAmount]       = useState('');
  const [settleAddress, setSettleAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [activeSwapId, setActiveSwapId] = useState<string | null>(
    () => localStorage.getItem(LS_KEY),
  );

  const [preview, setPreview]               = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError]     = useState('');
  const [lastUpdated, setLastUpdated]       = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo]         = useState(0);
  // base rate ticker (amount=1, shown before user types)
  const [baseTicker, setBaseTicker]         = useState<PreviewData | null>(null);

  // Fetch base ticker on mount and every 15s
  useEffect(() => {
    let cancelled = false;
    async function fetchTicker() {
      try {
        const { data } = await api.get<PreviewData>('/sideswap/preview', {
          params: { depositAsset: fromAsset.apiKey, settleAsset: toAsset.apiKey, amount: 1 },
        });
        if (!cancelled) setBaseTicker(data);
      } catch {}
    }
    fetchTicker();
    const id = setInterval(fetchTicker, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [fromAsset.apiKey, toAsset.apiKey]);

  // "X s atrás" counter
  useEffect(() => {
    if (!lastUpdated) return;
    setSecondsAgo(0);
    const id = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  // Fetch preview on amount/pair change (debounced 700ms)
  useEffect(() => {
    const amtNum = parseFloat(amount);
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      setPreview(null);
      setPreviewError('');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get<PreviewData>('/sideswap/preview', {
          params: { depositAsset: fromAsset.apiKey, settleAsset: toAsset.apiKey, amount: amtNum },
        });
        setPreview(data);
        setLastUpdated(Date.now());
      } catch (e: any) {
        setPreviewError(e?.response?.data?.error || 'Sem cotação disponível.');
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [amount, fromAsset.apiKey, toAsset.apiKey]);

  // Auto-refresh preview every 15s when amount is filled
  useEffect(() => {
    const amtNum = parseFloat(amount);
    if (!amount || isNaN(amtNum) || amtNum <= 0) return;
    const id = setInterval(async () => {
      try {
        const { data } = await api.get<PreviewData>('/sideswap/preview', {
          params: { depositAsset: fromAsset.apiKey, settleAsset: toAsset.apiKey, amount: amtNum },
        });
        setPreview(data);
        setLastUpdated(Date.now());
      } catch {}
    }, 15_000);
    return () => clearInterval(id);
  }, [amount, fromAsset.apiKey, toAsset.apiKey]);

  function swapAssets() {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setPreview(null);
    setBaseTicker(null);
  }

  const amtNum = parseFloat(amount);
  const minAmount = ASSET_MIN[fromAsset.ticker] ?? 0;
  const belowMin = !!amount && amtNum > 0 && amtNum < minAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settleAddress.trim()) { setError('Informe o endereço de destino.'); return; }
    if (!amount || amtNum <= 0) { setError('Informe o valor a enviar.'); return; }
    if (belowMin) { setError(`Valor mínimo: ${minAmount} ${fromAsset.display}`); return; }
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post<SideSwapQuoteResponse>('/sideswap/quote', {
        depositAsset: fromAsset.apiKey,
        settleAsset:  toAsset.apiKey,
        settleAddress: settleAddress.trim(),
        amount: parseFloat(amount),
      });
      localStorage.setItem(LS_KEY, data.swapId);
      setActiveSwapId(data.swapId);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao criar swap. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  function formatAmount(n: number, decimals = 8) {
    if (!n) return '—';
    const s = n.toFixed(decimals);
    return parseFloat(s).toString();
  }

  if (activeSwapId) {
    return (
      <div className="bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-5">
        <SideSwapStatus
          swapId={activeSwapId}
          onReset={() => {
            localStorage.removeItem(LS_KEY);
            setActiveSwapId(null);
            setAmount('');
            setSettleAddress('');
            setPreview(null);
          }}
        />
      </div>
    );
  }

  const hasRate = preview && !previewLoading;
  const displayRate = preview?.rate ?? baseTicker?.rate;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">

      {/* Live rate ticker */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-gray-500">
            {displayRate
              ? <>1 {fromAsset.display} ≈ <span className="text-gray-300 font-mono">{displayRate.toFixed(6)}</span> {toAsset.display}</>
              : <span className="text-gray-700">Carregando cotação…</span>}
          </span>
        </div>
        {lastUpdated && (
          <span className="text-xs text-gray-700">
            {secondsAgo < 5 ? 'agora' : `${secondsAgo}s atrás`}
          </span>
        )}
      </div>

      {/* FROM panel */}
      <div className="bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Enviar</p>
        <div className="flex items-center gap-3">
          <AssetPill
            asset={fromAsset}
            exclude={toAsset.ticker}
            onChange={a => { setFromAsset(a); setPreview(null); setBaseTicker(null); }}
          />
          <div className="flex-1 flex flex-col items-end gap-0.5">
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-transparent text-right text-2xl font-black text-white placeholder-gray-500
                outline-none cursor-text border-b border-[rgba(214,235,253,0.12)] focus:border-bitcoin/50
                pb-0.5 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-gray-600 uppercase tracking-wider">Valor</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-gray-600">
            Mínimo: <span className="text-gray-500 font-mono">{ASSET_MIN[fromAsset.ticker]} {fromAsset.display}</span>
          </span>
          {amount && parseFloat(amount) > 0 && parseFloat(amount) < ASSET_MIN[fromAsset.ticker] && (
            <span className="text-xs text-red-400 font-semibold">
              Abaixo do mínimo
            </span>
          )}
          {!amount && (
            <span className="text-xs text-gray-600">{fromAsset.fullName}</span>
          )}
        </div>
      </div>

      {/* Swap direction button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={swapAssets}
          className="w-9 h-9 rounded-full border border-[rgba(214,235,253,0.19)] bg-gray-800/80
            flex items-center justify-center hover:border-bitcoin/50 hover:bg-bitcoin/10
            hover:rotate-180 transition-all duration-300"
        >
          <ArrowLeftRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* TO panel */}
      <div className={`rounded-xl p-4 border transition-colors ${
        hasRate
          ? 'bg-gray-900/60 border-[rgba(214,235,253,0.25)]'
          : 'bg-gray-900/40 border-[rgba(214,235,253,0.12)]'
      }`}>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Receber (estimado)</p>
        <div className="flex items-center gap-3">
          <AssetPill
            asset={toAsset}
            exclude={fromAsset.ticker}
            onChange={a => { setToAsset(a); setPreview(null); setBaseTicker(null); }}
          />
          <div className="flex-1 text-right">
            {previewLoading ? (
              <RefreshCw className="w-4 h-4 text-gray-600 animate-spin ml-auto" />
            ) : hasRate ? (
              <p className="text-2xl font-black text-white">
                ≈ {formatAmount(preview!.receiveAmount, 6)}
              </p>
            ) : (
              <p className="text-2xl font-black text-gray-700">—</p>
            )}
          </div>
        </div>
        <p className="text-right text-xs text-gray-600 mt-1">{toAsset.fullName}</p>
      </div>

      {/* Rate + fee breakdown */}
      {(hasRate || previewError) && (
        <div className={`rounded-xl border px-4 py-3 text-xs space-y-2 ${
          previewError
            ? 'bg-red-500/5 border-red-500/20 text-red-400'
            : 'bg-gray-900/40 border-[rgba(214,235,253,0.12)]'
        }`}>
          {previewError && <p>{previewError}</p>}
          {hasRate && !previewError && (
            <>
              <div className="flex justify-between text-gray-400">
                <span>Taxa de câmbio</span>
                <span className="font-mono text-gray-300">
                  1 {fromAsset.display} ≈ {preview!.rate.toFixed(8)} {toAsset.display}
                </span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Taxa de serviço (~{preview!.serviceFeePercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%)</span>
                <span className="font-mono text-gray-400">plataforma + SideSwap</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Taxa de rede (fixa)</span>
                <span className="font-mono">
                  {formatAmount(preview!.fixedFeeAmount, 6)} {preview!.feeAsset}
                </span>
              </div>
              {preview!.testnet && (
                <p className="text-yellow-600 text-center">⚠ Testnet</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Destination address */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          Endereço de destino ({toAsset.display}) · Liquid Network
        </label>
        <input
          type="text"
          value={settleAddress}
          onChange={e => setSettleAddress(e.target.value)}
          placeholder="lq1qq..."
          className="w-full px-3 py-2.5 bg-gray-800/60 border border-[rgba(214,235,253,0.19)] rounded-xl
            text-sm text-white placeholder-gray-600 outline-none focus:border-bitcoin/50 transition-colors
            font-mono"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !settleAddress.trim() || !amount || amtNum <= 0 || belowMin}
        className="w-full h-11 rounded-full bg-gradient-to-r from-bitcoin to-orange-500 text-black
          text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed
          hover:shadow-xl hover:shadow-bitcoin/30 transition-all flex items-center justify-center gap-2"
      >
        {submitting
          ? <RefreshCw className="w-4 h-4 animate-spin" />
          : <><Zap className="w-4 h-4" /> Criar Swap Atômico</>}
      </button>

      <p className="text-xs text-gray-600 text-center">
        ⚡ SideSwap · Atomic Swap · Liquid Network · Sem custódia
      </p>
    </form>
  );
}

// ─── ModeSelector ─────────────────────────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: SwapMode; onChange: (m: SwapMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-5">
      <button
        type="button"
        onClick={() => onChange('liquid')}
        className={`p-4 rounded-xl border text-left transition-all ${
          mode === 'liquid'
            ? 'bg-bitcoin/10 border-bitcoin/40 text-white'
            : 'bg-gray-900/40 border-[rgba(214,235,253,0.12)] text-gray-400 hover:border-[rgba(214,235,253,0.25)]'
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Zap className={`w-4 h-4 ${mode === 'liquid' ? 'text-bitcoin' : 'text-gray-500'}`} />
          <span className="text-sm font-bold">Liquid Network</span>
        </div>
        <p className="text-xs text-gray-500 leading-tight">DePix ↔ USDT · DePix ↔ L-BTC · Atomic Swap</p>
      </button>

      <button
        type="button"
        onClick={() => onChange('multi')}
        className={`p-4 rounded-xl border text-left transition-all ${
          mode === 'multi'
            ? 'bg-bitcoin/10 border-bitcoin/40 text-white'
            : 'bg-gray-900/40 border-[rgba(214,235,253,0.12)] text-gray-400 hover:border-[rgba(214,235,253,0.25)]'
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Globe className={`w-4 h-4 ${mode === 'multi' ? 'text-bitcoin' : 'text-gray-500'}`} />
          <span className="text-sm font-bold">Outras Criptos</span>
        </div>
        <p className="text-xs text-gray-500 leading-tight">200+ ativos multi-rede via SideShift.ai</p>
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Swap() {
  const [mode, setMode] = useState<SwapMode>('liquid');
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinsLoading, setCoinsLoading] = useState(false);

  const [depositCoin, setDepositCoin] = useState('BTC');
  const [depositNetwork, setDepositNetwork] = useState('bitcoin');
  const [settleCoin, setSettleCoin] = useState('ETH');
  const [settleNetwork, setSettleNetwork] = useState('ethereum');

  const [shiftType, setShiftType] = useState<ShiftType>('variable');
  const [amount, setAmount] = useState('');
  const [settleAddress, setSettleAddress] = useState('');
  const [refundAddress, setRefundAddress] = useState('');

  const [pair, setPair] = useState<Pair | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairError, setPairError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeShift, setActiveShift] = useState<Shift | null>(null);

  // Load coins only when entering multi mode
  useEffect(() => {
    if (mode !== 'multi') return;
    setCoinsLoading(true);
    api.get<{ coins: Coin[] }>('/sideshift/coins')
      .then(({ data }) => setCoins(data.coins))
      .catch(() => {})
      .finally(() => setCoinsLoading(false));
  }, [mode]);

  // Fetch pair rate whenever pair changes
  const fetchPair = useCallback(async () => {
    if (!depositCoin || !settleCoin || depositCoin === settleCoin) return;
    setPairLoading(true);
    setPairError('');
    try {
      const from = `${depositCoin.toLowerCase()}-${depositNetwork}`;
      const to = `${settleCoin.toLowerCase()}-${settleNetwork}`;
      const params: Record<string, string> = { from, to };
      if (amount) params.amount = amount;
      const { data } = await api.get<Pair>('/sideshift/pair', { params });
      setPair(data);
    } catch (e: any) {
      setPairError(e?.response?.data?.error || 'Par não disponível.');
      setPair(null);
    } finally {
      setPairLoading(false);
    }
  }, [depositCoin, depositNetwork, settleCoin, settleNetwork, amount]);

  useEffect(() => {
    const t = setTimeout(fetchPair, 600);
    return () => clearTimeout(t);
  }, [fetchPair]);

  function swapCoins() {
    setDepositCoin(settleCoin);
    setDepositNetwork(settleNetwork);
    setSettleCoin(depositCoin);
    setSettleNetwork(depositNetwork);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!settleAddress.trim()) { setError('Informe o endereço de destino.'); return; }
    setError('');
    setSubmitting(true);

    try {
      if (shiftType === 'fixed') {
        // 1. Get quote
        const { data: quote } = await api.post('/sideshift/quote', {
          depositCoin,
          depositNetwork,
          settleCoin,
          settleNetwork,
          depositAmount: amount || undefined,
        });
        // 2. Create fixed shift
        const { data: shift } = await api.post<Shift>('/sideshift/shift/fixed', {
          quoteId: quote.id,
          settleAddress: settleAddress.trim(),
          refundAddress: refundAddress.trim() || undefined,
        });
        setActiveShift(shift);
      } else {
        const { data: shift } = await api.post<Shift>('/sideshift/shift/variable', {
          depositCoin,
          depositNetwork,
          settleCoin,
          settleNetwork,
          settleAddress: settleAddress.trim(),
          refundAddress: refundAddress.trim() || undefined,
        });
        setActiveShift(shift);
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Erro ao criar swap. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <ArrowLeftRight className="w-5 h-5 text-bitcoin" />
          Swap de Cripto
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Liquid Network (DePix) ou 200+ ativos multi-rede
        </p>
      </div>

      <ModeSelector mode={mode} onChange={(m) => { setMode(m); setActiveShift(null); }} />

      {mode === 'liquid' ? (
        <SideSwapForm />
      ) : coinsLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-bitcoin animate-spin" />
        </div>
      ) : activeShift ? (
        <div className="bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-5">
          <ShiftStatus shift={activeShift} onReset={() => { setActiveShift(null); setAmount(''); setSettleAddress(''); }} />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Shift type toggle */}
          <div className="flex gap-2 p-1 bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl">
            {(['variable', 'fixed'] as ShiftType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setShiftType(t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  shiftType === t
                    ? 'bg-bitcoin text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'variable' ? 'Variável' : 'Taxa Fixada'}
              </button>
            ))}
          </div>

          {/* Coin pair */}
          <div className="bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-4 space-y-3">
            <CoinSelector
              coins={coins}
              value={depositCoin}
              network={depositNetwork}
              onChange={(c, n) => { setDepositCoin(c); setDepositNetwork(n); }}
              label="Enviar"
            />

            {/* Swap button */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={swapCoins}
                className="w-8 h-8 rounded-full border border-[rgba(214,235,253,0.19)] bg-gray-800
                  flex items-center justify-center hover:border-bitcoin/50 hover:bg-bitcoin/10 transition-all"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>

            <CoinSelector
              coins={coins}
              value={settleCoin}
              network={settleNetwork}
              onChange={(c, n) => { setSettleCoin(c); setSettleNetwork(n); }}
              label="Receber"
            />
          </div>

          {/* Amount (fixed only) */}
          {shiftType === 'fixed' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Quantidade a enviar ({depositCoin})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={pair ? `Min ${pair.min} · Max ${pair.max}` : 'Ex: 0.01'}
                className="w-full px-3 py-2.5 bg-gray-800/60 border border-[rgba(214,235,253,0.19)] rounded-lg
                  text-sm text-white placeholder-gray-600 outline-none
                  focus:border-bitcoin/50 transition-colors"
              />
            </div>
          )}

          {/* Rate card */}
          {(pairLoading || pair || pairError) && (
            <div className={`rounded-xl p-3.5 border text-sm ${
              pairError
                ? 'bg-red-500/5 border-red-500/20 text-red-400'
                : 'bg-gray-900/60 border-[rgba(214,235,253,0.19)] text-gray-300'
            }`}>
              {pairLoading && <span className="text-gray-500">Buscando cotação…</span>}
              {pairError && !pairLoading && pairError}
              {pair && !pairLoading && !pairError && (
                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Taxa</span>
                    <span className="font-mono">1 {depositCoin} ≈ {parseFloat(pair.rate).toFixed(6)} {settleCoin}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Min</span>
                    <span className="text-gray-400">{pair.min} {depositCoin}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">Max</span>
                    <span className="text-gray-400">{pair.max} {depositCoin}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Settle address */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Endereço de destino ({settleCoin})
            </label>
            <input
              type="text"
              value={settleAddress}
              onChange={(e) => setSettleAddress(e.target.value)}
              placeholder={`Seu endereço ${settleCoin}`}
              className="w-full px-3 py-2.5 bg-gray-800/60 border border-[rgba(214,235,253,0.19)] rounded-lg
                text-sm text-white placeholder-gray-600 outline-none
                focus:border-bitcoin/50 transition-colors font-mono"
            />
          </div>

          {/* Refund address (optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Endereço de reembolso ({depositCoin}) <span className="text-gray-600 normal-case font-normal">— opcional</span>
            </label>
            <input
              type="text"
              value={refundAddress}
              onChange={(e) => setRefundAddress(e.target.value)}
              placeholder={`Seu endereço ${depositCoin} para reembolso`}
              className="w-full px-3 py-2.5 bg-gray-800/60 border border-[rgba(214,235,253,0.19)] rounded-lg
                text-sm text-white placeholder-gray-600 outline-none
                focus:border-bitcoin/50 transition-colors font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !!pairError || !settleAddress.trim()}
            className="w-full h-10 rounded-full bg-gradient-to-r from-bitcoin to-orange-500 text-black
              text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed
              hover:shadow-xl hover:shadow-bitcoin/30 transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Criar Swap <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-xs text-gray-600 text-center">
            Powered by SideShift.ai · Taxas de rede inclusas · Sem KYC
          </p>
        </form>
      )}
    </div>
  );
}
