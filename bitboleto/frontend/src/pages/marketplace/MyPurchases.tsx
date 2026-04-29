import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

export default function MyPurchases() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/marketplace/orders')
      .then(({ data }) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6">Minhas compras</h1>
      {orders.length === 0 ? (
        <p className="text-gray-400">Você ainda não fez nenhuma compra.</p>
      ) : (
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
      )}
    </div>
  );
}
