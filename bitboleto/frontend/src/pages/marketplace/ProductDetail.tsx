import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Star, ArrowLeft, ShoppingCart, Plus, Heart, Store } from 'lucide-react';
import api from '../../services/api';
import { useCart } from '../../contexts/CartContext';
import { useToast } from '../../contexts/ToastContext';
import { ProductCard } from '../../components/marketplace/ProductCard';

const AFFILIATE_REF_KEY = 'marketplace_affiliate_ref';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref && typeof ref === 'string' && ref.trim()) {
      try {
        sessionStorage.setItem(AFFILIATE_REF_KEY, ref.trim());
      } catch {}
    }
  }, [searchParams]);
  const { addToCart } = useCart();
  const toast = useToast();
  const [product, setProduct] = useState<any>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);

  useEffect(() => {
    if (!slug) return;
    api.get(`/marketplace/product/${slug}`)
      .then(({ data }) => setProduct(data))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!product?.id) return;
    // Produtos da mesma categoria
    if (product.category) {
      api.get('/marketplace/products', {
        params: { category: product.category, limit: 5 },
      }).then(({ data }) => {
        const items = (data?.products ?? data ?? []).filter((p: any) => p.id !== product.id);
        setRelatedProducts(items.slice(0, 4));
      }).catch(() => {});
    }
    // Outros produtos do mesmo vendedor
    if (product.seller?.id) {
      api.get(`/marketplace/seller/${product.seller.id}/profile`)
        .then(({ data }) => {
          const items = (data?.products ?? []).filter((p: any) => p.id !== product.id);
          setSellerProducts(items.slice(0, 4));
        }).catch(() => {});
    }
  }, [product?.id, product?.category, product?.seller?.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !product?.id) return;
    api.get('/marketplace/wishlist')
      .then(({ data }) => {
        const ids = (data || []).map((i: any) => i.productId);
        setInWishlist(ids.includes(product.id));
      })
      .catch(() => setInWishlist(false));
  }, [product?.id]);

  const toggleWishlist = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: `/loja/produto/${slug}` } });
      return;
    }
    if (!product?.id || wishlistLoading) return;
    setWishlistLoading(true);
    try {
      if (inWishlist) {
        await api.delete(`/marketplace/wishlist/${product.id}`);
        setInWishlist(false);
        toast.success('Removido dos favoritos');
      } else {
        await api.post('/marketplace/wishlist', { productId: product.id });
        setInWishlist(true);
        toast.success('Adicionado aos favoritos');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar favoritos');
    } finally {
      setWishlistLoading(false);
    }
  };

  const handleBuy = () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: `/loja/produto/${slug}` } });
      return;
    }
    navigate(`/loja/checkout/${product.id}`);
  };

  const handleAddToCart = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: `/loja/produto/${slug}` } });
      return;
    }
    setAddingToCart(true);
    try {
      await addToCart(product.id, 1);
      navigate('/loja/carrinho');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar');
    } finally {
      setAddingToCart(false);
    }
  };

  const API_BASE = import.meta.env.VITE_API_URL
    ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : '') + (window.location.port === '5173' ? ':3001' : '');
  const coverSrc = product?.coverImageUrl
    ? (product.coverImageUrl.startsWith('http') ? product.coverImageUrl : `${API_BASE}${product.coverImageUrl}`)
    : '';

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="animate-pulse aspect-square md:aspect-video bg-gray-700/50" />
        </div>
      </div>
    );
  }
  if (!product) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-8 md:p-12 text-center">
        <p className="text-gray-400 mb-4">Produto não encontrado.</p>
        <button
          type="button"
          onClick={() => navigate('/loja')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar à loja
        </button>
      </div>
    );
  }

  const canonicalUrl = typeof window !== 'undefined' ? `${window.location.origin}/loja/produto/${product.slug}` : '';
  const ogImage = product.coverImageUrl
    ? (product.coverImageUrl.startsWith('http') ? product.coverImageUrl : `${API_BASE}${product.coverImageUrl}`)
    : '';

  return (
    <div className="space-y-6 animate-fade-in">
      <Helmet>
        <title>{product.title} | Marketplace PagDepix</title>
        <meta name="description" content={(product.description || '').slice(0, 160)} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="product" />
        <meta property="og:title" content={product.title} />
        <meta property="og:description" content={(product.description || '').slice(0, 200)} />
        <meta property="og:url" content={canonicalUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={product.title} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.title,
            description: (product.description || '').slice(0, 500),
            image: ogImage,
            offers: {
              '@type': 'Offer',
              price: product.priceInDepix,
              priceCurrency: 'BRL',
              availability: 'https://schema.org/InStock',
            },
            aggregateRating: product.averageRating != null ? {
              '@type': 'AggregateRating',
              ratingValue: product.averageRating,
              reviewCount: product.reviewCount || 0,
            } : undefined,
          })}
        </script>
      </Helmet>
      <button
        type="button"
        onClick={() => navigate('/loja')}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar à loja
      </button>

      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 p-6 md:p-8">
          <div className="relative aspect-square bg-gray-700/30 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={toggleWishlist}
              disabled={wishlistLoading}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 transition"
            >
              <Heart
                className={`w-5 h-5 ${inWishlist ? 'fill-red-500 text-red-500' : 'text-white'}`}
              />
            </button>
            {coverSrc ? (
              <img src={coverSrc} alt={product.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500">
                <span className="text-sm">Sem imagem</span>
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-bitcoin font-medium mb-1 uppercase tracking-wider">
              {product.category}
            </span>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{product.title}</h1>
            <p className="text-gray-400 mb-4">por {product.seller?.name}</p>
            {product.averageRating != null && (
              <div className="flex items-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`w-5 h-5 ${s <= Math.round(product.averageRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}`}
                  />
                ))}
                <span className="text-gray-500 ml-2 text-sm">({product.reviewCount} avaliações)</span>
              </div>
            )}
            <p className="text-gray-300 whitespace-pre-wrap mb-6 flex-1">{product.description}</p>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-gray-700/50">
              <div>
                <span className="text-gray-500 text-sm block">Preço</span>
                <p className="text-2xl md:text-3xl font-bold text-bitcoin">
                  {Number(product.priceInDepix).toFixed(2)} DEPIX
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={addingToCart}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold transition disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                  {addingToCart ? 'Adicionando...' : 'Adicionar ao carrinho'}
                </button>
                <button
                  type="button"
                  onClick={handleBuy}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold transition"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Comprar com Pix
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {product.reviews?.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-6 md:p-8">
          <h2 className="text-xl font-bold text-white mb-4">Avaliações</h2>
          <div className="space-y-4">
            {product.reviews.map((r: any) => (
              <div key={r.id} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-4 h-4 ${s <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-600'}`}
                    />
                  ))}
                  <span className="text-gray-400 text-sm">{r.user?.name}</span>
                </div>
                {r.comment && <p className="text-gray-300 text-sm">{r.comment}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Produtos relacionados (mesma categoria) */}
      {relatedProducts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-white mb-4">Produtos similares</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={{ ...p, seller: p.seller ?? { name: '' } }} />
            ))}
          </div>
        </div>
      )}

      {/* Outros produtos do mesmo vendedor */}
      {sellerProducts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">
              Mais de {product.seller?.name}
            </h2>
            {product.seller?.id && (
              <Link
                to={`/loja/vendedor/${product.seller.id}`}
                className="flex items-center gap-1.5 text-sm text-bitcoin hover:underline"
              >
                <Store className="w-4 h-4" />
                Ver loja completa
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {sellerProducts.map((p) => (
              <ProductCard key={p.id} product={{ ...p, seller: p.seller ?? { name: product.seller?.name ?? '' } }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
