import { useState, useEffect } from 'react';
import {
  Package,
  ShoppingCart,
  ThumbsUp,
  ThumbsDown,
  Search,
  Loader2,
  ExternalLink,
  User,
  DollarSign,
  Calendar,
  FileText,
  Link as LinkIcon,
  Key,
  Download,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';

const baseUrl = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL as string).replace(/\/api\/?$/, '')
  : (import.meta.env.PROD ? (typeof window !== 'undefined' ? window.location.origin : '') : 'http://localhost:3001');

type ProductStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'INACTIVE' | 'ALL';
type MarketplaceSubTab = 'produtos' | 'vendas' | 'disputas' | 'avaliacoes' | 'vendedores' | 'saques' | 'cupons';
type OrderStats = {
  totalOrders: number;
  paidOrders: number;
  totalRevenue: number;
  platformFees?: number;
  topSellers?: Array<{ seller?: { name: string; email: string }; revenue: number; ordersCount: number }>;
  topProducts?: Array<{ product?: { title: string; slug: string }; revenue: number; salesCount: number }>;
};

export default function AdminMarketplace() {
  const [subTab, setSubTab] = useState<MarketplaceSubTab>('produtos');
  const [productStatus, setProductStatus] = useState<ProductStatus>('PENDING_APPROVAL');
  const [products, setProducts] = useState<any[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [productPagination, setProductPagination] = useState({ total: 0, pages: 1 });
  const [productActionLoading, setProductActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ productId: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adjustmentModal, setAdjustmentModal] = useState<{ productId: string; title: string } | null>(null);
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjustmentLoading, setAdjustmentLoading] = useState(false);
  const [contentModal, setContentModal] = useState<{
    productId: string;
    title: string;
    deliveryType: string;
    deliveryLink?: string;
    files?: Array<{ id: string; originalFilename?: string }>;
    codesTotal?: number;
    codesAvailable?: number;
  } | null>(null);

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');
  const [orderStats, setOrderStats] = useState<OrderStats>({
    totalOrders: 0,
    paidOrders: 0,
    totalRevenue: 0,
    platformFees: 0,
    topSellers: [],
    topProducts: [],
  });
  const [orderPage, setOrderPage] = useState(1);
  const [orderPagination, setOrderPagination] = useState({ total: 0, pages: 1 });

  const [disputes, setDisputes] = useState<any[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [disputeStatusFilter, setDisputeStatusFilter] = useState<'open' | 'resolved'>('open');
  const [disputeResolveLoading, setDisputeResolveLoading] = useState<string | null>(null);

  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState<'pending' | 'approved'>('pending');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPagination, setReviewPagination] = useState({ total: 0, pages: 1 });
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);

  const [sellers, setSellers] = useState<any[]>([]);
  const [sellersLoading, setSellersLoading] = useState(false);
  const [sellerSearch, setSellerSearch] = useState('');
  const [sellerPage, setSellerPage] = useState(1);
  const [sellerPagination, setSellerPagination] = useState({ total: 0, pages: 1 });

  const [sellerWithdrawals, setSellerWithdrawals] = useState<any[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState('PENDING');
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [withdrawalPagination, setWithdrawalPagination] = useState({ total: 0, pages: 1 });
  const [withdrawalActionLoading, setWithdrawalActionLoading] = useState<string | null>(null);
  const [withdrawalNotes, setWithdrawalNotes] = useState('');
  const [withdrawalTxid, setWithdrawalTxid] = useState('');

  const [globalCoupons, setGlobalCoupons] = useState<any[]>([]);
  const [globalCouponsLoading, setGlobalCouponsLoading] = useState(false);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    api.get('/marketplace/admin/metrics')
      .then(({ data }) => setMetrics(data))
      .catch(() => setMetrics(null));
  }, []);

  const loadProducts = async (page = 1) => {
    setProductsLoading(true);
    try {
      const params: Record<string, string> = {
        status: productStatus,
        page: String(page),
        limit: '15',
      };
      if (productSearch.trim()) params.search = productSearch.trim();
      const { data } = await api.get('/marketplace/admin/products', { params });
      setProducts(data.products || []);
      setStatusCounts(data.statusCounts || {});
      setProductPagination({
        total: data.pagination?.total ?? 0,
        pages: data.pagination?.pages ?? 1,
      });
      setProductPage(page);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const loadOrders = async (page = 1) => {
    setOrdersLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '15' };
      if (orderStatusFilter !== 'ALL') params.status = orderStatusFilter;
      const { data } = await api.get('/marketplace/admin/orders', { params });
      setOrders(data.orders || []);
      setOrderStats((data.stats as OrderStats) ?? {
        totalOrders: 0,
        paidOrders: 0,
        totalRevenue: 0,
        platformFees: 0,
        topSellers: [],
        topProducts: [],
      });
      setOrderPagination({
        total: data.pagination?.total ?? 0,
        pages: data.pagination?.pages ?? 1,
      });
      setOrderPage(page);
    } catch (err) {
      console.error('Erro ao carregar vendas:', err);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadReviews = async (page = 1) => {
    setReviewsLoading(true);
    try {
      const { data } = await api.get('/marketplace/admin/reviews', {
        params: { status: reviewStatusFilter, page, limit: 15 },
      });
      setReviews(data.reviews || []);
      setReviewPagination({
        total: data.pagination?.total ?? 0,
        pages: data.pagination?.pages ?? 1,
      });
      setReviewPage(page);
    } catch (err) {
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleApproveReview = async (reviewId: string) => {
    setReviewActionLoading(reviewId);
    try {
      await api.post(`/marketplace/admin/review/${reviewId}/approve`);
      await loadReviews(reviewPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setReviewActionLoading(null);
    }
  };

  const handleRejectReview = async (reviewId: string, reason?: string) => {
    setReviewActionLoading(reviewId);
    try {
      await api.post(`/marketplace/admin/review/${reviewId}/reject`, { reason });
      await loadReviews(reviewPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setReviewActionLoading(null);
    }
  };

  const loadSellers = async (page = 1) => {
    setSellersLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '15' };
      if (sellerSearch.trim()) params.search = sellerSearch.trim();
      const { data } = await api.get('/marketplace/admin/sellers', { params });
      setSellers(data.sellers || []);
      setSellerPagination({
        total: data.pagination?.total ?? 0,
        pages: data.pagination?.pages ?? 1,
      });
      setSellerPage(page);
    } catch (err) {
      setSellers([]);
    } finally {
      setSellersLoading(false);
    }
  };

  const loadSellerWithdrawals = async (page = 1) => {
    setWithdrawalsLoading(true);
    try {
      const { data } = await api.get('/marketplace/admin/seller-withdrawals', {
        params: { status: withdrawalStatusFilter, page, limit: 15 },
      });
      setSellerWithdrawals(data.withdrawals || []);
      setWithdrawalPagination({
        total: data.pagination?.total ?? 0,
        pages: data.pagination?.pages ?? 1,
      });
      setWithdrawalPage(page);
    } catch (err) {
      setSellerWithdrawals([]);
    } finally {
      setWithdrawalsLoading(false);
    }
  };

  const handleProcessWithdrawal = async (withdrawalId: string, action: 'approve' | 'reject') => {
    setWithdrawalActionLoading(withdrawalId);
    try {
      await api.post(`/marketplace/admin/seller-withdrawal/${withdrawalId}/process`, {
        action,
        adminNotes: withdrawalNotes,
        txid: action === 'approve' ? withdrawalTxid : undefined,
      });
      setWithdrawalNotes('');
      setWithdrawalTxid('');
      await loadSellerWithdrawals(withdrawalPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao processar');
    } finally {
      setWithdrawalActionLoading(null);
    }
  };

  const loadGlobalCoupons = async () => {
    setGlobalCouponsLoading(true);
    try {
      const { data } = await api.get('/marketplace/admin/global-coupons');
      setGlobalCoupons(data || []);
    } catch (err) {
      setGlobalCoupons([]);
    } finally {
      setGlobalCouponsLoading(false);
    }
  };

  const loadDisputes = async () => {
    setDisputesLoading(true);
    try {
      const { data } = await api.get('/marketplace/admin/disputes', {
        params: { status: disputeStatusFilter },
      });
      setDisputes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar disputas:', err);
      setDisputes([]);
    } finally {
      setDisputesLoading(false);
    }
  };

  const handleResolveDispute = async (orderId: string, resolution: string) => {
    setDisputeResolveLoading(orderId);
    try {
      await api.post(`/marketplace/admin/dispute/${orderId}/resolve`, { resolution });
      await loadDisputes();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao resolver disputa');
    } finally {
      setDisputeResolveLoading(null);
    }
  };

  useEffect(() => {
    if (subTab === 'produtos') loadProducts(1);
    else if (subTab === 'vendas') loadOrders(1);
    else if (subTab === 'disputas') loadDisputes();
  }, [subTab, productStatus, orderStatusFilter, disputeStatusFilter]);

  const handleApproveProduct = async (productId: string) => {
    setProductActionLoading(productId);
    try {
      await api.post(`/marketplace/admin/product/${productId}/approve`);
      await loadProducts(productPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao aprovar');
    } finally {
      setProductActionLoading(null);
    }
  };

  const handleRejectProduct = async () => {
    if (!rejectModal) return;
    setProductActionLoading(rejectModal.productId);
    try {
      await api.post(`/marketplace/admin/product/${rejectModal.productId}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      setRejectModal(null);
      setRejectReason('');
      await loadProducts(productPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao rejeitar');
    } finally {
      setProductActionLoading(null);
    }
  };

  const handleRequestAdjustment = async () => {
    if (!adjustmentModal) return;
    setAdjustmentLoading(true);
    try {
      await api.post(`/marketplace/admin/product/${adjustmentModal.productId}/request-adjustment`, {
        notes: adjustmentNotes.trim(),
      });
      setAdjustmentModal(null);
      setAdjustmentNotes('');
      await loadProducts(productPage);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao solicitar ajustes');
    } finally {
      setAdjustmentLoading(false);
    }
  };

  const openContentModal = async (p: { id: string; title: string; deliveryType: string }) => {
    try {
      const { data } = await api.get(`/marketplace/admin/product/${p.id}/content`);
      setContentModal({
        productId: p.id,
        title: p.title,
        deliveryType: data.deliveryType,
        deliveryLink: data.deliveryLink,
        files: data.files,
        codesTotal: data.codesTotal ?? 0,
        codesAvailable: data.codesAvailable ?? 0,
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao carregar conteúdo');
    }
  };

  const statusLabels: Record<string, string> = {
    PENDING_APPROVAL: 'Pendentes',
    APPROVED: 'Aprovados',
    REJECTED: 'Rejeitados',
    INACTIVE: 'Inativos',
  };

  return (
    <div className="space-y-6">
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs">Produtos</p>
            <p className="text-white font-bold">{metrics.products?.total ?? 0} <span className="text-amber-400 text-sm">({metrics.products?.pendingApproval ?? 0} pend.)</span></p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs">Pedidos pagos</p>
            <p className="text-white font-bold">{metrics.orders?.paid ?? 0}</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs">Vendedores</p>
            <p className="text-white font-bold">{metrics.sellers ?? 0}</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs">Disputas / Saques pend.</p>
            <p className="text-white font-bold">{metrics.disputes?.open ?? 0} / {metrics.withdrawals?.pending ?? 0}</p>
          </div>
          <div className="bg-gray-800/50 rounded-xl p-3 border border-bitcoin/30">
            <p className="text-gray-500 text-xs">Taxas plataforma</p>
            <p className="text-bitcoin font-bold">{(metrics.revenue?.platformFees ?? 0).toFixed(2)}</p>
          </div>
        </div>
      )}
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSubTab('produtos')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'produtos' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <Package className="w-4 h-4" />
          Produtos
          {statusCounts.PENDING_APPROVAL > 0 && (
            <span className="bg-red-500/90 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
              {statusCounts.PENDING_APPROVAL}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab('vendas')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'vendas' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Vendas
        </button>
        <button
          onClick={() => setSubTab('disputas')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'disputas' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Disputas
        </button>
        <button
          onClick={() => { setSubTab('avaliacoes'); loadReviews(1); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'avaliacoes' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <ThumbsUp className="w-4 h-4" />
          Avaliações
        </button>
        <button
          onClick={() => { setSubTab('vendedores'); loadSellers(1); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'vendedores' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <User className="w-4 h-4" />
          Vendedores
        </button>
        <button
          onClick={() => { setSubTab('saques'); loadSellerWithdrawals(1); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'saques' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Saques
        </button>
        <button
          onClick={() => { setSubTab('cupons'); loadGlobalCoupons(); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 ${
            subTab === 'cupons' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'
          }`}
        >
          <Key className="w-4 h-4" />
          Cupons
        </button>
      </div>

      {/* Produtos */}
      {subTab === 'produtos' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex gap-2 flex-wrap">
                {(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setProductStatus(s)}
                    className={`px-4 py-2 rounded-xl font-medium transition-all ${
                      productStatus === s
                        ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {s === 'ALL' ? 'Todos' : statusLabels[s] || s}
                    {s !== 'ALL' && statusCounts[s] != null && (
                      <span className="ml-1 opacity-80">({statusCounts[s]})</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[200px] flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadProducts(1)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50"
                  />
                </div>
                <button
                  onClick={() => loadProducts(1)}
                  className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm"
                >
                  Buscar
                </button>
              </div>
            </div>
          </div>

          {productsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
            </div>
          ) : products.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
              <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum produto encontrado</h3>
              <p className="text-gray-500">
                {productStatus === 'PENDING_APPROVAL'
                  ? 'Não há produtos aguardando aprovação'
                  : 'Altere o filtro ou faça uma busca'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
                >
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex gap-4 flex-1">
                      {p.coverImageUrl && (
                        <img
                          src={baseUrl + p.coverImageUrl}
                          alt={p.title}
                          className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white truncate">{p.title}</h3>
                        <p className="text-sm text-gray-400 mt-1">
                          por {p.seller?.name || '—'} ({p.seller?.email})
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-0.5 rounded-lg bg-gray-700/50 text-gray-300 text-xs">
                            {p.category}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-gray-700/50 text-gray-300 text-xs">
                            {p.deliveryType}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                              p.status === 'PENDING_APPROVAL'
                                ? 'bg-amber-500/20 text-amber-400'
                                : p.status === 'APPROVED'
                                ? 'bg-green-500/20 text-green-400'
                                : p.status === 'REJECTED'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}
                          >
                            {statusLabels[p.status] || p.status}
                          </span>
                        </div>
                        <p className="text-bitcoin font-semibold mt-1">
                          {Number(p.priceInDepix).toFixed(2)} DEPIX
                        </p>
                        {p.rejectionReason && (
                          <p className="text-sm text-red-400 mt-1">Motivo: {p.rejectionReason}</p>
                        )}
                        {p.adminAdjustmentRequest && (
                          <p className="text-sm text-amber-400 mt-1">Ajustes solicitados: {p.adminAdjustmentRequest}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 md:min-w-[180px]">
                      <a
                        href={`/loja/produto/${p.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver na loja
                      </a>
                      {(p.status === 'PENDING_APPROVAL' || p.status === 'DRAFT') && (
                        <button
                          onClick={() => openContentModal(p)}
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-600 hover:bg-gray-500 text-white text-sm"
                        >
                          <FileText className="w-4 h-4" />
                          Ver conteúdo
                        </button>
                      )}
                      {p.status === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={() => handleApproveProduct(p.id)}
                            disabled={productActionLoading === p.id}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-medium disabled:opacity-50"
                          >
                            {productActionLoading === p.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ThumbsUp className="w-4 h-4" />
                            )}
                            Aprovar
                          </button>
                          <button
                            onClick={() => setAdjustmentModal({ productId: p.id, title: p.title })}
                            disabled={productActionLoading === p.id}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-white font-medium disabled:opacity-50"
                          >
                            Solicitar ajustes
                          </button>
                          <button
                            onClick={() => setRejectModal({ productId: p.id, title: p.title })}
                            disabled={productActionLoading === p.id}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-medium disabled:opacity-50"
                          >
                            <ThumbsDown className="w-4 h-4" />
                            Rejeitar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {productPagination.pages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button
                    onClick={() => loadProducts(productPage - 1)}
                    disabled={productPage <= 1}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-gray-400">
                    Página {productPage} de {productPagination.pages}
                  </span>
                  <button
                    onClick={() => loadProducts(productPage + 1)}
                    disabled={productPage >= productPagination.pages}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Vendas */}
      {subTab === 'vendas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <ShoppingCart className="w-4 h-4" />
                GMV total (DEPIX)
              </div>
              <p className="text-2xl font-bold text-white">{orderStats.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <ThumbsUp className="w-4 h-4" />
                Pedidos pagos
              </div>
              <p className="text-2xl font-bold text-green-400">{orderStats.paidOrders}</p>
            </div>
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                Taxas plataforma (DEPIX)
              </div>
              <p className="text-2xl font-bold text-bitcoin">
                {(orderStats.platformFees ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                Total de pedidos
              </div>
              <p className="text-2xl font-bold text-white">{orderStats.totalOrders}</p>
            </div>
          </div>

          {((orderStats.topSellers?.length ?? 0) > 0 || (orderStats.topProducts?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(orderStats.topSellers?.length ?? 0) > 0 && (
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
                  <h4 className="font-bold text-white mb-3">Ranking de vendedores</h4>
                  <div className="space-y-2">
                    {orderStats.topSellers!.slice(0, 5).map((s: { seller?: { name: string; email: string }; revenue: number; ordersCount: number }, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-300 truncate">{s.seller?.name || '—'}</span>
                        <span className="text-bitcoin font-medium">{s.revenue.toFixed(2)} DEPIX</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(orderStats.topProducts?.length ?? 0) > 0 && (
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
                  <h4 className="font-bold text-white mb-3">Produtos mais vendidos</h4>
                  <div className="space-y-2">
                    {orderStats.topProducts!.slice(0, 5).map((p: { product?: { title: string; slug: string }; revenue: number; salesCount: number }, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-gray-300 truncate max-w-[180px]">{p.product?.title || '—'}</span>
                        <span className="text-bitcoin font-medium">{p.salesCount} vendas</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
            <div className="flex gap-2">
              {['ALL', 'pending', 'paid'].map((s) => (
                <button
                  key={s}
                  onClick={() => setOrderStatusFilter(s)}
                  className={`px-4 py-2 rounded-xl font-medium transition-all ${
                    orderStatusFilter === s
                      ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                      : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {s === 'ALL' ? 'Todos' : s === 'paid' ? 'Pagos' : 'Pendentes'}
                </button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
              <ShoppingCart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhuma venda encontrada</h3>
              <p className="text-gray-500">As vendas do marketplace aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                      <h3 className="font-bold text-white">{o.product?.title}</h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          Comprador: {o.buyer?.name} ({o.buyer?.email})
                        </span>
                        <span className="flex items-center gap-1">
                          Vendedor: {o.seller?.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(o.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="flex gap-4 mt-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            o.paymentStatus === 'paid'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {o.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                        </span>
                        <span className="text-bitcoin font-semibold">
                          {Number(o.finalPrice).toFixed(2)} DEPIX
                        </span>
                      </div>
                    </div>
                    <a
                      href={`/minhas-compras/${o.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm w-fit"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver pedido
                    </a>
                  </div>
                </div>
              ))}
              {orderPagination.pages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button
                    onClick={() => loadOrders(orderPage - 1)}
                    disabled={orderPage <= 1}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-gray-400">
                    Página {orderPage} de {orderPagination.pages}
                  </span>
                  <button
                    onClick={() => loadOrders(orderPage + 1)}
                    disabled={orderPage >= orderPagination.pages}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Disputas */}
      {subTab === 'disputas' && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            {(['open', 'resolved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setDisputeStatusFilter(s)}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  disputeStatusFilter === s
                    ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s === 'open' ? 'Em aberto' : 'Resolvidas'}
              </button>
            ))}
          </div>
          {disputesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-bitcoin" />
            </div>
          ) : disputes.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Nenhuma disputa encontrada.</p>
          ) : (
            <div className="space-y-4">
              {disputes.map((d: any) => (
                <div
                  key={d.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-2xl p-4 border border-gray-700/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{d.product?.title || 'Produto'}</p>
                      <p className="text-sm text-gray-400 mt-1">Comprador: {d.buyer?.name || d.buyer?.email || '—'}</p>
                      <p className="text-sm text-gray-400">Vendedor: {d.seller?.name || d.seller?.email || '—'}</p>
                      {d.disputeReason && (
                        <p className="text-sm text-amber-200 mt-2 bg-amber-500/10 rounded-lg p-2">
                          {d.disputeReason}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(d.disputeOpenedAt || d.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/minhas-compras/${d.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver pedido
                      </a>
                      {disputeStatusFilter === 'open' && d.disputeStatus === 'open' && (
                        <>
                          <button
                            onClick={() => handleResolveDispute(d.id, 'resolved_buyer')}
                            disabled={disputeResolveLoading === d.id}
                            className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
                          >
                            {disputeResolveLoading === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Favor comprador'}
                          </button>
                          <button
                            onClick={() => handleResolveDispute(d.id, 'resolved_seller')}
                            disabled={disputeResolveLoading === d.id}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
                          >
                            Favor vendedor
                          </button>
                          <button
                            onClick={() => handleResolveDispute(d.id, 'resolved_split')}
                            disabled={disputeResolveLoading === d.id}
                            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50"
                          >
                            Divisão
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Avaliações */}
      {subTab === 'avaliacoes' && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            {(['pending', 'approved'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setReviewStatusFilter(s); loadReviews(1); }}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  reviewStatusFilter === s
                    ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s === 'pending' ? 'Pendentes' : 'Aprovadas'}
              </button>
            ))}
          </div>
          {reviewsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-bitcoin" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Nenhuma avaliação encontrada.</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-2xl p-4 border border-gray-700/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{r.product?.title || 'Produto'}</p>
                      <p className="text-sm text-gray-400 mt-1">{r.user?.name} ({r.user?.email})</p>
                      <div className="flex items-center gap-2 mt-2">
                        {[1,2,3,4,5].map((s) => (
                          <span key={s} className={s <= r.rating ? 'text-yellow-400' : 'text-gray-600'}>★</span>
                        ))}
                        <span className="text-gray-500 text-sm">{r.rating}/5</span>
                      </div>
                      {r.comment && <p className="text-gray-300 text-sm mt-2">{r.comment}</p>}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(r.createdAt).toLocaleString('pt-BR')}
                        {r._source && <span className="ml-1">({r._source})</span>}
                      </p>
                    </div>
                    {reviewStatusFilter === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveReview(r.id)}
                          disabled={reviewActionLoading === r.id}
                          className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
                        >
                          {reviewActionLoading === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleRejectReview(r.id)}
                          disabled={reviewActionLoading === r.id}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {reviewPagination.pages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button
                    onClick={() => loadReviews(reviewPage - 1)}
                    disabled={reviewPage <= 1}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-gray-400">
                    Página {reviewPage} de {reviewPagination.pages}
                  </span>
                  <button
                    onClick={() => loadReviews(reviewPage + 1)}
                    disabled={reviewPage >= reviewPagination.pages}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Vendedores */}
      {subTab === 'vendedores' && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar por nome ou e-mail..."
                value={sellerSearch}
                onChange={(e) => setSellerSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadSellers(1)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500"
              />
            </div>
            <button
              onClick={() => loadSellers(1)}
              className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white"
            >
              Buscar
            </button>
          </div>
          {sellersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-bitcoin" />
            </div>
          ) : sellers.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Nenhum vendedor encontrado.</p>
          ) : (
            <div className="space-y-4">
              {sellers.map((s: any) => (
                <div
                  key={s.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 rounded-2xl p-4 border border-gray-700/50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">{s.name}</p>
                      <p className="text-sm text-gray-400">{s.email}</p>
                      <div className="flex gap-4 mt-2 text-sm text-gray-500">
                        <span>{s._count?.sellerProducts ?? 0} produtos</span>
                        <span>{s._count?.sellerOrdersV2 ?? 0} vendas</span>
                        <span className="text-bitcoin">
                          {(s.sellerBalance?.availableBalance ?? 0).toFixed(2)} DEPIX disponível
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500">
                      Cadastro: {new Date(s.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
              ))}
              {sellerPagination.pages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button
                    onClick={() => loadSellers(sellerPage - 1)}
                    disabled={sellerPage <= 1}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-gray-400">
                    Página {sellerPage} de {sellerPagination.pages}
                  </span>
                  <button
                    onClick={() => loadSellers(sellerPage + 1)}
                    disabled={sellerPage >= sellerPagination.pages}
                    className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Saques de vendedores */}
      {subTab === 'saques' && (
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
            {(['PENDING', 'APPROVED', 'ALL'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setWithdrawalStatusFilter(s); loadSellerWithdrawals(1); }}
                className={`px-4 py-2 rounded-xl font-medium transition ${
                  withdrawalStatusFilter === s
                    ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {s === 'PENDING' ? 'Pendentes' : s === 'APPROVED' ? 'Aprovados' : 'Todos'}
              </button>
            ))}
          </div>
          <div className="space-y-2 mb-4">
            <label className="block text-gray-400 text-sm">Observações / TXID (opcional)</label>
            <input
              type="text"
              value={withdrawalNotes}
              onChange={(e) => setWithdrawalNotes(e.target.value)}
              placeholder="Notas administrativas..."
              className="w-full max-w-md px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white"
            />
            <input
              type="text"
              value={withdrawalTxid}
              onChange={(e) => setWithdrawalTxid(e.target.value)}
              placeholder="TXID (ao aprovar transferência)"
              className="w-full max-w-md px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white"
            />
          </div>
          {withdrawalsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-bitcoin" /></div>
          ) : sellerWithdrawals.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">Nenhum saque encontrado.</p>
          ) : (
            <div className="space-y-4">
              {sellerWithdrawals.map((w: any) => (
                <div key={w.id} className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700/50 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <p className="font-semibold text-white">{w.seller?.name}</p>
                    <p className="text-sm text-gray-400">{w.seller?.email}</p>
                    <p className="text-bitcoin font-bold mt-1">{Number(w.amount).toFixed(2)} DEPIX</p>
                    <p className="text-xs text-gray-500 mt-1">Carteira: {w.liquidWallet?.slice(0, 20)}...</p>
                    <p className="text-xs text-gray-500">{new Date(w.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  {withdrawalStatusFilter === 'PENDING' && w.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleProcessWithdrawal(w.id, 'approve')}
                        disabled={withdrawalActionLoading === w.id}
                        className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {withdrawalActionLoading === w.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aprovar'}
                      </button>
                      <button
                        onClick={() => handleProcessWithdrawal(w.id, 'reject')}
                        disabled={withdrawalActionLoading === w.id}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {withdrawalPagination.pages > 1 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button onClick={() => loadSellerWithdrawals(withdrawalPage - 1)} disabled={withdrawalPage <= 1} className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white">Anterior</button>
                  <span className="px-4 py-2 text-gray-400">Página {withdrawalPage} de {withdrawalPagination.pages}</span>
                  <button onClick={() => loadSellerWithdrawals(withdrawalPage + 1)} disabled={withdrawalPage >= withdrawalPagination.pages} className="px-4 py-2 rounded-xl bg-gray-700 disabled:opacity-50 text-white">Próxima</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cupons globais */}
      {subTab === 'cupons' && (
        <div className="space-y-4">
          {globalCouponsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-bitcoin" /></div>
          ) : (
            <div className="space-y-4">
              {globalCoupons.map((c: any) => (
                <div key={c.id} className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700/50 flex flex-wrap justify-between items-center">
                  <div>
                    <p className="font-mono font-bold text-white">{c.code}</p>
                    <p className="text-sm text-gray-400">
                      {c.discountPercent ? `${(c.discountPercent * 100).toFixed(1)}%` : ''}
                      {c.discountFixed ? ` R$ ${c.discountFixed.toFixed(2)}` : ''} | Usos: {c.usageCount}
                      {c.maxUsage != null ? `/${c.maxUsage}` : ''} | {c.isActive ? 'Ativo' : 'Inativo'}
                    </p>
                    {c.expiresAt && <p className="text-xs text-gray-500">Expira: {new Date(c.expiresAt).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
              ))}
              {globalCoupons.length === 0 && <p className="text-gray-400 py-8 text-center">Nenhum cupom global. Use a API para criar.</p>}
            </div>
          )}
        </div>
      )}

      {/* Modal Solicitar Ajustes */}
      {adjustmentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-2">Solicitar ajustes</h3>
            <p className="text-gray-400 text-sm mb-4 truncate">{adjustmentModal.title}</p>
            <label className="block text-gray-400 text-sm mb-1">Descreva os ajustes necessários *</label>
            <textarea
              value={adjustmentNotes}
              onChange={(e) => setAdjustmentNotes(e.target.value)}
              placeholder="Ex: Corrija a descrição do produto, adicione mais detalhes..."
              rows={4}
              className="w-full px-4 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRequestAdjustment}
                disabled={adjustmentLoading || !adjustmentNotes.trim()}
                className="flex-1 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {adjustmentLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enviar'}
              </button>
              <button
                onClick={() => {
                  setAdjustmentModal(null);
                  setAdjustmentNotes('');
                }}
                className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Conteúdo */}
      {contentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-2">Conteúdo do produto</h3>
            <p className="text-gray-400 text-sm mb-4 truncate">{contentModal.title}</p>
            <div className="space-y-4">
              {contentModal.deliveryType === 'FILE' && (
                <div>
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Arquivos ({contentModal.files?.length ?? 0})
                  </h4>
                  {contentModal.files && contentModal.files.length > 0 ? (
                    <div className="space-y-2">
                      {contentModal.files.map((f: { id: string; originalFilename?: string }) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={async () => {
                            try {
                              const { data } = await api.get(
                                `/marketplace/admin/product/${contentModal.productId}/file/${f.id}`,
                                { responseType: 'blob' }
                              );
                              const url = URL.createObjectURL(data);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = f.originalFilename || 'arquivo';
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (err: any) {
                              alert(err.response?.data?.error || 'Erro ao baixar');
                            }
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-900/50 border border-gray-700 hover:border-bitcoin/50 transition text-left"
                        >
                          <span className="text-gray-300 truncate">{f.originalFilename}</span>
                          <Download className="w-4 h-4 text-bitcoin flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">Nenhum arquivo cadastrado</p>
                  )}
                </div>
              )}
              {contentModal.deliveryType === 'LINK' && (
                <div>
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Link de entrega
                  </h4>
                  {contentModal.deliveryLink ? (
                    <a
                      href={contentModal.deliveryLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bitcoin underline break-all"
                    >
                      {contentModal.deliveryLink}
                    </a>
                  ) : (
                    <p className="text-gray-500 text-sm">Link não informado</p>
                  )}
                </div>
              )}
              {contentModal.deliveryType === 'CODE' && (
                <div>
                  <h4 className="font-medium text-white mb-2 flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Códigos
                  </h4>
                  <p className="text-gray-400 text-sm">
                    Total: {contentModal.codesTotal} · Disponíveis: {contentModal.codesAvailable}
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={() => setContentModal(null)}
              className="mt-6 w-full px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal Rejeitar */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-white mb-2">Rejeitar produto</h3>
            <p className="text-gray-400 text-sm mb-4 truncate">{rejectModal.title}</p>
            <label className="block text-gray-400 text-sm mb-1">Motivo (opcional)</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Informe o motivo da rejeição para o vendedor..."
              rows={3}
              className="w-full px-4 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRejectProduct}
                disabled={productActionLoading === rejectModal.productId}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium disabled:opacity-50"
              >
                {productActionLoading === rejectModal.productId ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Rejeitar'
                )}
              </button>
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
