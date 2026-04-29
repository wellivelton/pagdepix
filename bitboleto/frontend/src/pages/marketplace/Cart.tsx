import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCart } from '../../contexts/CartContext';

export default function Cart() {
  const { cart, loading, updateQuantity, removeItem } = useCart();
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_URL
    ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : '') + (window.location.port === '5173' ? ':3001' : '');

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <div className="inline-flex p-4 rounded-full bg-gray-700/50 mb-4">
          <ShoppingCart className="w-16 h-16 text-gray-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Carrinho vazio</h2>
        <p className="text-gray-400 mb-6">Adicione produtos para continuar.</p>
        <Link
          to="/loja"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
        >
          Ir para a loja
        </Link>
      </div>
    );
  }

  let total = 0;
  for (const item of cart.items) {
    const price = item.variant?.priceInDepix ?? item.product.priceInDepix;
    total += price * item.quantity;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-white">Carrinho</h1>
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 divide-y divide-gray-700/50 overflow-hidden">
        {cart.items.map((item) => {
          const price = item.variant?.priceInDepix ?? item.product.priceInDepix;
          const coverSrc = item.product.coverImageUrl
            ? item.product.coverImageUrl.startsWith('http')
              ? item.product.coverImageUrl
              : `${API_BASE}${item.product.coverImageUrl}`
            : '';
          return (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row gap-4 p-4"
            >
              <Link
                to={`/loja/produto/${item.product.slug}`}
                className="flex-shrink-0 w-full sm:w-24 h-24 bg-gray-700/50 rounded-lg overflow-hidden"
              >
                {coverSrc ? (
                  <img src={coverSrc} alt={item.product.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                    Sem imagem
                  </div>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/loja/produto/${item.product.slug}`} className="font-semibold text-white hover:text-bitcoin line-clamp-2">
                  {item.product.title}
                </Link>
                <p className="text-bitcoin font-bold mt-1">
                  {Number(price).toFixed(2)} DEPIX × {item.quantity} = {Number(price * item.quantity).toFixed(2)} DEPIX
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                  className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-medium text-white">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600 text-gray-300"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-500/20"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <p className="text-xl font-bold text-white">
          Total: <span className="text-bitcoin">{Number(total).toFixed(2)} DEPIX</span>
        </p>
        <button
          type="button"
          onClick={() => navigate('/loja/checkout-cart')}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold transition"
        >
          Finalizar compra
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
      <Link to="/loja" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm">
        ← Continuar comprando
      </Link>
    </div>
  );
}
