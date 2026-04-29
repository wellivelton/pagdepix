import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import {
  BarChart2,
  TrendingUp,
  DollarSign,
  Package,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Summary {
  totalOrders: number;
  totalRevenue: number;
  sellerReceives: number;
  platformFee: number;
  affiliateCommissions: number;
  discounts: number;
  shipping: number;
}

interface TopProduct {
  productId: string;
  product: { id: string; title: string; slug: string } | null;
  _sum: { unitPrice: number | null; quantity: number | null };
  _count: { id: number };
}

interface Order {
  id: string;
  status: string;
  subtotal: number;
  sellerReceives: number;
  platformFee: number;
  shippingAmount: number;
  createdAt: string;
  items: { product: { title: string } | null; quantity: number; unitPrice: number }[];
}

function fmt(val: number) {
  return Number(val ?? 0).toFixed(2);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function SellerReports() {
  const [from, setFrom] = useState(thirtyDaysAgo());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });

  const load = useCallback(
    (p = 1) => {
      setLoading(true);
      api
        .get('/marketplace/seller/reports', { params: { from, to, page: p, limit: 20 } })
        .then(({ data }) => {
          setSummary(data.summary);
          setOrders(data.orders || []);
          setTopProducts(data.topProducts || []);
          setPagination(data.pagination || { pages: 1, total: 0 });
          setPage(p);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [from, to],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const statusLabel: Record<string, string> = {
    PENDING: 'Pendente',
    PAID: 'Pago',
    SHIPPED: 'Enviado',
    DELIVERED: 'Entregue',
    COMPLETED: 'Concluído',
    CANCELLED: 'Cancelado',
  };

  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-300',
    PAID: 'bg-blue-500/20 text-blue-300',
    SHIPPED: 'bg-purple-500/20 text-purple-300',
    DELIVERED: 'bg-green-500/20 text-green-300',
    COMPLETED: 'bg-emerald-500/20 text-emerald-300',
    CANCELLED: 'bg-red-500/20 text-red-300',
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-bitcoin/10 border border-bitcoin/20">
            <BarChart2 className="w-5 h-5 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Relatórios de Vendas</h1>
            <p className="text-sm text-gray-400">Análise financeira detalhada do seu negócio</p>
          </div>
        </div>
        <Link
          to="/comercio/loja/saldo"
          className="text-sm text-bitcoin hover:underline"
        >
          Ver saldo
        </Link>
      </div>

      {/* Filtro de período */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4 flex flex-wrap gap-3 items-end"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> De
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bitcoin/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Até
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-bitcoin/40"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-lg bg-bitcoin text-black font-semibold text-sm hover:bg-bitcoin/90 disabled:opacity-50 transition"
        >
          {loading ? 'Carregando...' : 'Filtrar'}
        </button>
      </form>

      {/* Cards de resumo */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-400">Pedidos</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.totalOrders}</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400">Receita bruta</span>
            </div>
            <p className="text-xl font-bold text-white">{fmt(summary.totalRevenue)}</p>
            <p className="text-xs text-gray-500">DEPIX</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-bitcoin" />
              <span className="text-xs text-gray-400">Você recebe</span>
            </div>
            <p className="text-xl font-bold text-bitcoin">{fmt(summary.sellerReceives)}</p>
            <p className="text-xs text-gray-500">DEPIX</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-400">Taxa plataforma</span>
            </div>
            <p className="text-xl font-bold text-white">{fmt(summary.platformFee)}</p>
            <p className="text-xs text-gray-500">DEPIX</p>
          </div>
        </div>
      )}

      {/* Detalhamento de taxas */}
      {summary && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Composição do período</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-gray-400">Comissões afiliados:</span>
              <span className="text-white ml-2 font-medium">{fmt(summary.affiliateCommissions)} DEPIX</span>
            </div>
            <div>
              <span className="text-gray-400">Descontos cupons:</span>
              <span className="text-white ml-2 font-medium">{fmt(summary.discounts)} DEPIX</span>
            </div>
            <div>
              <span className="text-gray-400">Frete total:</span>
              <span className="text-white ml-2 font-medium">{fmt(summary.shipping)} DEPIX</span>
            </div>
          </div>
        </div>
      )}

      {/* Top produtos */}
      {topProducts.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-bitcoin" /> Top 10 Produtos
          </h3>
          <div className="space-y-2">
            {topProducts.map((tp, idx) => (
              <div key={tp.productId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-500 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                  {tp.product ? (
                    <Link
                      to={`/loja/produto/${tp.product.slug}`}
                      className="text-white hover:text-bitcoin truncate"
                    >
                      {tp.product.title}
                    </Link>
                  ) : (
                    <span className="text-gray-500 truncate">Produto removido</span>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className="text-bitcoin font-medium">
                    {fmt((tp._sum.unitPrice ?? 0) * (tp._sum.quantity ?? 0))} DEPIX
                  </span>
                  <span className="text-gray-500 ml-2">({tp._count.id} itens)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de pedidos */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Pedidos do período</h3>
          <span className="text-xs text-gray-400">{pagination.total} pedidos</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhum pedido no período selecionado.
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {orders.map((o) => (
              <div key={o.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {o.items?.[0]?.product?.title ?? `Pedido #${o.id.slice(0, 8)}`}
                    {o.items?.length > 1 && (
                      <span className="text-gray-400 ml-1">+{o.items.length - 1} itens</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    #{o.id.slice(0, 8)} · {new Date(o.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor[o.status] ?? 'bg-gray-700 text-gray-300'}`}>
                    {statusLabel[o.status] ?? o.status}
                  </span>
                  <div className="text-right">
                    <p className="text-bitcoin font-bold text-sm">{fmt(o.sellerReceives)} DEPIX</p>
                    <p className="text-xs text-gray-500">bruto {fmt(o.subtotal)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Paginação */}
        {pagination.pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-between">
            <button
              type="button"
              onClick={() => load(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-xs text-gray-400">
              Página {page} de {pagination.pages}
            </span>
            <button
              type="button"
              onClick={() => load(page + 1)}
              disabled={page >= pagination.pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
