import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, TrendingUp, TrendingDown, ArrowRight, ArrowUpRight,
  Package, Link2, Settings, ShoppingBag, Target, CheckCircle2,
  Pencil, X, Check, Zap, Receipt, BarChart2,
} from 'lucide-react';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

/* ─── Types ─────────────────────────────────────────────────────── */
type Period = 'today' | 'week' | 'month' | 'all';

type Statistics = {
  useCustomFees?: boolean;
  customFixedFee?: number | null;
  customVariablePercent?: number | null;
  grossRevenue: { all: number; today: number; week: number; month: number };
  totalFees:    { all: number; today: number; week: number; month: number };
  pagdepixProfit:{ all: number; today: number; week: number; month: number };
  counts:       { all: number; today: number; week: number; month: number };
  topLinks: Array<{ titulo: string; slug: string; amount: number; count: number; total: number }>;
  dailyRevenue: Array<{ date: string; amount: number }>;
  recentPayments: Array<{ id: string; amount: number; linkTitle: string; linkSlug: string; createdAt: string }>;
  limits?: {
    daily:   { total: number; used: number; renewal: string };
    monthly: { total: number | null; used: number; renewal: string };
    transactionLimit?: number;
    dailyPayerLimit?: number;
    collateralBalance?: number;
  };
  feesByOperation?: Array<{ operation: string; fixed: number; percent: number; type: string; description?: string }>;
};

/* ─── Helpers ────────────────────────────────────────────────────── */
const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function relativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)   return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/* ─── Skeleton ───────────────────────────────────────────────────── */
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-700/40 rounded-lg ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}

/* ─── SVG Line Chart ─────────────────────────────────────────────── */
function LineChart({ data }: { data: Array<{ date: string; amount: number }> }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: number; date: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center">
        <p className="text-xs text-gray-500">Dados insuficientes para o gráfico</p>
      </div>
    );
  }

  const W = 600, H = 120, PX = 4, PY = 12;
  const vals = data.map(d => d.amount);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const range = max - min || 1;

  const px = (i: number) => PX + (i / (data.length - 1)) * (W - PX * 2);
  const py = (v: number) => H - PY - ((v - min) / range) * (H - PY * 2);

  // Smooth cubic bezier path
  let path = `M ${px(0)} ${py(vals[0])}`;
  for (let i = 1; i < vals.length; i++) {
    const x0 = px(i - 1), y0 = py(vals[i - 1]);
    const x1 = px(i),     y1 = py(vals[i]);
    const cx = (x0 + x1) / 2;
    path += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }

  const area = `${path} L ${px(vals.length - 1)} ${H} L ${px(0)} ${H} Z`;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.min(data.length - 1, Math.max(0, Math.round((relX - PX) / (W - PX * 2) * (data.length - 1))));
    setTooltip({ x: (px(idx) / W) * 100, y: (py(vals[idx]) / H) * 100, value: vals[idx], date: data[idx].date });
  }, [data, vals]);

  return (
    <div className="relative" onMouseLeave={() => setTooltip(null)}>
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none -translate-x-1/2 -translate-y-full bg-gray-900 border border-gray-600 rounded-lg px-2.5 py-1.5 text-[11px] text-white shadow-xl"
          style={{ left: `${tooltip.x}%`, top: `${tooltip.y}%` }}
        >
          <p className="font-bold text-bitcoin">{BRL(tooltip.value)}</p>
          <p className="text-gray-400">{new Date(tooltip.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</p>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-32 overflow-visible"
        onMouseMove={handleMouseMove}
      >
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Horizontal grid lines */}
        {[0.25, 0.5, 0.75].map(t => (
          <line
            key={t}
            x1={PX} y1={PY + t * (H - PY * 2)}
            x2={W - PX} y2={PY + t * (H - PY * 2)}
            stroke="#374151" strokeWidth="0.5" strokeDasharray="4,4"
          />
        ))}
        {/* Area fill */}
        <path d={area} fill="url(#chartGrad)" />
        {/* Line */}
        <path d={path} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Hover dot */}
        {tooltip && (
          <circle
            cx={px(Math.min(data.length - 1, Math.max(0, Math.round((tooltip.x / 100 * W - PX) / (W - PX * 2) * (data.length - 1)))))}
            cy={py(tooltip.value)}
            r="4" fill="#f97316" stroke="#fff" strokeWidth="2"
          />
        )}
      </svg>
      {/* X-axis labels */}
      <div className="flex justify-between mt-1 px-1">
        {[data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].map((d, i) => (
          <span key={i} className="text-[10px] text-gray-500">
            {new Date(d.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Period Tab ─────────────────────────────────────────────────── */
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje', week: 'Semana', month: 'Mês', all: 'Total',
};

function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-gray-900/60 rounded-xl p-1 w-fit">
      {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
            value === p
              ? 'bg-bitcoin text-black shadow-sm shadow-bitcoin/30'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

/* ─── MetricCard ─────────────────────────────────────────────────── */
function MetricCard({
  label, value, sub, icon: Icon, trend, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: 'up' | 'down' | null; accent?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border flex flex-col gap-2 ${
      accent
        ? 'bg-gradient-to-br from-bitcoin/20 to-orange-500/10 border-bitcoin/30'
        : 'bg-gray-800/50 border-gray-700/40 hover:border-gray-600/60 transition-colors'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className={`p-1.5 rounded-lg ${accent ? 'bg-bitcoin/20' : 'bg-gray-700/50'}`}>
          <Icon className={`w-3.5 h-3.5 ${accent ? 'text-bitcoin' : 'text-gray-400'}`} />
        </span>
      </div>
      <div>
        <p className={`text-xl font-bold tracking-tight ${accent ? 'text-white' : 'text-white'}`}>{value}</p>
        {sub && (
          <div className="flex items-center gap-1 mt-0.5">
            {trend === 'up' && <TrendingUp className="w-3 h-3 text-emerald-400" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3 text-red-400" />}
            <span className={`text-[11px] ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-500'}`}>{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Meta (Goal) Component ──────────────────────────────────────── */
const GOAL_KEY = 'comercio_meta_mensal';

function GoalCard({ monthRevenue }: { monthRevenue: number }) {
  const saved = parseFloat(localStorage.getItem(GOAL_KEY) || '0');
  const [goal, setGoal] = useState(saved);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(saved > 0 ? saved.toString() : '');

  const saveGoal = () => {
    const val = parseFloat(input.replace(',', '.'));
    if (!isNaN(val) && val > 0) {
      setGoal(val);
      localStorage.setItem(GOAL_KEY, val.toString());
    }
    setEditing(false);
  };

  const pct = goal > 0 ? Math.min(100, (monthRevenue / goal) * 100) : 0;
  const done = pct >= 100;

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-purple-500/20">
            <Target className="w-3.5 h-3.5 text-purple-400" />
          </span>
          <span className="text-xs font-semibold text-white">Meta do Mês</span>
        </div>
        <button
          type="button"
          onClick={() => { setEditing(true); setInput(goal > 0 ? goal.toString() : ''); }}
          className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">R$</span>
          <input
            autoFocus
            type="number"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveGoal()}
            placeholder="5000"
            className="flex-1 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-bitcoin/60 focus:outline-none"
          />
          <button type="button" onClick={saveGoal} className="p-1.5 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin transition">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-500 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : goal > 0 ? (
        <>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">{BRL(monthRevenue)}</span>
              <span className="text-gray-500">{BRL(goal)}</span>
            </div>
            <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-emerald-500' : 'bg-gradient-to-r from-bitcoin to-orange-400'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${done ? 'text-emerald-400' : 'text-bitcoin'}`}>
                {pct.toFixed(0)}%
              </span>
              {done ? (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Meta atingida!
                </span>
              ) : (
                <span className="text-xs text-gray-500">Faltam {BRL(goal - monthRevenue)}</span>
              )}
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-gray-500 hover:text-bitcoin transition py-2 text-center"
        >
          Definir meta mensal →
        </button>
      )}
    </div>
  );
}

/* ─── Quick Actions ──────────────────────────────────────────────── */
function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { icon: Link2,     label: 'Novo Link',     sub: 'Pix direto',    path: '/comercio/links',          primary: true },
    { icon: Package,   label: 'Produtos',       sub: 'Gerencie',      path: '/comercio/loja/produtos',  primary: false },
    { icon: ShoppingBag, label: 'Vendas',       sub: 'Ver pedidos',   path: '/comercio/loja/vendas',    primary: false },
    { icon: Settings,  label: 'Configurações',  sub: 'Loja e conta',  path: '/comercio/config',         primary: false },
  ];

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4">
      <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">Ações Rápidas</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {actions.map(({ icon: Icon, label, sub, path, primary }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all group ${focusRing} ${
              primary
                ? 'bg-gradient-to-br from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 hover:-translate-y-0.5'
                : 'bg-gray-700/40 hover:bg-gray-700/70 border border-gray-700/30 hover:border-gray-600/50'
            }`}
          >
            <span className={`p-2 rounded-lg ${primary ? 'bg-black/15' : 'bg-gray-600/50'}`}>
              <Icon className={`w-4 h-4 ${primary ? 'text-black' : 'text-gray-300'}`} />
            </span>
            <div className="text-center">
              <p className={`text-xs font-bold ${primary ? 'text-black' : 'text-white'}`}>{label}</p>
              <p className={`text-[10px] ${primary ? 'text-black/60' : 'text-gray-500'}`}>{sub}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Recent Payments ────────────────────────────────────────────── */
function RecentPayments({
  payments, onViewAll,
}: {
  payments: Statistics['recentPayments'];
  onViewAll: () => void;
}) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Últimos Pagamentos</p>
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-bitcoin transition"
        >
          Ver todos <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {payments.length === 0 ? (
        <div className="py-6 text-center">
          <Receipt className="w-8 h-8 text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Nenhum pagamento ainda</p>
          <p className="text-xs text-gray-600 mt-0.5">Os pagamentos confirmados aparecem aqui</p>
        </div>
      ) : (
        <div className="space-y-1">
          {payments.slice(0, 6).map(p => (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-900/40 hover:bg-gray-900/70 transition group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{p.linkTitle || 'Pagamento'}</p>
                  <p className="text-[10px] text-gray-500">{relativeDate(p.createdAt)}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-emerald-400 flex-shrink-0">{BRL(p.amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Limits Mini Card ───────────────────────────────────────────── */
function LimitBar({ label, used, total, color = 'bg-bitcoin' }: { label: string; used: number; total: number; color?: string }) {
  if (!total) return null;
  const pct = Math.min(100, (used / total) * 100);
  const warn = pct > 80;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-gray-400">{label}</span>
        <span className={warn ? 'text-red-400' : 'text-gray-400'}>{BRL(used)} / {BRL(total)}</span>
      </div>
      <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${warn ? 'bg-red-500' : color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────── */
export default function ComercioDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');

  useEffect(() => {
    let cancelled = false;
    api.get<Statistics>('/commerce/statistics')
      .then(res => { if (!cancelled) setStats(res.data); })
      .catch(err => {
        if (!cancelled) {
          const d = err?.response?.data;
          setError(d?.error || err?.message || 'Erro ao carregar dados');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-4">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  const gross  = stats.grossRevenue[period];
  const fees   = stats.totalFees[period];
  const net    = gross - fees;
  const orders = stats.counts[period];
  const ticket = orders > 0 ? gross / orders : 0;

  // Compare current period net vs a rough "prior" estimate (today vs yesterday not available, so skip trend for total)
  const showTrend = period !== 'all';

  return (
    <div className="space-y-4 pb-4">
      {/* ── Hero: Saldo Líquido ─────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 via-gray-800/90 to-gray-900 border border-gray-700/50 p-5">
        {/* Decorative glow */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-bitcoin/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">Valor líquido recebido</p>
              <p className="text-4xl font-bold tracking-tight text-white">{BRL(net)}</p>
              <p className="text-xs text-gray-500 mt-1">{BRL(gross)} bruto · {BRL(fees)} em taxas</p>
            </div>
            <div className="p-3 bg-bitcoin/15 rounded-xl flex-shrink-0">
              <Wallet className="w-5 h-5 text-bitcoin" />
            </div>
          </div>
          <PeriodTabs value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Receita Bruta"
          value={BRL(gross)}
          sub={showTrend && gross > 0 ? `${orders} ${orders === 1 ? 'pedido' : 'pedidos'}` : undefined}
          icon={BarChart2}
        />
        <MetricCard
          label="Pedidos"
          value={String(orders)}
          sub={ticket > 0 ? `Ticket médio ${BRL(ticket)}` : undefined}
          icon={Receipt}
        />
        <MetricCard
          label="Taxas pagas"
          value={BRL(fees)}
          sub={gross > 0 ? `${((fees / gross) * 100).toFixed(1)}% da receita` : undefined}
          icon={Zap}
          trend={fees > 0 ? 'down' : null}
        />
        <MetricCard
          label="Faturamento Mensal"
          value={BRL(stats.grossRevenue.month)}
          sub={stats.counts.month > 0 ? `${stats.counts.month} pedidos` : 'Nenhum ainda'}
          icon={TrendingUp}
          accent
        />
      </div>

      {/* ── Chart ──────────────────────────────────────────── */}
      {stats.dailyRevenue.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-white">Faturamento — 30 dias</p>
              <p className="text-xs text-gray-500 mt-0.5">Receita bruta diária</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-bitcoin">{BRL(stats.dailyRevenue.reduce((s, d) => s + d.amount, 0))}</p>
              <p className="text-xs text-gray-500">período</p>
            </div>
          </div>
          <LineChart data={stats.dailyRevenue} />
        </div>
      )}

      {/* ── Meta + Ações ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GoalCard monthRevenue={stats.grossRevenue.month} />
        <QuickActions />
      </div>

      {/* ── Limits (if available) ──────────────────────────── */}
      {stats.limits && (stats.limits.daily.total > 0 || (stats.limits.monthly.total ?? 0) > 0) && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Limites de Operação</p>
            <button
              type="button"
              onClick={() => navigate('/comercio/colateral')}
              className="text-xs text-gray-500 hover:text-bitcoin transition flex items-center gap-0.5"
            >
              Aumentar <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <LimitBar label="Diário" used={stats.limits.daily.used} total={stats.limits.daily.total} />
          {stats.limits.monthly.total && (
            <LimitBar label="Mensal" used={stats.limits.monthly.used} total={stats.limits.monthly.total} color="bg-purple-500" />
          )}
        </div>
      )}

      {/* ── Top Links ──────────────────────────────────────── */}
      {stats.topLinks.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/40 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Links Mais Usados</p>
          <div className="space-y-1">
            {stats.topLinks.slice(0, 4).map((link, i) => (
              <a
                key={i}
                href={`${window.location.origin}/pay/${link.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-900/40 hover:bg-gray-900/70 transition group"
              >
                <div className="w-6 h-6 rounded-full bg-bitcoin/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-bitcoin">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate group-hover:text-bitcoin transition">{link.titulo || link.slug}</p>
                  <p className="text-[10px] text-gray-500">{link.count} pagamentos</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-white">{BRL(link.total)}</p>
                  <p className="text-[10px] text-gray-500">total</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Payments ────────────────────────────────── */}
      <RecentPayments
        payments={stats.recentPayments}
        onViewAll={() => navigate('/comercio/historico')}
      />
    </div>
  );
}
