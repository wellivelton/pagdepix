import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useCart } from '../../contexts/CartContext';

export default function CheckoutCart() {
  const navigate = useNavigate();
  const { cart, refreshCart } = useCart();
  const [step, setStep] = useState<'form' | 'pix' | 'paid'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [globalCouponCode, setGlobalCouponCode] = useState('');
  const [order, setOrder] = useState<{
    orderId: string;
    qr_image_url?: string;
    qr_copy_paste?: string;
    totalToPay: number;
    expires_at?: string;
  } | null>(null);

  useEffect(() => {
    if (!cart || cart.items.length === 0) {
      navigate('/loja/carrinho');
    }
  }, [cart, navigate]);

  const handleCheckout = async () => {
    if (!cart || cart.items.length === 0) return;
    setLoading(true);
    setError('');
    try {
      let affiliateCode: string | undefined;
      try {
        affiliateCode = sessionStorage.getItem('marketplace_affiliate_ref') || undefined;
        if (affiliateCode) sessionStorage.removeItem('marketplace_affiliate_ref');
      } catch {}
      const { data } = await api.post('/marketplace/checkout/cart', {
        globalCouponCode: globalCouponCode.trim() || undefined,
        affiliateCode,
      });
      setOrder(data);
      setStep('pix');
      refreshCart();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro no checkout');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order?.orderId || step !== 'pix') return;
    const interval = setInterval(() => {
      api
        .get(`/marketplace/order/${order.orderId}/status`)
        .then(({ data }) => {
          const status = data.paymentStatus ?? data.orderStatus;
          if (status === 'paid' || (typeof status === 'string' && status.toLowerCase() === 'paid')) {
            setStep('paid');
            clearInterval(interval);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [order?.orderId, step]);

  if (!cart || cart.items.length === 0) return null;

  let subtotal = 0;
  for (const item of cart.items) {
    const price = item.variant?.priceInDepix ?? item.product.priceInDepix;
    subtotal += price * item.quantity;
  }

  if (step === 'paid') {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl text-green-400">✓</span>
        </div>
        <p className="text-green-400 font-semibold text-lg mb-2">Pagamento confirmado!</p>
        <p className="text-gray-400 text-sm mb-6">Seus produtos estão disponíveis em Minhas Compras.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => navigate('/loja')}
            className="px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-medium transition"
          >
            Continuar comprando
          </button>
          <button
            type="button"
            onClick={() => navigate(`/minhas-compras/${order?.orderId}`)}
            className="px-5 py-2.5 rounded-xl bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
          >
            Ir para Minhas Compras
          </button>
        </div>
      </div>
    );
  }

  if (step === 'pix' && order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 md:p-8 text-center">
          <p className="text-gray-400 mb-1">Valor a pagar</p>
          <p className="text-2xl font-bold text-bitcoin mb-4">R$ {Number(order.totalToPay).toFixed(2)}</p>
          <p className="text-sm text-gray-500 mb-4">Escaneie o QR Code ou copie o Pix Copia e Cola</p>
          {order.qr_image_url && (
            <img
              src={order.qr_image_url}
              alt="QR Code Pix"
              className="mx-auto w-56 h-56 bg-white rounded-xl p-2 border border-gray-700/50"
            />
          )}
          {order.qr_copy_paste && (
            <textarea
              readOnly
              value={order.qr_copy_paste}
              className="mt-4 w-full h-24 p-3 rounded-lg bg-gray-900/50 border border-gray-700 text-xs text-gray-400"
            />
          )}
          <p className="text-xs text-gray-500 mt-4">Aguardando confirmação do pagamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Finalizar compra</h1>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
        <label className="block text-gray-400 text-sm mb-1">Cupom global (opcional)</label>
        <input
          type="text"
          value={globalCouponCode}
          onChange={(e) => setGlobalCouponCode(e.target.value.toUpperCase())}
          placeholder="CÓDIGO"
          className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30"
        />
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
        <div className="flex justify-between text-white font-bold text-lg">
          <span>Total</span>
          <span className="text-bitcoin">{Number(subtotal).toFixed(2)} DEPIX</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold disabled:opacity-50 transition"
      >
        {loading ? 'Processando...' : 'Gerar Pix'}
      </button>

      <button
        type="button"
        onClick={() => navigate('/loja/carrinho')}
        className="text-gray-400 hover:text-white text-sm"
      >
        ← Voltar ao carrinho
      </button>
    </div>
  );
}
