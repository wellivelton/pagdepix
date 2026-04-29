import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../services/api';
import OrderChat from '../../components/marketplace/OrderChat';
import SellerOrderChat from '../../components/marketplace/SellerOrderChat';
import { Star, XCircle, RotateCcw, AlertTriangle } from 'lucide-react';

function ActionButton({
  icon,
  label,
  variant,
  onClick,
  loading,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  variant: 'danger' | 'warning';
  onClick: (reason: string) => void;
  loading: boolean;
  placeholder: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const handleSubmit = () => {
    const r = reason.trim();
    if (!r) return;
    onClick(r);
    setShowForm(false);
    setReason('');
  };
  const btnClass = variant === 'danger'
    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400';
  return (
    <div>
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition ${btnClass}`}
        >
          {icon}
          {label}
        </button>
      ) : (
        <div className="p-3 rounded-lg bg-gray-900/50 border border-gray-700/50">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 resize-none mb-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition ${btnClass}`}
            >
              {loading ? 'Enviando...' : 'Enviar'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setReason(''); }}
              className="px-4 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewForm({
  productTitle,
  onSubmit,
  loading,
  error,
}: {
  productTitle?: string;
  onSubmit: (rating: number, comment?: string) => void;
  loading: boolean;
  error: string;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  return (
    <div className="mt-3 p-3 rounded-lg bg-gray-900/50 border border-gray-700/50">
      <p className="text-sm text-gray-400 mb-2">Avaliar{productTitle ? ` "${productTitle}"` : ''}</p>
      <div className="flex gap-1 mb-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="p-1 rounded hover:bg-gray-700/50 transition"
          >
            <Star className={`w-5 h-5 ${rating >= n ? 'text-amber-400 fill-amber-400' : 'text-gray-500'}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Comentário (opcional)"
        rows={2}
        maxLength={500}
        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm placeholder-gray-500 resize-none mb-2"
      />
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <button
        type="button"
        disabled={loading || rating < 1}
        onClick={() => onSubmit(rating, comment.trim() || undefined)}
        className="px-4 py-1.5 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin text-sm font-medium disabled:opacity-50 transition"
      >
        {loading ? 'Enviando...' : 'Enviar avaliação'}
      </button>
    </div>
  );
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviewSubmitting, setReviewSubmitting] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserId = user?.id || '';
  const isAdmin = user?.role === 'ADMIN';
  const isBuyer = order?._source === 'legacy' ? order?.buyerId === currentUserId : order?.buyer?.id === currentUserId;
  const isSeller = order?._source === 'legacy' ? order?.sellerId === currentUserId : order?.sellerOrders?.some((so: any) => so.sellerId === currentUserId);

  const refetchOrder = () => {
    if (!orderId) return;
    api.get(`/marketplace/order/${orderId}`).then(({ data }) => setOrder(data)).catch(() => {});
  };

  const submitReview = (params: { orderId?: string; orderItemId?: string; rating: number; comment?: string }) => {
    setReviewError('');
    setReviewSubmitting(params.orderItemId || params.orderId || null);
    api.post('/marketplace/review', params)
      .then(() => refetchOrder())
      .catch((err) => setReviewError(err.response?.data?.error || 'Erro ao enviar avaliação'))
      .finally(() => setReviewSubmitting(null));
  };

  const requestCancel = (marketOrderId: string, reason: string) => {
    setActionError('');
    setActionLoading('cancel');
    api.post('/marketplace/order/cancel', { marketOrderId, reason })
      .then(() => refetchOrder())
      .catch((err) => setActionError(err.response?.data?.error || 'Erro ao solicitar cancelamento'))
      .finally(() => setActionLoading(null));
  };

  const requestReturn = (sellerOrderId: string, reason: string) => {
    setActionError('');
    setActionLoading('return');
    api.post('/marketplace/return', { sellerOrderId, reason })
      .then(() => refetchOrder())
      .catch((err) => setActionError(err.response?.data?.error || 'Erro ao solicitar devolução'))
      .finally(() => setActionLoading(null));
  };

  const openDispute = (params: { orderId?: string; sellerOrderId?: string }, reason: string) => {
    setActionError('');
    setActionLoading('dispute');
    api.post('/marketplace/dispute', { ...params, reason })
      .then(() => refetchOrder())
      .catch((err) => setActionError(err.response?.data?.error || 'Erro ao abrir disputa'))
      .finally(() => setActionLoading(null));
  };

  const respondDispute = (sellerOrderId: string, response: string) => {
    setActionError('');
    setActionLoading(`respond-${sellerOrderId}`);
    api.post('/marketplace/dispute/respond', { sellerOrderId, response })
      .then(() => refetchOrder())
      .catch((err) => setActionError(err.response?.data?.error || 'Erro ao responder disputa'))
      .finally(() => setActionLoading(null));
  };

  useEffect(() => {
    if (!orderId) return;
    api.get(`/marketplace/order/${orderId}`)
      .then(({ data }) => setOrder(data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!loading && !order && <p className="text-gray-400">Pedido não encontrado.</p>}
        {loading && <div className="animate-pulse h-64 bg-gray-800 rounded-xl" />}
      </div>
    );
  }

  // ---- Legacy: MarketplaceOrder ----
  if (order._source === 'legacy') {
    const canDownload = order.paymentStatus === 'paid' && order.downloadLink;
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Link to="/minhas-compras" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6">
          ← Voltar para Minhas Compras
        </Link>
        <h1 className="text-2xl font-bold text-white mb-6">Detalhe do pedido</h1>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 space-y-4">
          <div>
            <p className="text-gray-500 text-sm">Produto</p>
            <p className="text-white font-semibold">{order.product?.title}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Status do pagamento</p>
            <p className={order.paymentStatus === 'paid' ? 'text-green-400' : 'text-yellow-400'}>
              {order.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Valor pago</p>
            <p className="text-bitcoin font-semibold">{Number(order.finalPrice).toFixed(2)} DEPIX</p>
          </div>
          {order.deliveryStatus === 'delivered' && (
            <div>
              <p className="text-gray-500 text-sm">Entrega</p>
              {order.product?.deliveryType === 'CODE' && order.deliveredCode && (
                <p className="text-white font-mono bg-gray-900 p-3 rounded break-all">{order.deliveredCode}</p>
              )}
              {order.product?.deliveryType === 'FILE' && canDownload && (
                <a
                  href={order.downloadLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 px-4 py-2 rounded-lg bg-bitcoin text-black font-semibold"
                >
                  Baixar arquivo
                </a>
              )}
              {order.product?.deliveryType === 'LINK' && order.downloadLink && (
                <a
                  href={order.downloadLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bitcoin underline"
                >
                  Acessar link
                </a>
              )}
            </div>
          )}
        </div>

        {isBuyer && order.paymentStatus === 'paid' && !order.disputeStatus && (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Abrir disputa"
              variant="warning"
              onClick={(reason) => openDispute(order.id, reason)}
              loading={actionLoading === 'dispute'}
              placeholder="Descreva o motivo da disputa"
            />
          </div>
        )}

        {actionError && <p className="mt-2 text-red-400 text-sm">{actionError}</p>}

        {isBuyer && order.paymentStatus === 'paid' && !order.review && (
          <ReviewForm
            productTitle={order.product?.title}
            onSubmit={(rating, comment) => submitReview({ orderId: order.id, rating, comment })}
            loading={reviewSubmitting === order.id}
            error={reviewError}
          />
        )}

        {(isBuyer || isSeller || isAdmin) && (
          <div className="mt-6">
            <OrderChat
              orderId={orderId!}
              currentUserId={currentUserId}
              isBuyer={isBuyer}
              isSeller={isSeller}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </div>
    );
  }

  // ---- MarketOrder: múltiplos SellerOrders ----
  const sellerOrders = order.sellerOrders || [];
  const totalDepix = Number(order.totalInDepix || 0).toFixed(2);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link to="/minhas-compras" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-6">
        ← Voltar para Minhas Compras
      </Link>
      <h1 className="text-2xl font-bold text-white mb-6">Detalhe do pedido</h1>
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 space-y-4">
        <div>
          <p className="text-gray-500 text-sm">Status do pagamento</p>
          <p className={order.paymentStatus === 'paid' ? 'text-green-400' : 'text-yellow-400'}>
            {order.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-sm">Valor total</p>
          <p className="text-bitcoin font-semibold">{totalDepix} DEPIX</p>
        </div>
      </div>

      {isBuyer && order.paymentStatus === 'paid' && !order.cancellationStatus && (
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            icon={<XCircle className="w-4 h-4" />}
            label="Cancelar pedido"
            variant="danger"
            onClick={(reason) => requestCancel(order.id, reason)}
            loading={actionLoading === 'cancel'}
            placeholder="Motivo do cancelamento"
          />
        </div>
      )}
      {actionError && <p className="mt-2 text-red-400 text-sm">{actionError}</p>}

      {sellerOrders.map((so: any) => (
        <div key={so.id} className="mt-6 bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50 bg-gray-900/30">
            <p className="text-white font-medium">Vendedor: {so.seller?.name || '—'}</p>
            <p className="text-xs text-gray-500">Status: {['DELIVERED', 'COMPLETED'].includes(so.status) ? 'Entregue' : 'Em processamento'}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isBuyer && order.paymentStatus === 'paid' && !so.disputeStatus && (
                <ActionButton
                  icon={<AlertTriangle className="w-4 h-4" />}
                  label="Abrir disputa"
                  variant="warning"
                  onClick={(reason) => openDispute({ sellerOrderId: so.id }, reason)}
                  loading={actionLoading === 'dispute'}
                  placeholder="Descreva o motivo da disputa"
                />
              )}
              {isBuyer && order.paymentStatus === 'paid' && so.status === 'COMPLETED' && (
                <ActionButton
                  icon={<RotateCcw className="w-4 h-4" />}
                  label="Solicitar devolução"
                  variant="warning"
                  onClick={(reason) => requestReturn(so.id, reason)}
                  loading={actionLoading === 'return'}
                  placeholder="Motivo da devolução"
                />
              )}
            </div>
          </div>
          {/* Disputa aberta */}
          {so.disputeStatus && (
            <div className="px-4 py-3 border-b border-gray-700/50 bg-amber-500/5">
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-300">
                    Disputa: {so.disputeStatus === 'open' ? 'Em análise' : 'Resolvida'}
                  </p>
                  {so.disputeReason && (
                    <p className="text-xs text-gray-400 mt-0.5">{so.disputeReason}</p>
                  )}
                  {so.disputeSellerResponse && (
                    <div className="mt-2 p-2 rounded bg-gray-900/50 border border-gray-700/40">
                      <p className="text-xs text-gray-500">Resposta do vendedor:</p>
                      <p className="text-xs text-gray-300">{so.disputeSellerResponse}</p>
                    </div>
                  )}
                  {so.disputeAdminNotes && (
                    <div className="mt-2 p-2 rounded bg-blue-900/30 border border-blue-700/40">
                      <p className="text-xs text-gray-500">Decisão do suporte:</p>
                      <p className="text-xs text-gray-300">{so.disputeAdminNotes}</p>
                      <p className="text-xs text-blue-300 mt-0.5">
                        {so.disputeStatus === 'resolved_buyer' && 'Resolvido a favor do comprador'}
                        {so.disputeStatus === 'resolved_seller' && 'Resolvido a favor do vendedor'}
                        {so.disputeStatus === 'resolved_split' && 'Resolvido com divisão'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {/* Vendedor pode responder à disputa */}
              {so.sellerId === currentUserId && so.disputeStatus === 'open' && !so.disputeSellerResponse && (
                <ActionButton
                  icon={<AlertTriangle className="w-4 h-4" />}
                  label="Responder disputa"
                  variant="warning"
                  onClick={(response) => respondDispute(so.id, response)}
                  loading={actionLoading === `respond-${so.id}`}
                  placeholder="Descreva sua resposta à disputa"
                />
              )}
            </div>
          )}
          <div className="p-4 space-y-3">
            {(so.items || []).map((item: any) => (
              <div key={item.id} className="flex justify-between items-start gap-3 border-b border-gray-700/30 pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="text-white font-medium">{item.product?.title}</p>
                  {item.variant && (
                    <p className="text-sm text-gray-400">{item.variant.name || item.variant.sku}</p>
                  )}
                  {order.paymentStatus === 'paid' && so.deliveryStatus === 'delivered' && (
                    <div className="mt-2">
                      {item.product?.deliveryType === 'CODE' && item.deliveredCode && (
                        <p className="text-white font-mono text-sm bg-gray-900 p-2 rounded break-all">{item.deliveredCode}</p>
                      )}
                      {item.product?.deliveryType === 'FILE' && item.downloadLink && (
                        <a
                          href={item.downloadLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block mt-1 px-3 py-1.5 rounded-lg bg-bitcoin text-black text-sm font-semibold"
                        >
                          Baixar
                        </a>
                      )}
                      {item.product?.deliveryType === 'LINK' && item.downloadLink && (
                        <a
                          href={item.downloadLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-bitcoin text-sm underline mt-1 inline-block"
                        >
                          Acessar link
                        </a>
                      )}
                    </div>
                  )}
                  {isBuyer && order.paymentStatus === 'paid' && (so.status === 'DELIVERED' || so.status === 'COMPLETED') && !item.review && (
                    <div className="mt-2">
                      <ReviewForm
                        productTitle={item.product?.title}
                        onSubmit={(rating, comment) => submitReview({ orderItemId: item.id, rating, comment })}
                        loading={reviewSubmitting === item.id}
                        error={reviewError}
                      />
                    </div>
                  )}
                </div>
                <span className="text-bitcoin font-semibold text-sm whitespace-nowrap">
                  {Number(item.totalInDepix || 0).toFixed(2)} DEPIX
                </span>
              </div>
            ))}
          </div>
          {(isBuyer || so.sellerId === currentUserId || isAdmin) && (
            <div className="p-4 border-t border-gray-700/50">
              <SellerOrderChat
                sellerOrderId={so.id}
                sellerName={so.seller?.name}
                currentUserId={currentUserId}
                isBuyer={isBuyer}
                isSeller={so.sellerId === currentUserId}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
