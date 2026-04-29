import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';

export default function Checkout() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<{
    orderId: string;
    qr_image_url?: string;
    qr_copy_paste?: string;
    totalToPay: number;
    expires_at?: string;
    freeProduct?: boolean;
  } | null>(null);
  const [paid, setPaid] = useState(false);

  const handleCreateOrder = () => {
    if (!productId) return;
    setLoading(true);
    setError('');
    api.post('/marketplace/order', { productId, couponCode: couponCode || undefined })
      .then(({ data }) => {
        if (data.freeProduct) {
          setPaid(true);
          setOrder({
            orderId: data.orderId,
            totalToPay: 0,
            freeProduct: true,
          });
          return;
        }
        setOrder({
          orderId: data.orderId,
          qr_image_url: data.qr_image_url,
          qr_copy_paste: data.qr_copy_paste,
          totalToPay: data.totalToPay ?? 0,
          expires_at: data.expires_at,
        });
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao criar pedido'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!order?.orderId) return;
    const interval = setInterval(() => {
      api.get(`/marketplace/order/${order.orderId}/status`)
        .then(({ data }) => {
          if (data.paymentStatus === 'paid') {
            setPaid(true);
            clearInterval(interval);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [order?.orderId]);

  if (!productId) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-8 text-center">
        <p className="text-gray-400 mb-4">Produto não informado.</p>
        <button type="button" onClick={() => navigate('/loja')} className="text-bitcoin hover:text-orange-500 font-medium">
          Voltar à loja
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      {!order ? (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6 md:p-8">
          <h2 className="text-xl font-bold text-white mb-6">Finalizar compra</h2>
          <div className="mb-4">
            <label className="block text-gray-400 text-sm mb-1">Cupom (opcional)</label>
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition"
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button
            type="button"
            onClick={handleCreateOrder}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold disabled:opacity-50 transition"
          >
            {loading ? 'Processando...' : 'Finalizar compra'}
          </button>
        </div>
      ) : (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6 md:p-8 text-center">
          {paid ? (
            <div className="py-8 space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <p className="text-green-400 font-semibold text-lg">Pagamento confirmado!</p>
              <p className="text-gray-400 text-sm">Seu produto está disponível em Minhas Compras.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/loja')}
                  className="px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
                >
                  Continuar comprando
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/minhas-compras/${order.orderId}`)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold transition"
                >
                  Ir para Minhas Compras
                </button>
              </div>
            </div>
          ) : order.freeProduct ? (
            <div className="py-8 space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <p className="text-green-400 font-semibold text-lg">Produto gratuito recebido!</p>
              <p className="text-gray-400 text-sm">Seu produto está disponível em Minhas Compras.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/loja')}
                  className="px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
                >
                  Continuar comprando
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/minhas-compras/${order.orderId}`)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold transition"
                >
                  Ir para Minhas Compras
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-gray-400 mb-1">Valor a pagar</p>
              <p className="text-2xl font-bold text-bitcoin mb-4">R$ {Number(order.totalToPay).toFixed(2)}</p>
              <p className="text-sm text-gray-500 mb-4">Escaneie o QR Code ou copie o Pix Copia e Cola</p>
              {order.qr_image_url && (
                <img src={order.qr_image_url} alt="QR Code Pix" className="mx-auto w-56 h-56 bg-white rounded-xl p-2 border border-gray-700/50" />
              )}
              {order.qr_copy_paste && (
                <textarea
                  readOnly
                  value={order.qr_copy_paste}
                  className="mt-4 w-full h-24 p-3 rounded-lg bg-gray-900/50 border border-gray-700 text-xs text-gray-400"
                />
              )}
              <p className="text-xs text-gray-500 mt-4">Aguardando confirmação do pagamento...</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
