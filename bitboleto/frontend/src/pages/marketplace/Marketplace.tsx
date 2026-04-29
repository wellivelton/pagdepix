import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { HeroBanner } from '../../components/marketplace/HeroBanner';
import { ProductCard } from '../../components/marketplace/ProductCard';
import api from '../../services/api';
import { Search, Filter, ShoppingBag, ChevronLeft, ChevronRight, Sparkles, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS } from '../../constants/productForm';

export default function Marketplace() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    api.get('/marketplace/categories')
      .then(({ data }) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params: any = { page, limit: 20, sort };
    if (search) params.search = search;
    if (category) {
      if (categories.some((c: any) => c.id === category)) params.categoryId = category;
      else params.category = category;
    }
    api.get('/marketplace/products', { params })
      .then(({ data }) => {
        setProducts(data.products || []);
        setPagination(data.pagination || { page: 1, pages: 1, total: 0 });
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, category, categories, sort]);

  return (
    <div className="space-y-6 animate-fade-in">
      <Helmet>
        <title>Loja | Produtos digitais com Depix | PagDepix</title>
        <meta name="description" content="E-books, cursos, softwares e mais. Compre produtos digitais pagando com Pix através do Depix. Receba na hora." />
        <meta property="og:title" content="Loja PagDepix - Produtos digitais com Depix" />
        <meta property="og:description" content="E-books, cursos, softwares e mais. Pague com Pix e receba na hora." />
        <meta property="og:type" content="website" />
      </Helmet>
      {/* Hero / Destaque */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl border border-gray-700/50 overflow-hidden">
        <div className="relative bg-gradient-to-br from-bitcoin/20 via-orange-500/10 to-transparent p-6 md:p-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-bitcoin" />
            <span className="text-bitcoin font-semibold text-sm">Marketplace PagDepix</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
            Produtos digitais com Depix
          </h1>
          <p className="text-gray-400 text-sm md:text-base max-w-xl">
            E-books, cursos, softwares e mais. Pague com Pix e receba na hora.
          </p>
        </div>
        <HeroBanner />
      </div>

      {/* Filtros */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition"
            />
          </div>
          <div className="relative sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition appearance-none cursor-pointer"
            >
              <option value="newest">Mais recentes</option>
              <option value="price_asc">Menor preço</option>
              <option value="price_desc">Maior preço</option>
              <option value="rating">Melhor avaliados</option>
            </select>
          </div>
          <div className="relative sm:w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white focus:border-bitcoin/50 focus:ring-1 focus:ring-bitcoin/30 transition appearance-none cursor-pointer"
            >
              <option value="">Todas as categorias</option>
              {categories.length > 0
                ? categories.flatMap((c: any) => [
                    <option key={c.id} value={c.id}>{c.name}</option>,
                    ...(c.children || []).map((ch: any) => (
                      <option key={ch.id} value={ch.id}>— {ch.name}</option>
                    )),
                  ])
                : Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
            </select>
          </div>
          <Link
            to="/loja/favoritos"
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-bitcoin/50 text-white transition"
          >
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            Favoritos
          </Link>
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-gray-700/50" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-gray-700/50 rounded w-3/4" />
                <div className="h-3 bg-gray-700/50 rounded w-1/2" />
                <div className="h-6 bg-gray-700/50 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-12 md:p-16 text-center">
          <div className="inline-flex p-4 rounded-full bg-gray-700/50 mb-4">
            <ShoppingBag className="w-12 h-12 text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Nenhum produto encontrado</h2>
          <p className="text-gray-400 max-w-md mx-auto mb-6">
            {search || category
              ? 'Tente ajustar os filtros ou a busca para encontrar o que procura.'
              : 'A loja ainda está sendo preparada. Em breve teremos produtos incríveis para você.'}
          </p>
          {(search || category) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setCategory(''); setPage(1); }}
              className="px-5 py-2.5 rounded-lg bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-gray-400 text-sm">
              {pagination.total} {pagination.total === 1 ? 'produto' : 'produtos'} encontrado{pagination.total !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                type="button"
                onClick={() => setPage((x) => Math.max(1, x - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700 text-white hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <span className="px-4 py-2.5 text-gray-400 text-sm">
                Página {page} de {pagination.pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((x) => Math.min(pagination.pages, x + 1))}
                disabled={page >= pagination.pages}
                className="flex items-center gap-1 px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700 text-white hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
