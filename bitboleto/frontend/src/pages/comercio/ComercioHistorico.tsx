/**
 * Histórico de Pagamentos do Comerciante – Modo Comércio.
 * Filtros, busca, exportação e detalhes de cada transação.
 * Design mobile-first compacto.
 */

import { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Calendar,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Hash,
} from 'lucide-react';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type Payment = {
  id: string;
  orderId: string;
  amount: number;
  linkId: string;
  linkTitle: string;
  linkSlug: string;
  linkAmount: number;
  status: string;
  createdAt: string;
};

type LinkOption = {
  id: string;
  titulo: string;
  slug: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function exportToCSV(payments: Payment[]) {
  const headers = ['Data', 'Link', 'Valor', 'ID do Pedido', 'Status'];
  const rows = payments.map((p) => [
    formatDateOnly(p.createdAt),
    p.linkTitle,
    formatCurrency(p.amount),
    p.orderId,
    p.status === 'depix_sent' ? 'Confirmado' : p.status,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `historico-pagamentos-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function ComercioHistorico() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Filtros
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [search, setSearch] = useState('');

  // Paginação
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/pay` : '';

  // Carregar links disponíveis
  useEffect(() => {
    api.get<{ links: LinkOption[] }>('/commerce/links')
      .then((res) => {
        setLinks(res.data.links || []);
      })
      .catch(() => {
        setLinks([]);
      });
  }, []);

  // Carregar pagamentos
  useEffect(() => {
    loadPayments();
  }, [page, startDate, endDate, selectedLinkId, minAmount, maxAmount, search]);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);

    const params: any = {
      page: page.toString(),
      limit: '20',
    };

    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (selectedLinkId) params.linkId = selectedLinkId;
    if (minAmount) params.minAmount = minAmount;
    if (maxAmount) params.maxAmount = maxAmount;
    if (search.trim()) params.search = search.trim();

    try {
      const res = await api.get<{
        payments: Payment[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>('/commerce/payments/history', { params });

      setPayments(res.data.payments || []);
      setTotalPages(res.data.pagination.totalPages || 1);
      setTotal(res.data.pagination.total || 0);
    } catch (err: any) {
      console.error('[ComercioHistorico] Erro ao carregar:', err);
      setError(err?.response?.data?.error || 'Erro ao carregar histórico');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedLinkId('');
    setMinAmount('');
    setMaxAmount('');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = startDate || endDate || selectedLinkId || minAmount || maxAmount || search.trim();

  if (loading && payments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Barra de busca e filtros */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-lg p-3 border border-gray-700/50">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por link, título ou ID do pedido..."
              className={`w-full pl-8 pr-3 py-2 bg-gray-900/50 rounded-lg border border-gray-700 text-white text-xs placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all ${focusRing}`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border transition-all ${showFilters ? 'bg-bitcoin/20 border-bitcoin text-bitcoin' : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <Filter className="w-4 h-4" />
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="p-2 rounded-lg bg-gray-900/50 border border-gray-700 text-gray-400 hover:border-gray-600 transition-all"
              title="Limpar filtros"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Painel de filtros */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-700/50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Data inicial</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className={`w-full px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700 text-white text-xs focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/20 outline-none ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Data final</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className={`w-full px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700 text-white text-xs focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/20 outline-none ${focusRing}`}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">Link</label>
              <select
                value={selectedLinkId}
                onChange={(e) => {
                  setSelectedLinkId(e.target.value);
                  setPage(1);
                }}
                className={`w-full px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700 text-white text-xs focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/20 outline-none ${focusRing}`}
              >
                <option value="">Todos os links</option>
                {links.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.titulo} ({link.slug})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Valor mínimo</label>
                <input
                  type="number"
                  step="0.01"
                  value={minAmount}
                  onChange={(e) => {
                    setMinAmount(e.target.value);
                    setPage(1);
                  }}
                  placeholder="0,00"
                  className={`w-full px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700 text-white text-xs placeholder-gray-500 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/20 outline-none ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">Valor máximo</label>
                <input
                  type="number"
                  step="0.01"
                  value={maxAmount}
                  onChange={(e) => {
                    setMaxAmount(e.target.value);
                    setPage(1);
                  }}
                  placeholder="0,00"
                  className={`w-full px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700 text-white text-xs placeholder-gray-500 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/20 outline-none ${focusRing}`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra de ações */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {total > 0 ? `${total} pagamento${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}` : 'Nenhum pagamento encontrado'}
        </div>
        {payments.length > 0 && (
          <button
            type="button"
            onClick={() => exportToCSV(payments)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white text-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        )}
      </div>

      {/* Lista de pagamentos */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3">
          {error}
        </div>
      )}

      {!loading && payments.length === 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-lg p-6 border border-gray-700/50 text-center">
          <History className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-xs">Nenhum pagamento encontrado</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-2 text-bitcoin text-xs hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {payments.length > 0 && (
        <div className="space-y-2">
          {payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-gray-800/50 backdrop-blur-xl rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-white truncate">{payment.linkTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(payment.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <Hash className="w-3 h-3" />
                    <span className="font-mono">{payment.orderId}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-bold text-green-400">{formatCurrency(payment.amount)}</p>
                  <button
                    type="button"
                    onClick={() => setSelectedPayment(payment)}
                    className="p-1.5 text-gray-400 hover:text-bitcoin transition-colors"
                    title="Ver detalhes"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-gray-800/50 backdrop-blur-xl rounded-lg p-3 border border-gray-700/50">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>
          <span className="text-xs text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-white text-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Próxima
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Modal de detalhes */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPayment(null)}>
          <div
            className="bg-gray-800 rounded-lg border border-gray-700 max-w-md w-full p-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Detalhes do Pagamento</h3>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Link</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-white">{selectedPayment.linkTitle}</p>
                  <a
                    href={`${baseUrl}/${selectedPayment.linkSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bitcoin hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 mb-1">Valor</p>
                <p className="text-base font-bold text-green-400">{formatCurrency(selectedPayment.amount)}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 mb-1">ID do Pedido</p>
                <p className="text-xs font-mono text-white">{selectedPayment.orderId}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 mb-1">Data e Hora</p>
                <p className="text-xs text-white">{formatDate(selectedPayment.createdAt)}</p>
              </div>

              <div>
                <p className="text-[10px] text-gray-400 mb-1">Status</p>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  <p className="text-xs text-green-400">Pagamento confirmado</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
