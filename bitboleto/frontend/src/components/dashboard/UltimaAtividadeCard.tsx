import { useEffect, useState } from 'react';
import { CreditCard, Smartphone, QrCode, Send, ArrowRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

interface Tx {
  id: string;
  type: 'boleto' | 'recharge' | 'pix' | 'send-pix';
  label: string;
  amount: number;
  status: string;
  createdAt: string;
}

const PAID_STATUSES = new Set([
  'PAID', 'COMPLETED', 'APPROVED', 'PROCESSADO',
  'CONFIRMADO', 'CONCLUIDO', 'PAGO',
]);
const PENDING_STATUSES = new Set([
  'PENDING', 'PROCESSING', 'WAITING', 'AGUARDANDO',
  'PENDENTE', 'EM_PROCESSAMENTO',
]);

const TYPE_ICON = {
  boleto: CreditCard,
  recharge: Smartphone,
  pix: QrCode,
  'send-pix': Send,
} as const;

const TYPE_LABEL = {
  boleto: 'Boleto',
  recharge: 'Recarga',
  pix: 'Pix Copia e Cola',
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

function StatusIndicator({ status }: { status: string }) {
  const upper = (status || '').toUpperCase();
  if (PAID_STATUSES.has(upper)) {
    return <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" title="Pago" />;
  }
  if (PENDING_STATUSES.has(upper)) {
    return <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0 animate-pulse" title="Pendente" />;
  }
  return <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Cancelado/Falhou" />;
}

export default function UltimaAtividadeCard() {
  const navigate = useNavigate();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let done = 0;
    const merged: Tx[] = [];
    const check = () => {
      done++;
      if (done === 4) {
        merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setTxs(merged.slice(0, 5));
        setLoading(false);
      }
    };

    api.get('/boleto/list')
      .then(({ data }) =>
        (data.boletos || []).forEach((b: any) =>
          merged.push({
            id: b.id,
            type: 'boleto',
            label: 'Boleto',
            amount: b.amount || 0,
            status: b.status,
            createdAt: b.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/recharge/list')
      .then(({ data }) =>
        (data.recharges || []).forEach((r: any) =>
          merged.push({
            id: r.id,
            type: 'recharge',
            label: r.operator ? `Recarga ${r.operator}` : 'Recarga',
            amount: r.amount || 0,
            status: r.status,
            createdAt: r.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/pix-copia-cola', { params: { limit: 20 } })
      .then(({ data }) =>
        (data.items || []).forEach((p: any) =>
          merged.push({
            id: p.id,
            type: 'pix',
            label: p.nomeDestinatario || 'Pix Copia e Cola',
            amount: p.valorOriginal || 0,
            status: p.status,
            createdAt: p.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);

    api.get('/depix/send-pix', { params: { limit: 20 } })
      .then(({ data }) =>
        (data.orders || []).forEach((s: any) =>
          merged.push({
            id: s.id,
            type: 'send-pix',
            label: s.pixKey ? `→ ${s.pixKey}` : 'Envio Pix',
            amount: s.amountBrl || 0,
            status: s.status,
            createdAt: s.createdAt,
          }),
        ),
      )
      .catch(() => {})
      .finally(check);
  }, []);

  return (
    <div className="bg-app-surface border border-app-stroke rounded-xl overflow-hidden shadow-card-premium h-full flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-3.5 flex items-center justify-between border-b border-app-stroke">
        <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest">
          Última atividade
        </p>
        <button
          type="button"
          onClick={() => navigate('/historico')}
          className="flex items-center gap-1 text-[11px] text-app-subtle hover:text-app-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50 rounded"
        >
          Ver tudo
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-5 py-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 bg-app-elevated rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-app-elevated rounded" />
                  <div className="h-2.5 w-16 bg-app-elevated rounded" />
                </div>
                <div className="h-3 w-14 bg-app-elevated rounded" />
              </div>
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-app-elevated border border-app-stroke flex items-center justify-center mb-3">
              <Clock className="w-5 h-5 text-app-subtle" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium text-app-muted mb-1">Sem transações</p>
            <p className="text-xs text-app-subtle leading-relaxed">
              Suas operações aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {txs.map(tx => {
              const Icon = TYPE_ICON[tx.type];
              return (
                <div key={tx.id + tx.type} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-app-elevated border border-app-stroke flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-app-muted" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-app-text truncate leading-tight">
                      {TYPE_LABEL[tx.type]}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusIndicator status={tx.status} />
                      <p className="text-xs text-app-subtle leading-tight">
                        {relativeDate(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p
                    className="text-sm font-semibold text-app-text flex-shrink-0 tabular-nums"
                    style={{ fontFeatureSettings: '"tnum"' }}
                  >
                    {tx.amount > 0
                      ? `R$ ${tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
