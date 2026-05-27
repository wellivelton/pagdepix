import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

function formatOrderTitle(o: any): string {
  if (o._source === 'legacy') return o.product?.title || 'Produto';
  if (o._source === 'market_order') {
    const titles = o.sellerOrders?.flatMap(
      (so: any) => so.items?.map((i: any) => i.product?.title).filter(Boolean) || []
    ) || [];
    const unique = [...new Set(titles)];
    return unique.slice(0, 2).join(', ') + (unique.length > 2 ? '...' : '');
  }
  return 'Pedido';
}

function formatOrderPrice(o: any): string {
  if (o._source === 'legacy') return String(Number(o.finalPrice || 0).toFixed(2));
  if (o._source === 'market_order') return String(Number(o.totalInDepix || 0).toFixed(2));
  return '0';
}

function isDelivered(o: any): boolean {
  if (o._source === 'legacy') return o.deliveryStatus === 'delivered';
  if (o._source === 'market_order') {
    const so = o.sellerOrders || [];
    return so.every((s: any) => s.deliveryStatus === 'delivered');
  }
  return false;
}

interface TROrder {
  id: string;
  productName: string;
  productCategoria: string;
  totalAmount: number;
  paymentCurrency: string;
  status: string;
  codigoEntregue: string | null;
  codigoMensagem: string | null;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
}

const TR_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING:          { label: 'Aguardando pagamento', cls: 'bg-yellow-500/20 text-yellow-400' },
  PROCESSING:       { label: 'Processando',           cls: 'bg-blue-500/20 text-blue-400' },
  DELIVERY_PENDING: { label: 'Entregando...',         cls: 'bg-blue-500/20 text-blue-400' },
  DELIVERED:        { label: 'Entregue',              cls: 'bg-green-500/20 text-green-400' },
  FAILED:           { label: 'Falhou',                cls: 'bg-red-500/20 text-red-400' },
};

function TROrderCard({ order }: { order: TROrder }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    if (!order.codigoEntregue) return;
    navigator.clipboard.writeText(order.codigoEntregue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const badge = TR_STATUS_LABEL[order.status] ?? { label: order.status, cls: 'bg-gray-700 text-gray-400' };

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white">{order.productName}</p>
            <span className="px-1.5 py-0.5 text-[10px] bg-bitcoin/20 text-bitcoin rounded font-semibold uppercase tracking-wide">Apps</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date(order.createdAt).toLocaleDateString('pt-BR')} · R$ {order.totalAmount.toFixed(2).replace('.', ',')}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      {order.status === 'DELIVERED' && order.codigoEntregue && (
        <div className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/40">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Código</p>
            <button
              onClick={() => setRevealed((r) => !r)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {revealed ? <><EyeOff className="w-3 h-3" /> Ocultar</> : <><Eye className="w-3 h-3" /> Ver código</>}
            </button>
          </div>
          {revealed ? (
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-base font-bold text-green-400 tracking-widest break-all">{order.codigoEntregue}</p>
              <button onClick={copyCode} className="shrink-0 flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs font-medium transition-colors">
                {copied ? <><Check className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
              </button>
            </div>
          ) : (
            <p className="font-mono text-base text-gray-600 tracking-widest">••••••••••••</p>
          )}
          {revealed && order.codigoMensagem && (
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">{order.codigoMensagem}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyPurchases() {
  const [orders, setOrders] = useState<any[]>([]);
  const [trOrders, setTrOrders] = useState<TROrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const marketReq = api.get('/marketplace/orders')
      .then(({ data }) => Array.isArray(data) ? data : [])
      .catch(() => []);
    const trReq = api.get('/toprecargas/orders')
      .then(({ data }) => Array.isArray(data) ? data : [])
      .catch(() => []);
    Promise.all([marketReq, trReq]).then(([market, tr]) => {
      setOrders(market);
      setTrOrders(tr);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const hasAny = orders.length > 0 || trOrders.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Minhas compras</h1>

      {!hasAny ? (
        <p className="text-gray-400">Você ainda não fez nenhuma compra.</p>
      ) : (
        <div className="space-y-8">
          {/* TopRecargas orders */}
          {trOrders.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                <span>Recargas de Apps</span>
                <span className="px-1.5 py-0.5 text-[10px] bg-bitcoin/20 text-bitcoin rounded font-semibold">{trOrders.length}</span>
              </h2>
              <div className="space-y-3">
                {trOrders.map((o) => <TROrderCard key={o.id} order={o} />)}
              </div>
            </section>
          )}

          {/* Marketplace orders */}
          {orders.length > 0 && (
            <section>
              {trOrders.length > 0 && (
                <h2 className="text-sm font-semibold text-gray-400 mb-3">Gift Cards</h2>
              )}
              <div className="space-y-4">
                {orders.map((o) => (
                  <Link
                    key={o.id}
                    to={`/minhas-compras/${o.id}`}
                    className="block bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 hover:border-bitcoin/50 transition"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{formatOrderTitle(o)}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(o.createdAt).toLocaleDateString('pt-BR')} · {o.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-bitcoin font-semibold">{formatOrderPrice(o)} DEPIX</p>
                        {isDelivered(o) && (
                          <span className="text-xs text-green-400">Entregue</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
