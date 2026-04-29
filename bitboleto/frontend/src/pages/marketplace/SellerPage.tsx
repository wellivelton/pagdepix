import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { ProductCard } from '../../components/marketplace/ProductCard';
import { Store, Star, Package, ShoppingBag, ChevronLeft, ChevronRight } from 'lucide-react';

interface Seller {
  id: string;
  name: string;
  createdAt: string;
  averageRating: number | null;
  totalSales: number;
  totalProducts: number;
}

interface Pagination {
  page: number;
  pages: number;
  total: number;
}

export default function SellerPage() {
  const { sellerId } = useParams<{ sellerId: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = (p = 1) => {
    if (!sellerId) return;
    setLoading(true);
    api
      .get(`/marketplace/seller/${sellerId}/profile`, { params: { page: p, limit: 24 } })
      .then(({ data }) => {
        setSeller(data.seller);
        setProducts(data.products || []);
        setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
        setPage(p);
      })
      .catch(() => setSeller(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
  }, [sellerId]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6 animate-pulse">
          <div className="h-8 bg-gray-700/50 rounded w-1/3 mb-3" />
          <div className="h-4 bg-gray-700/50 rounded w-1/4" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 aspect-square animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-16">
        <Store className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Vendedor não encontrado</h2>
        <Link to="/loja" className="text-bitcoin hover:underline text-sm">
          Voltar à loja
        </Link>
      </div>
    );
  }

  const memberSince = new Date(seller.createdAt).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      {/* SEO básico */}
      <title>{seller.name} — Loja no Marketplace</title>

      <div className="space-y-6 animate-fade-in">
        {/* Banner / cabeçalho do vendedor */}
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-700/50 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-bitcoin/10 border-2 border-bitcoin/30 flex items-center justify-center flex-shrink-0">
              <Store className="w-8 h-8 text-bitcoin" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">{seller.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">Membro desde {memberSince}</p>
            </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{seller.totalProducts}</p>
              <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-1">
                <Package className="w-3 h-3" /> Produtos
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{seller.totalSales}</p>
              <p className="text-xs text-gray-400 flex items-center justify-center gap-1 mt-1">
                <ShoppingBag className="w-3 h-3" /> Vendas
              </p>
            </div>
            <div className="text-center">
              {seller.averageRating != null ? (
                <>
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-2xl font-bold text-white">{seller.averageRating.toFixed(1)}</p>
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Avaliação</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-500">—</p>
                  <p className="text-xs text-gray-400 mt-1">Sem avaliação</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Produtos do vendedor */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Produtos ({pagination.total})
            </h2>
          </div>

          {products.length === 0 ? (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-12 text-center">
              <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Nenhum produto disponível no momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Paginação */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => load(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <span className="text-sm text-gray-400">
                {page} / {pagination.pages}
              </span>
              <button
                type="button"
                onClick={() => load(page + 1)}
                disabled={page >= pagination.pages}
                className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm disabled:opacity-50 transition"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
