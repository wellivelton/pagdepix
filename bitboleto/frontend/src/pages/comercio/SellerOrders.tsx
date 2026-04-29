import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import {
  Package,
  DollarSign,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Search,
} from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  PROCESSING: 'Em processamento',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-300',
  PAID: 'bg-blue-500/20 text-blue-300',
  PROCESSING: 'bg-cyan-500/20 text-cyan-300',
  COMPLETED: 'bg-emerald-500/20 text-emerald-300',
  CANCELLED: 'bg-red-500/20 text-red-300',
};

function DisputeResponseForm({
  order,
  onSuccess,
}: {
  order: any;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const text = response.trim();
    if (!text) return;
    setLoading(true);
    try {
      await api.post('/marketplace/dispute/respond', {
        sellerOrderId: order.id,
        response: text,
      });
      toast.success('Resposta enviada com sucesso!');
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar resposta');
    } finally {
      setLoading(false);
    }
  };

  if (order.disputeStatus !== 'open') return null;

  return (
    <div className="mt-3 border-t border-gray-700/50 pt-3">
      <div className="flex items-center gap-2 text-amber-400 text-sm mb-2">
        <AlertTriangle className="w-4 h-4" />
        <span className="font-medium">Disputa aberta</span>
        {order.disputeSellerRespondedAt && (
          <span className="text-gray-400 text-xs ml-1">— Você já respondeu</span>
        )}
      </div>
      {order.disputeReason && (
        <p className="text-xs text-gray-400 mb-2 italic">
          Motivo: {order.disputeReason}
        </p>
      )}
      {!order.disputeSellerRespondedAt && (
        <>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-medium transition"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Responder disputa
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                rows={3}
                placeholder="Descreva sua versão dos fatos..."
                className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-bitcoin/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !response.trim()}
                  className="px-4 py-1.5 rounded-lg bg-bitcoin text-black text-sm font-semibold disabled:opacity-50 transition hover:bg-bitcoin/90"
                >
                  {loading ? 'Enviando...' : 'Enviar resposta'}
                </button>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setResponse(''); }}
                  className="px-4 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-sm transition hover:bg-gray-600"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SellerOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });

  const load = useCallback(
    (p = 1) => {
      setLoading(true);
      api
        .get('/marketplace/seller/orders', {
          params: {
            page: p,
            limit: 15,
            status: statusFilter || undefined,
            search: search.trim() || undefined,
          },
        })
        .then(({ data }) => {
          setOrders(data?.orders || data || []);
          setPagination({
            pages: data?.pagination?.pages ?? 1,
            total: data?.pagination?.total ?? 0,
          });
          setPage(p);
        })
        .catch(() => setOrders([]))
        .finally(() => setLoading(false));
    },
    [statusFilter, search],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs">
        <strong>Importante:</strong> O comerciante é o único responsável pelo endereço Liquid fornecido. O PagDepix é isento de qualquer responsabilidade por perdas causadas por erro de endereço ou perda de chaves.
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
            placeholder="Buscar por ID ou produto..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bitcoin/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bitcoin/40"
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <Link
          to="/comercio/loja/relatorios"
          className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm transition"
        >
          Ver relatórios
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-gray-400 text-sm">
          {pagination.total} {pagination.total === 1 ? 'venda' : 'vendas'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 animate-pulse">
              <div className="h-5 bg-gray-700/50 rounded w-1/3 mb-3" />
              <div className="h-4 bg-gray-700/50 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-gray-700/50 mb-4">
            <DollarSign className="w-12 h-12 text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Nenhuma venda encontrada</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            {statusFilter || search
              ? 'Nenhum pedido corresponde aos filtros aplicados.'
              : 'Quando seus produtos forem vendidos, as vendas aparecerão aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div
              key={o.id}
              className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4 md:p-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-semibold text-white truncate">
                      {o.items?.[0]?.product?.title ?? o.product?.title ?? `Pedido #${o.id.slice(0, 8)}`}
                      {(o.items?.length > 1) && (
                        <span className="text-gray-400 ml-1 text-sm">+{o.items.length - 1}</span>
                      )}
                    </p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${STATUS_COLORS[o.status] ?? 'bg-gray-700 text-gray-300'}`}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                    {o.disputeStatus === 'open' && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-300 flex-shrink-0">
                        Em disputa
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    #{o.id.slice(0, 8)} •{' '}
                    {o.marketOrder?.buyer?.name ?? o.buyer?.name ?? 'Cliente'} •{' '}
                    {o.createdAt
                      ? new Date(o.createdAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Pagamento: {o.marketOrder?.paymentStatus ?? o.paymentStatus ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-bitcoin font-bold">
                      {Number(o.sellerReceives || 0).toFixed(2)} DEPIX
                    </p>
                    <p className="text-xs text-gray-500">Você recebe</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/comercio/loja/vendas?order=${o.id}`)}
                    className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition"
                    title="Ver detalhes"
                  >
                    <Package className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {o.disputeStatus === 'open' && (
                <DisputeResponseForm order={o} onSuccess={() => load(page)} />
              )}
            </div>
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => load(page - 1)}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-sm text-gray-400">
            Página {page} de {pagination.pages}
          </span>
          <button
            type="button"
            onClick={() => load(page + 1)}
            disabled={page >= pagination.pages || loading}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
