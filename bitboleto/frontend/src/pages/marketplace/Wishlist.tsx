import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Trash2, ShoppingCart, Loader2 } from 'lucide-react';
import api from '../../services/api';
import { ProductCard } from '../../components/marketplace/ProductCard';
import { useToast } from '../../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
  : (typeof window !== 'undefined' ? window.location.origin : '') + (window.location?.port === '5173' ? ':3001' : '');

export default function Wishlist() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = () => {
    api.get('/marketplace/wishlist')
      .then(({ data }) => setItems(data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleRemove = async (productId: string) => {
    setRemoving(productId);
    try {
      await api.delete(`/marketplace/wishlist/${productId}`);
      setItems((prev) => prev.filter((i) => i.productId !== productId));
      toast.success('Removido dos favoritos');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao remover');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500 fill-red-500" />
          Meus favoritos
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden animate-pulse">
              <div className="aspect-square bg-gray-700/50" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-700/50 rounded w-3/4" />
                <div className="h-3 bg-gray-700/50 rounded w-1/2" />
                <div className="h-6 bg-gray-700/50 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Heart className="w-5 h-5 text-red-500 fill-red-500" />
        Meus favoritos ({items.length})
      </h1>

      {items.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-12 text-center">
          <Heart className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">Nenhum produto nos favoritos.</p>
          <button
            type="button"
            onClick={() => navigate('/loja')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
          >
            <ShoppingCart className="w-4 h-4" />
            Explorar loja
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => {
            const p = item.product;
            if (!p) return null;
            const productForCard = {
              ...p,
              coverImageUrl: p.coverImageUrl?.startsWith('http')
                ? p.coverImageUrl
                : p.coverImageUrl
                  ? `${API_BASE}${p.coverImageUrl}`
                  : null,
              reviewCount: p.reviewCount ?? 0,
              seller: p.seller || { name: 'Vendedor' },
            };
            return (
              <div key={item.id} className="relative group">
                <ProductCard product={productForCard} />
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(p.id); }}
                  disabled={removing === p.id}
                  className="absolute top-2 right-2 p-2 rounded-full bg-black/60 hover:bg-red-500/80 transition z-10"
                >
                  {removing === p.id ? (
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 text-white" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
