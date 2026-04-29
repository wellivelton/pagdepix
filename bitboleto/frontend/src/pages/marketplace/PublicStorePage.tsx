import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import { ShoppingBag, Phone, Mail, Building2 } from 'lucide-react';
import { CATEGORY_LABELS } from '../../constants/productForm';

type StoreSettings = {
  businessName: string | null;
  businessDescription: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  useCustomBranding: boolean;
  storeSlug: string | null;
  cnpj?: string | null;
  contactPhone?: string | null;
  supportEmail?: string | null;
  sellerName: string | null;
};

type Product = {
  id: string;
  title: string;
  slug: string;
  priceInDepix: number;
  category: string;
  deliveryType: string;
  coverImageUrl: string | null;
  description: string;
  averageRating: number | null;
  reviewCount: number;
};

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '');
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export default function PublicStorePage() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    if (!storeSlug) return;
    api.get(`/commerce/store/${storeSlug}`)
      .then(({ data }) => {
        setSettings(data.settings);
        setProducts(data.products || []);
        // Update page title and meta
        if (data.settings?.businessName) {
          document.title = `${data.settings.businessName} | PagDepix`;
        }
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && data.settings?.businessDescription) {
          metaDesc.setAttribute('content', data.settings.businessDescription);
        }
      })
      .catch((err) => {
        if (err?.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [storeSlug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !settings) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-center px-4">
        <ShoppingBag className="w-16 h-16 text-gray-600 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Loja não encontrada</h1>
        <p className="text-gray-400 mb-6">O endereço <span className="text-orange-400 font-mono">/loja/{storeSlug}</span> não existe.</p>
        <Link to="/" className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-xl transition">Voltar ao início</Link>
      </div>
    );
  }

  const bg = settings.useCustomBranding && settings.backgroundColor ? settings.backgroundColor : '#111827';
  const fg = settings.useCustomBranding && settings.textColor ? settings.textColor : '#F9FAFB';
  const accent = settings.useCustomBranding && settings.primaryColor ? settings.primaryColor : '#F97316';

  const categories = [...new Set(products.map((p) => p.category))];
  const filtered = categoryFilter ? products.filter((p) => p.category === categoryFilter) : products;

  return (
    <div className="min-h-screen" style={{ backgroundColor: bg, color: fg }}>
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-lg border-b" style={{ borderColor: `${fg}20`, backgroundColor: `${bg}e6` }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          {settings.useCustomBranding && settings.logoUrl && (
            <img src={settings.logoUrl} alt={settings.businessName || ''} className="h-10 w-auto object-contain" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg truncate" style={{ color: fg }}>{settings.businessName || 'Loja'}</h1>
            {settings.businessDescription && (
              <p className="text-xs truncate" style={{ color: `${fg}80` }}>{settings.businessDescription}</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Contact info */}
        {(settings.contactPhone || settings.supportEmail || settings.cnpj) && (
          <div className="flex flex-wrap gap-3 text-sm" style={{ color: `${fg}90` }}>
            {settings.contactPhone && (
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                <span>{formatPhone(settings.contactPhone)}</span>
              </div>
            )}
            {settings.supportEmail && (
              <div className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                <a href={`mailto:${settings.supportEmail}`} className="hover:underline">{settings.supportEmail}</a>
              </div>
            )}
            {settings.cnpj && (
              <div className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>CNPJ: {settings.cnpj}</span>
              </div>
            )}
          </div>
        )}

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter('')}
              className="px-3 py-1 rounded-full text-xs font-medium transition"
              style={!categoryFilter ? { backgroundColor: accent, color: '#000' } : { backgroundColor: `${fg}15`, color: fg }}
            >
              Todos ({products.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat === categoryFilter ? '' : cat)}
                className="px-3 py-1 rounded-full text-xs font-medium transition"
                style={categoryFilter === cat ? { backgroundColor: accent, color: '#000' } : { backgroundColor: `${fg}15`, color: fg }}
              >
                {CATEGORY_LABELS[cat] || cat} ({products.filter((p) => p.category === cat).length})
              </button>
            ))}
          </div>
        )}

        {/* Products grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" style={{ color: fg }} />
            <p className="opacity-60" style={{ color: fg }}>Nenhum produto disponível no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filtered.map((product) => {
              return (
                <div
                  key={product.id}
                  className="rounded-xl border overflow-hidden flex flex-col transition hover:scale-[1.02]"
                  style={{ borderColor: `${fg}20`, backgroundColor: `${fg}08` }}
                >
                  {/* Cover */}
                  <div className="aspect-square overflow-hidden bg-gray-800 relative">
                    {product.coverImageUrl ? (
                      <img
                        src={product.coverImageUrl}
                        alt={product.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-20">
                        <ShoppingBag className="w-10 h-10" style={{ color: fg }} />
                      </div>
                    )}
                    {/* Category badge */}
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{ backgroundColor: `${accent}30`, color: accent }}>
                      {CATEGORY_LABELS[product.category] || product.category}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-3 flex flex-col flex-1 gap-1">
                    <p className="text-sm font-semibold line-clamp-2" style={{ color: fg }}>{product.title}</p>
                    <p className="text-sm font-bold mt-auto" style={{ color: accent }}>
                      {product.priceInDepix === 0 ? 'Grátis' : `${Number(product.priceInDepix).toFixed(2)} DEPIX`}
                    </p>
                    <Link
                      to={`/loja/produto/${product.slug}`}
                      className="mt-2 py-1.5 rounded-lg text-center text-xs font-semibold transition"
                      style={{ backgroundColor: accent, color: '#000' }}
                    >
                      Ver produto
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-xs pt-6 pb-2" style={{ color: `${fg}40` }}>
          <a href="/" className="hover:underline">Powered by PagDepix</a>
        </footer>
      </main>
    </div>
  );
}
