import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Plus, Package, Edit2, Eye, Clock, CheckCircle, XCircle, Send } from 'lucide-react';
import { CATEGORY_LABELS } from '../../constants/productForm';

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  DRAFT: { label: 'Rascunho', color: 'text-gray-400', icon: Clock },
  PENDING_APPROVAL: { label: 'Aguardando aprovação', color: 'text-yellow-400', icon: Clock },
  APPROVED: { label: 'Aprovado', color: 'text-green-400', icon: CheckCircle },
  REJECTED: { label: 'Rejeitado', color: 'text-red-400', icon: XCircle },
  INACTIVE: { label: 'Inativo', color: 'text-gray-400', icon: XCircle },
};

export default function SellerProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState<string | null>(null);

  const loadProducts = () =>
    api.get('/marketplace/seller/products')
      .then(({ data }) => setProducts(data || []))
      .catch(() => setProducts([]));

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));
  }, []);

  const handleSubmitForApproval = async (productId: string) => {
    setSubmitLoading(productId);
    try {
      await api.post(`/marketplace/product/${productId}/submit-for-approval`);
      await loadProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar para aprovação');
    } finally {
      setSubmitLoading(null);
    }
  };

  const API_BASE = import.meta.env.VITE_API_URL
    ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
    : (typeof window !== 'undefined' ? window.location.origin : '') + (window.location.port === '5173' ? ':3001' : '');

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 animate-pulse">
            <div className="flex gap-4">
              <div className="w-20 h-20 bg-gray-700/50 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-gray-700/50 rounded w-1/3" />
                <div className="h-4 bg-gray-700/50 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-xs">
        <strong>Importante:</strong> O comerciante é o único responsável pelo endereço Liquid fornecido. O PagDepix é isento de qualquer responsabilidade por perdas causadas por erro de endereço ou perda de chaves.
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-gray-400 text-sm">
          {products.length} {products.length === 1 ? 'produto' : 'produtos'} cadastrado{products.length !== 1 ? 's' : ''}
        </p>
        <button
          type="button"
          onClick={() => navigate('/comercio/loja/produtos/novo')}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 hover:shadow-lg hover:shadow-bitcoin/30 text-black font-semibold transition"
        >
          <Plus className="w-5 h-5" />
          Criar Produto
        </button>
      </div>

      {products.length === 0 ? (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-12 text-center">
          <div className="inline-flex p-4 rounded-full bg-gray-700/50 mb-4">
            <Package className="w-12 h-12 text-gray-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Nenhum produto cadastrado</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Cadastre seu primeiro produto digital e comece a vender na loja PagDepix.
          </p>
          <button
            type="button"
            onClick={() => navigate('/comercio/loja/produtos/novo')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-bitcoin hover:bg-orange-500 text-black font-semibold transition"
          >
            <Plus className="w-5 h-5" />
            Cadastrar produto
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => {
            const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS.PENDING_APPROVAL;
            const StatusIcon = statusInfo.icon;
            const coverSrc = p.coverImageUrl
              ? (p.coverImageUrl.startsWith('http') ? p.coverImageUrl : `${API_BASE}${p.coverImageUrl}`)
              : '';

            return (
              <div
                key={p.id}
                className="bg-gray-800/50 backdrop-blur-xl rounded-xl border border-gray-700/50 p-4 md:p-6 flex flex-col sm:flex-row gap-4 hover:border-gray-600/50 transition"
              >
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg bg-gray-700/50 overflow-hidden flex-shrink-0">
                  {coverSrc ? (
                    <img src={coverSrc} alt={p.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white truncate">{p.title}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {CATEGORY_LABELS[p.category] || p.category} • {Number(p.priceInDepix).toFixed(2)} DEPIX
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1 text-xs ${statusInfo.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusInfo.label}
                    </span>
                    <span className="text-gray-500 text-xs">
                      • {p._count?.orders ?? 0} vendas • {p._count?.reviews ?? 0} avaliações
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.status === 'DRAFT' && (
                    <button
                      type="button"
                      onClick={() => handleSubmitForApproval(p.id)}
                      disabled={submitLoading === p.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/80 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition"
                      title="Enviar para aprovação"
                    >
                      {submitLoading === p.id ? '...' : <><Send className="w-4 h-4" /> Enviar para Revisão</>}
                    </button>
                  )}
                  {p.status === 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => window.open(`/loja/produto/${p.slug}`, '_blank')}
                      className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-400 hover:text-white transition"
                      title="Ver na loja"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  {(p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL' || p.status === 'APPROVED') && (
                    <button
                      type="button"
                      onClick={() => navigate(`/comercio/loja/produtos/${p.id}/editar`)}
                      className="p-2 rounded-lg bg-gray-700/50 hover:bg-bitcoin/20 text-gray-400 hover:text-bitcoin transition"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
