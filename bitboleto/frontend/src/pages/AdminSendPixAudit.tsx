/**
 * Auditoria de Enviar PIX (Depix→Pix via GeraDePix)
 * Admin: visibilidade completa e botão de sincronização de status
 */
import { useState, useEffect } from 'react';
import { Send, Loader2, Search, Calendar, Filter, RefreshCw, Download, User } from 'lucide-react';
import api from '../services/api';

interface SendPixOrder {
  id: string;
  amountBrl: number;
  pixKey: string;
  pixKeyType: string | null;
  geradepixWithdrawalId: string | null;
  depositAddress: string | null;
  depositAmount: number | null;
  status: string;
  statusDetail: string | null;
  receiptUrl: string | null;
  receiptStoredPath?: string | null;
  createdAt: string;
  completedAt: string | null;
  expiration: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
    telegram: string;
  };
}

export default function AdminSendPixAudit() {
  const [orders, setOrders] = useState<SendPixOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [detailOrder, setDetailOrder] = useState<SendPixOrder | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const loadOrders = async (p = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: p,
        limit: 50,
      };
      if (statusFilter.trim()) params.status = statusFilter.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userIdFilter.trim()) params.userId = userIdFilter.trim();

      const { data } = await api.get<{
        orders: SendPixOrder[];
        pagination: { page: number; totalPages: number; total: number };
      }>('/admin/send-pix-orders', { params });

      setOrders(data.orders || []);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotal(data.pagination?.total ?? 0);
      setPage(data.pagination?.page ?? p);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(1);
  }, [statusFilter, startDate, endDate, userIdFilter]);

  const downloadReceipt = async (orderId: string) => {
    setDownloadingReceiptId(orderId);
    try {
      const { data, headers } = await api.get(`/admin/send-pix-orders/${orderId}/receipt`, { responseType: 'blob' });
      const contentType = headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await (data as Blob).text();
        const json = JSON.parse(text);
        alert(json?.error || 'Comprovante indisponível');
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comprovante-pix.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao baixar comprovante');
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleSync = async (orderId: string) => {
    setSyncingId(orderId);
    try {
      const { data } = await api.post<{ order: SendPixOrder; message: string }>(
        `/admin/send-pix-orders/${orderId}/sync`
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? (data.order ?? o) : o))
      );
      if (detailOrder?.id === orderId) setDetailOrder(data.order ?? detailOrder);
      loadOrders(page);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao sincronizar');
    } finally {
      setSyncingId(null);
    }
  };

  const statusColor = (s: string) => {
    const m: Record<string, string> = {
      PENDING: 'bg-amber-500/20 text-amber-400',
      COMPLETED: 'bg-green-500/20 text-green-400',
      FAILED: 'bg-red-500/20 text-red-400',
      EXPIRED: 'bg-gray-500/20 text-gray-400',
      CANCELED: 'bg-gray-500/20 text-gray-400',
      REFUNDED: 'bg-blue-500/20 text-blue-400',
    };
    return m[s] || 'bg-gray-600/20 text-gray-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-3 bg-bitcoin/10 rounded-xl">
          <Send className="w-6 h-6 text-bitcoin" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Auditoria Enviar PIX</h2>
          <p className="text-gray-400 text-sm">
            Ordens Depix→Pix via GeraDePix — visibilidade, histórico e sincronização manual
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2 min-w-[140px]">
          <span className="text-gray-400 text-sm">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="COMPLETED">Concluído</option>
            <option value="FAILED">Falhou</option>
            <option value="EXPIRED">Expirado</option>
            <option value="CANCELED">Cancelado</option>
            <option value="REFUNDED">Reembolsado</option>
          </select>
        </div>
        <div className="flex items-center gap-2 min-w-[140px]">
          <Calendar className="w-4 h-4 text-gray-500" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="flex items-center gap-2 min-w-[140px]">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="ID do usuário"
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500"
          />
        </div>
        <button
          onClick={() => loadOrders(1)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bitcoin text-black font-medium text-sm hover:opacity-90"
        >
          <Filter className="w-4 h-4" />
          Aplicar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl border border-gray-700/50 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-gray-400">Nenhuma ordem encontrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700/50">
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Data</th>
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Valor</th>
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Chave PIX</th>
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Status</th>
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Usuário</th>
                  <th className="px-4 py-3 text-gray-400 text-xs font-medium uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {new Date(o.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-white font-medium">
                      R$ {o.amountBrl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-sm font-mono truncate max-w-[140px]">
                      {o.pixKey}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(o.status)}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {o.user?.name || o.user?.email || '—'}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button
                        onClick={() => setDetailOrder(o)}
                        className="px-2 py-1 rounded-lg bg-gray-700 text-gray-300 text-xs hover:bg-gray-600"
                      >
                        Ver
                      </button>
                      {o.status === 'PENDING' && o.geradepixWithdrawalId && (
                        <button
                          onClick={() => handleSync(o.id)}
                          disabled={syncingId === o.id}
                          className="px-2 py-1 rounded-lg bg-bitcoin/20 text-bitcoin text-xs hover:bg-bitcoin/30 disabled:opacity-50 flex items-center gap-1"
                        >
                          {syncingId === o.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                          Sync
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-4 py-3 flex justify-between items-center border-t border-gray-700/50">
            <span className="text-gray-400 text-sm">
              {total} ordem(ns) — Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadOrders(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1 rounded-lg bg-gray-700 text-gray-300 text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => loadOrders(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-lg bg-gray-700 text-gray-300 text-sm disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {detailOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setDetailOrder(null)}
        >
          <div
            className="bg-gray-900 rounded-2xl border border-gray-700 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-white">Detalhe da ordem</h3>
              <button
                onClick={() => setDetailOrder(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p>
                <span className="text-gray-500">ID:</span>{' '}
                <span className="text-gray-300 font-mono">{detailOrder.id}</span>
              </p>
              <p>
                <span className="text-gray-500">Valor:</span>{' '}
                <span className="text-white">R$ {detailOrder.amountBrl.toFixed(2)}</span>
              </p>
              <p>
                <span className="text-gray-500">Chave PIX:</span>{' '}
                <span className="text-gray-300 font-mono">{detailOrder.pixKey}</span>
              </p>
              <p>
                <span className="text-gray-500">Tipo:</span>{' '}
                <span className="text-gray-300">{detailOrder.pixKeyType || '—'}</span>
              </p>
              <p>
                <span className="text-gray-500">Status:</span>{' '}
                <span className={statusColor(detailOrder.status)}>
                  {detailOrder.status}
                </span>
              </p>
              {detailOrder.statusDetail && (
                <p>
                  <span className="text-gray-500">Detalhe:</span>{' '}
                  <span className="text-gray-400">{detailOrder.statusDetail}</span>
                </p>
              )}
              <p>
                <span className="text-gray-500">GeraDePix ID:</span>{' '}
                <span className="text-gray-300 font-mono text-xs">
                  {detailOrder.geradepixWithdrawalId || '—'}
                </span>
              </p>
              <p>
                <span className="text-gray-500">Criado:</span>{' '}
                {new Date(detailOrder.createdAt).toLocaleString('pt-BR')}
              </p>
              {detailOrder.completedAt && (
                <p>
                  <span className="text-gray-500">Concluído:</span>{' '}
                  {new Date(detailOrder.completedAt).toLocaleString('pt-BR')}
                </p>
              )}
              {detailOrder.user && (
                <div className="pt-3 border-t border-gray-700">
                  <p className="text-gray-500 flex items-center gap-1 mb-1">
                    <User className="w-4 h-4" /> Usuário
                  </p>
                  <p className="text-gray-300">{detailOrder.user.name}</p>
                  <p className="text-gray-400 text-xs">{detailOrder.user.email}</p>
                  <p className="text-gray-400 text-xs">{detailOrder.user.telegram}</p>
                </div>
              )}
              {(detailOrder.receiptUrl || detailOrder.receiptStoredPath) && (
                <button
                  type="button"
                  onClick={() => downloadReceipt(detailOrder!.id)}
                  disabled={downloadingReceiptId === detailOrder.id}
                  className="inline-flex items-center gap-1 text-bitcoin text-sm hover:underline disabled:opacity-50"
                >
                  {downloadingReceiptId === detailOrder.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Baixar comprovante
                </button>
              )}
            </div>
            {detailOrder.status === 'PENDING' && detailOrder.geradepixWithdrawalId && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={() => handleSync(detailOrder!.id)}
                  disabled={syncingId === detailOrder.id}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-bitcoin text-black font-medium text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {syncingId === detailOrder.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Sincronizar com GeraDePix
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
