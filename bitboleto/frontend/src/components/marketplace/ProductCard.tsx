import { useState } from 'react';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CATEGORY_LABELS } from '../../constants/productForm';

interface ProductCardProps {
  product: {
    id: string;
    slug: string;
    title: string;
    priceInDepix: number;
    coverImageUrl?: string | null;
    category: string;
    averageRating?: number | null;
    reviewCount: number;
    seller: { name: string };
  };
}

const API_BASE = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
  : (typeof window !== 'undefined' ? window.location.origin : '') +
    (window.location.port === '5173' ? ':3001' : '');

export function ProductCard({ product }: ProductCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const rawSrc = product.coverImageUrl;
  const coverSrc =
    rawSrc && !imgError
      ? rawSrc.startsWith('http')
        ? rawSrc
        : `${API_BASE}${rawSrc}`
      : '';

  return (
    <Link
      to={`/loja/produto/${product.slug}`}
      className="group block bg-gray-800/50 backdrop-blur rounded-xl border border-gray-700/50 hover:border-bitcoin/50 transition overflow-hidden"
    >
      <div className="aspect-square bg-gray-700/50 overflow-hidden relative">
        {coverSrc ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-gray-700/60 animate-pulse" />
            )}
            <img
              src={coverSrc}
              alt={product.title}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              className={`w-full h-full object-cover group-hover:scale-105 transition duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <span className="text-sm">Sem imagem</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-white mb-1 line-clamp-2">{product.title}</h3>
        <p className="text-sm text-gray-400 mb-2">por {product.seller.name}</p>
        {product.averageRating != null ? (
          <div className="flex items-center gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${
                  star <= Math.round(product.averageRating!)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-600'
                }`}
              />
            ))}
            <span className="text-sm text-gray-500 ml-1">({product.reviewCount})</span>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-2">Sem avaliações</p>
        )}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500">A partir de</span>
            <p className="text-lg font-bold text-bitcoin">
              {Number(product.priceInDepix).toFixed(2)} DEPIX
            </p>
          </div>
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
            {CATEGORY_LABELS[product.category] || product.category}
          </span>
        </div>
      </div>
    </Link>
  );
}
