import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CreditCard, Smartphone, QrCode, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

type Period = '7d' | '30d' | '90d' | 'all';

const PERIODS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: '7d',  label: '7d'   },
  { id: '30d', label: '30d'  },
  { id: '90d', label: '90d'  },
  { id: 'all', label: 'Tudo' },
] as const;

const PAID_STATUSES = new Set([
  'PAID', 'COMPLETED', 'APPROVED', 'PROCESSADO',
  'CONFIRMADO', 'CONCLUIDO', 'PAGO',
]);
const PENDING_STATUSES = new Set([
  'PENDING', 'PROCESSING', 'WAITING', 'AGUARDANDO',
  'PENDENTE', 'EM_PROCESSAMENTO',
]);
const isPaid = (s: string) => PAID_STATUSES.has((s || '').toUpperCase());

interface Tx {
  id: string;
  type: 'boleto' | 'recharge' | 'pix' | 'send-pix';
  label: string;
  amount: number;
  status: string;
  createdAt: string;
}

const TYPE_ICON = {
  boleto:     CreditCard,
  recharge:   Smartphone,
  pix:        QrCode,
  'send-pix': Send,
} as const;

const TYPE_LABEL = {
  boleto:     'Boleto',
  recharge:   'Recarga',
  pix:        'Pix Copia e Cola',
  'send-pix': 'Envio Pix',
} as const;

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function StatusDot({ status }: { status: string }) {
  const upper = (status || '').toUpperCase();
  if (PAID_STATUSES.has(upper)) return <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />;
  if (PENDING_STATUSES.has(upper)) return <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0 animate-pulse" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />;
}

function periodStart(period: Period): number {
  if (period === 'all') return 0;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return Date.now() - days * 86400000;
}

function buildSparkline(
  txs: Tx[],
  period: Period,
  w: number,
  h: number,
): { line: string; area: string; hasData: boolean } {
  const buckets = period === '7d' ? 7 : 15;
  const start = periodStart(period);
  const span = Date.now() - start || 1;
  const counts = new Array(buckets).fill(0);

  txs.forEach(tx => {
    if (!isPaid(tx.status)) return;
    const t = new Date(tx.createdAt).getTime();
    if (t < start) return;
    const idx = Math.min(Math.floor(((t - start) / span) * buckets), buckets - 1);
    counts[idx] += tx.amount || 0;
  });

  const max = Math.max(...counts, 1);
  const pad = 4;
  const pts = counts.map((v, i) => ({
    x: pad + (i / Math.max(buckets - 1, 1)) * (w - pad * 2),
    y: h - pad - (v / max) * (h - pad * 2),
  }));

  const line = pts.reduce((acc, p, i) => {
    if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    const prev = pts[i - 1];
    const cx1 = prev.x + (p.x - prev.x) * 0.5;
    const cx2 = p.x - (p.x - prev.x) * 0.5;
    return `${acc} C${cx1.toFixed(1)},${prev.y.toFixed(1)} ${cx2.toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }, '');

  const last = pts[pts.length - 1];
  const first = pts[0];
  const area = `${line} L${last.x.toFixed(1)},${h} L${first.x.toFixed(1)},${h} Z`;

  return { line, area, hasData: counts.some(v => v > 0) };
}

function useCountUp(target: number, durationMs = 400) {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const fromRef = useRef<number>(target);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) { setValue(target); return; }

    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }

    fromRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(n, 0));

function fmtCompact(v: number) {
  if (v >= 1000000) return `R$ ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`;
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TotalProcessadoCard({ profile }: { profile: any }) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('all');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(true);

  useEffect(() => {
    let done = 0;
    const merged: Tx[] = [];
    const check = () => {
      done++;
      if (done === 4) {
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTxs(merged);
        setTxLoading(false);
      }
    };

    api.get('/boleto/list?limit=500')
      .then(({ data }) =>
        (data.boletos || []).forEach((b: any) =>
          merged.push({
            id: b.id,
            type: 'boleto',
            label: 'Boleto',
            amount: Number(b.amount) || 0,
            status: b.status,
            createdAt: b.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/recharge/list?limit=500')
      .then(({ data }) =>
        (data.recharges || []).forEach((r: any) =>
          merged.push({
            id: r.id,
            type: 'recharge',
            label: r.operator ? `Recarga ${r.operator}` : 'Recarga',
            amount: Number(r.amount) || 0,
            status: r.status,
            createdAt: r.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/pix-copia-cola?limit=500')
      .then(({ data }) =>
        (data.items || []).forEach((p: any) =>
          merged.push({
            id: p.id,
            type: 'pix',
            label: 'Pix Copia e Cola',
            amount: Number(p.valorOriginal) || 0,
            status: p.status,
            createdAt: p.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/depix/send-pix?limit=500')
      .then(({ data }) =>
        (data.orders || []).forEach((o: any) =>
          merged.push({
            id: o.id,
            type: 'send-pix',
            label: 'Envio Pix',
            amount: Number(o.amountBrl) || 0,
            status: o.status,
            createdAt: o.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);
  }, []);

  const pStart = periodStart(period);
  const paidInPeriod = txs.filter(t => isPaid(t.status) && new Date(t.createdAt).getTime() >= pStart);

  let displayTotal: number;
  if (period === 'all') {
    const op = profile?.totalByOperation;
    displayTotal = op
      ? (op.boletos || 0) + (op.recargas || 0) + (op.pix || 0)
      : profile?.totalPaid ?? 0;
  } else {
    displayTotal = paidInPeriod.reduce((s, t) => s + t.amount, 0);
  }

  const boletoTotal = period === 'all'
    ? profile?.totalByOperation?.boletos ?? 0
    : paidInPeriod.filter(t => t.type === 'boleto').reduce((s, t) => s + t.amount, 0);

  const rechargeTotal = period === 'all'
    ? profile?.totalByOperation?.recargas ?? 0
    : paidInPeriod.filter(t => t.type === 'recharge').reduce((s, t) => s + t.amount, 0);

  const pixTotal = period === 'all'
    ? profile?.totalByOperation?.pix ?? 0
    : paidInPeriod.filter(t => t.type === 'pix' || t.type === 'send-pix').reduce((s, t) => s + t.amount, 0);

  const animated = useCountUp(displayTotal);
  const isLoading = txLoading && period !== 'all';

  const SPARK_W = 128;
  const SPARK_H = 40;
  const { line, area, hasData } = buildSparkline(txs, period, SPARK_W, SPARK_H);

  const recentTxs = txs.slice(0, 3);

  return (
    <div className="bg-app-surface border border-app-stroke rounded-xl p-5 shadow-card-premium h-full flex flex-col">
      {/* Header: label + period toggle */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest">
          Total processado
        </p>
        <div
          role="tablist"
          aria-label="Selecionar período"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-app-elevated border border-app-stroke"
        >
          {PERIODS.map((p) => {
            const isActive = period === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setPeriod(p.id)}
                className={`
                  px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors duration-150
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50
                  ${isActive
                    ? 'bg-app-surface text-app-text shadow-sm'
                    : 'text-app-subtle hover:text-app-muted'
                  }
                `}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Value + sparkline */}
      <div className="flex items-end gap-4 mb-2">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="h-10 w-44 bg-app-elevated rounded-lg animate-pulse" />
          ) : (
            <div
              className="text-4xl font-bold text-app-text tracking-tight leading-none tabular-nums"
              style={{ fontFeatureSettings: '"tnum"' }}
            >
              {formatBRL(animated)}
            </div>
          )}
        </div>
        <div className="hidden sm:block flex-shrink-0">
          {txLoading ? (
            <div
              className="bg-app-elevated rounded animate-pulse"
              style={{ width: SPARK_W, height: SPARK_H }}
            />
          ) : (
            <svg
              width={SPARK_W}
              height={SPARK_H}
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              fill="none"
              aria-label={`Gráfico — ${period === 'all' ? 'todo o período' : `últimos ${period}`}`}
            >
              <title>{`Volume processado — ${period === 'all' ? 'todo o período' : `últimos ${period}`}`}</title>
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F7931A" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#F7931A" stopOpacity="0" />
                </linearGradient>
              </defs>
              {hasData ? (
                <>
                  <path d={area} fill="url(#sparkGrad)" />
                  <path d={line} stroke="#F7931A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <line
                  x1="4" y1={SPARK_H - 4}
                  x2={SPARK_W - 4} y2={SPARK_H - 4}
                  stroke="var(--app-stroke)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                />
              )}
            </svg>
          )}
        </div>
      </div>

      {/* Empty state CTA */}
      {displayTotal === 0 && !isLoading && (
        <button
          type="button"
          onClick={() => navigate('/pagar')}
          className="flex items-center gap-1.5 text-xs text-app-subtle hover:text-bitcoin transition-colors mt-1 mb-1"
        >
          <ArrowRight className="w-3 h-3" />
          Faça seu primeiro pagamento para ver seu histórico aqui
        </button>
      )}

      {/* Breakdown by type */}
      <div className="mt-3">
        {txLoading ? (
          <div className="flex gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-3.5 w-20 bg-app-elevated rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {[
              { dot: '#F7931A', label: 'Boletos',  value: boletoTotal  },
              { dot: '#60a5fa', label: 'Recargas', value: rechargeTotal },
              { dot: '#34d399', label: 'Pix',      value: pixTotal      },
            ].map(({ dot, label, value }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                <span className="text-xs text-app-muted">{label}</span>
                <span className="text-xs font-medium text-app-text tabular-nums">
                  {fmtCompact(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-app-stroke my-4" />

      {/* Atividade Recente */}
      <div>
        <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest mb-3">
          Atividade recente
        </p>

        {txLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2 animate-pulse">
                <div className="size-6 rounded bg-app-elevated flex-shrink-0" />
                <div className="flex-1 h-3 bg-app-elevated rounded" />
                <div className="h-3 w-14 bg-app-elevated rounded" />
                <div className="h-3 w-8 bg-app-elevated rounded" />
              </div>
            ))}
          </div>
        ) : recentTxs.length === 0 ? (
          <p className="text-[12px] text-app-subtle">
            Suas transações aparecerão aqui.
          </p>
        ) : (
          <div className="space-y-3">
            {recentTxs.map(tx => {
              const Icon = TYPE_ICON[tx.type];
              return (
                <div key={tx.id + tx.type} className="flex items-center gap-2">
                  <div className="size-6 rounded bg-app-elevated flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-app-muted" strokeWidth={1.5} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <StatusDot status={tx.status} />
                    <span className="text-[13px] font-medium text-app-text truncate">
                      {TYPE_LABEL[tx.type]}
                    </span>
                  </div>
                  <span
                    className="text-[13px] font-medium text-app-muted tabular-nums flex-shrink-0"
                    style={{ fontFeatureSettings: '"tnum"' }}
                  >
                    {tx.amount > 0 ? fmtCompact(tx.amount) : '—'}
                  </span>
                  <span className="text-[11px] text-app-subtle flex-shrink-0 w-10 text-right">
                    {relativeDate(tx.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate('/historico')}
          className="mt-3 flex items-center gap-1 text-xs text-app-subtle hover:text-app-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50 rounded"
        >
          Ver tudo →
        </button>
      </div>
    </div>
  );
}
