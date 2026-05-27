import { useState, useEffect } from 'react';
import {
  History as HistoryIcon,
  Search,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  Hash,
  Loader2,
  Edit,
  Smartphone,
  Send,
  RefreshCw,
  QrCode,
  Copy,
  ArrowRightLeft,
} from 'lucide-react';
import api from '../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-4 py-3 md:py-3.5 bg-gray-900/50 rounded-lg md:rounded-xl border border-gray-600 text-white placeholder-gray-500 text-sm md:text-base focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all';

interface Boleto {
  id: string;
  amount: number;
  fee: number;
  totalAmount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  txid: string | null;
  barcode: string | null;
  pdfUrl?: string | null;
  receiptUrl?: string | null;
  couponUsed: string | null;
  dueDate?: string;
}

interface Recharge {
  id: string;
  operator?: string;
  phoneNumber?: string;
  amount?: number;
  totalAmount?: number;
  status?: string;
  txid?: string | null;
  receiptUrl?: string | null;
  couponUsed?: string | null;
  createdAt?: string;
  paidAt?: string | null;
}

interface SendPixOrder {
  id: string;
  amountBrl: number;
  pixKey?: string;
  pixKeyType?: string | null;
  status: string;
  statusDetail?: string | null;
  receiptUrl?: string | null;
  depositAmount?: number;
  expiration?: string;
  createdAt?: string;
  completedAt?: string | null;
}

interface PixCopiaCola {
  id: string;
  codigoPix: string;
  valorOriginal: number;
  taxa: number;
  valorTaxa: number;
  totalFinal: number;
  nomeDestinatario: string;
  cupomUsado?: string | null;
  paymentCurrency: string;
  txid?: string | null;
  comprovante?: string | null;
  status: string;
  cryptoAmount?: string | null;
  createdAt: string;
  txidSubmittedAt?: string | null;
  processedAt?: string | null;
}

interface SideswapSwap {
  id: string;
  status: string;
  depositAsset: string;
  settleAsset: string;
  depositAmount: string | null;
  settleAmount: string | null;
  depositAddress: string | null;
  depositTxid: string | null;
  settleTxid: string | null;
  errorMessage: string | null;
  refundAddress: string | null;
  refundRequestAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RefundState {
  addr: string;
  loading: boolean;
  sent: boolean;
  error: string;
}

export default function History() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [sendPixOrders, setSendPixOrders] = useState<SendPixOrder[]>([]);
  const [pixCopiaCola, setPixCopiaCola] = useState<PixCopiaCola[]>([]);
  const [sideswapSwaps, setSideswapSwaps] = useState<SideswapSwap[]>([]);
  const [refundStates, setRefundStates] = useState<Record<string, RefundState>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'all' | 'boletos' | 'recargas' | 'envios' | 'pix' | 'swaps'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingBoleto, setEditingBoleto] = useState<Boleto | null>(null);
  const [editingRecharge, setEditingRecharge] = useState<Recharge | null>(null);
  const [editRechargeTxid, setEditRechargeTxid] = useState('');
  const [editForm, setEditForm] = useState({
    barcode: '',
    dueDate: '',
    txid: ''
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null);
  const [receiptUnavailableOrderId, setReceiptUnavailableOrderId] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const downloadSendPixReceipt = async (orderId: string) => {
    setDownloadingReceiptId(orderId);
    setReceiptUnavailableOrderId(null);
    try {
      const { data, headers } = await api.get(`/depix/send-pix/${orderId}/receipt`, { responseType: 'blob' });
      const contentType = headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await (data as Blob).text();
        const json = JSON.parse(text);
        if (json?.error) setReceiptUnavailableOrderId(orderId);
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comprovante-pix.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setReceiptUnavailableOrderId(orderId);
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  useEffect(() => {
    let done = 0;
    const checkDone = () => { done++; if (done === 5) setLoading(false); };
    api.get('/boleto/list')
      .then(({ data }) => setBoletos(data.boletos))
      .catch(() => {})
      .finally(checkDone);
    api.get('/recharge/list')
      .then(({ data }) => setRecharges(data.recharges ?? []))
      .catch(() => {})
      .finally(checkDone);
    api.get('/depix/send-pix', { params: { limit: 100 } })
      .then(({ data }) => setSendPixOrders(data.orders ?? []))
      .catch(() => {})
      .finally(checkDone);
    api.get('/pix-copia-cola', { params: { limit: 100 } })
      .then(({ data }) => setPixCopiaCola(data.items ?? []))
      .catch(() => {})
      .finally(checkDone);
    api.get('/sideswap/swaps')
      .then(({ data }) => setSideswapSwaps(data.swaps ?? []))
      .catch(() => {})
      .finally(checkDone);
  }, []);

  const handleEditClick = (boleto: Boleto) => {
    setEditingBoleto(boleto);
    setEditForm({
      barcode: boleto.barcode || '',
      dueDate: boleto.dueDate 
        ? new Date(boleto.dueDate).toISOString().split('T')[0]
        : '',
      txid: boleto.txid || ''
    });
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editingBoleto) return;
    setEditError('');
    setEditLoading(true);
    try {
      await api.put(`/boleto/${editingBoleto.id}`, {
        barcode: editForm.barcode || undefined,
        dueDate: editForm.dueDate || undefined,
        txid: editForm.txid || undefined,
      });
      const { data } = await api.get('/boleto/list');
      setBoletos(data.boletos);
      setEditingBoleto(null);
      setEditForm({ barcode: '', dueDate: '', txid: '' });
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Erro ao atualizar boleto');
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditRechargeClick = (rec: Recharge) => {
    setEditingRecharge(rec);
    setEditRechargeTxid(rec.txid || '');
    setEditError('');
  };

  const handleSaveRechargeTxid = async () => {
    if (!editingRecharge) return;
    if (editRechargeTxid.trim().length < 32) {
      setEditError('TXID deve ter no mínimo 32 caracteres.');
      return;
    }
    setEditError('');
    setEditLoading(true);
    try {
      await api.put(`/recharge/${editingRecharge.id}/txid`, { txid: editRechargeTxid.trim() });
      const { data } = await api.get('/recharge/list');
      setRecharges(data.recharges ?? []);
      setEditingRecharge(null);
      setEditRechargeTxid('');
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Erro ao registrar TXID');
    } finally {
      setEditLoading(false);
    }
  };

  const handleRefundSubmit = async (swapId: string) => {
    const state = refundStates[swapId];
    if (!state?.addr.trim()) return;
    setRefundStates(prev => ({ ...prev, [swapId]: { ...prev[swapId], loading: true, error: '' } }));
    try {
      await api.post(`/sideswap/refund/${swapId}`, { refundAddress: state.addr.trim() });
      setRefundStates(prev => ({ ...prev, [swapId]: { ...prev[swapId], loading: false, sent: true } }));
      setSideswapSwaps(prev => prev.map(s => s.id === swapId ? { ...s, refundAddress: state.addr.trim() } : s));
    } catch (e: any) {
      setRefundStates(prev => ({ ...prev, [swapId]: { ...prev[swapId], loading: false, error: e?.response?.data?.error || 'Erro ao enviar solicitação.' } }));
    }
  };

  const getRefundState = (swapId: string): RefundState =>
    refundStates[swapId] ?? { addr: '', loading: false, sent: false, error: '' };

  const formatPhone = (phone: string) => {
    const d = (phone || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length !== 11) return phone;
    return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const getStatusConfig = (status: string) => {
    const configs: any = {
      PENDING: {
        icon: Clock,
        label: 'Aguardando',
        color: 'text-yellow-400',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/50'
      },
      PAID: {
        icon: CheckCircle2,
        label: 'Pago',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/50'
      },
      COMPLETED: {
        icon: CheckCircle2,
        label: 'Concluído',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/50'
      },
      PROBLEM: {
        icon: AlertCircle,
        label: 'Problema',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/50'
      },
      FAILED: {
        icon: AlertCircle,
        label: 'Falhou',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/50'
      },
      CANCELLED: {
        icon: XCircle,
        label: 'Cancelado',
        color: 'text-gray-400',
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/50'
      },
      CANCELED: {
        icon: XCircle,
        label: 'Cancelado',
        color: 'text-gray-400',
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/50'
      },
      EXPIRED: {
        icon: XCircle,
        label: 'Expirado',
        color: 'text-gray-400',
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/50'
      },
      REFUNDED: {
        icon: XCircle,
        label: 'Reembolsado',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/50'
      },
      TXID_SUBMITTED: {
        icon: Clock,
        label: 'TXID Enviado',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/50'
      },
      APPROVED: {
        icon: CheckCircle2,
        label: 'Aprovado',
        color: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/50'
      },
      REJECTED: {
        icon: XCircle,
        label: 'Rejeitado',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/50'
      }
    };
    return configs[status] || configs.PENDING;
  };

  const filteredBoletos = boletos.filter(b => {
    if (filter !== 'ALL' && b.status !== filter) return false;
    if (search && !b.barcode?.includes(search) && !b.txid?.includes(search)) return false;
    return true;
  });

  const filteredRecharges = recharges.filter(r => {
    if (filter !== 'ALL' && r.status !== filter) return false;
    if (search && !r.txid?.includes(search) && !r.phoneNumber?.includes(search.replace(/\D/g, ''))) return false;
    return true;
  });

  const filteredSendPix = sendPixOrders.filter(s => {
    if (filter !== 'ALL') {
      const mappedStatus = filter === 'PAID' ? 'COMPLETED' : filter === 'PROBLEM' ? 'FAILED' : filter;
      if (s.status !== mappedStatus) return false;
    }
    if (search && !s.pixKey?.includes(search.replace(/\D/g, '')) && !s.id?.includes(search)) return false;
    return true;
  });

  const filteredPixCopiaCola = pixCopiaCola.filter(p => {
    if (filter !== 'ALL') {
      const mappedStatus = filter === 'PAID' ? 'APPROVED' : filter === 'PROBLEM' ? 'REJECTED' : filter;
      if (p.status !== mappedStatus) return false;
    }
    if (search && !p.txid?.includes(search) && !p.nomeDestinatario?.toLowerCase().includes(search.toLowerCase()) && !p.codigoPix?.includes(search)) return false;
    return true;
  });

  const filteredSideswapSwaps = sideswapSwaps.filter(sw => {
    if (filter !== 'ALL') {
      const mappedStatus = filter === 'PAID' ? 'completed' : filter === 'PROBLEM' ? 'failed' : filter.toLowerCase();
      if (sw.status !== mappedStatus) return false;
    }
    if (search && !sw.depositTxid?.includes(search) && !sw.settleTxid?.includes(search) && !sw.id.includes(search)) return false;
    return true;
  });

  type HistoryItem = { type: 'boleto'; item: Boleto } | { type: 'recharge'; item: Recharge } | { type: 'sendpix'; item: SendPixOrder } | { type: 'pix'; item: PixCopiaCola } | { type: 'swap'; item: SideswapSwap };
  const mergedItems: HistoryItem[] = [
    ...filteredBoletos.map((item): HistoryItem => ({ type: 'boleto', item })),
    ...filteredRecharges.map((item): HistoryItem => ({ type: 'recharge', item })),
    ...filteredSendPix.map((item): HistoryItem => ({ type: 'sendpix', item })),
    ...filteredPixCopiaCola.map((item): HistoryItem => ({ type: 'pix', item })),
    ...filteredSideswapSwaps.map((item): HistoryItem => ({ type: 'swap', item })),
  ].sort((a, b) => {
    const dateA = a.item.createdAt ?? '';
    const dateB = b.item.createdAt ?? '';
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const stats = {
    total: boletos.length + recharges.length + sendPixOrders.length + pixCopiaCola.length + sideswapSwaps.length,
    boletos: boletos.length,
    recharges: recharges.length,
    envios: sendPixOrders.length,
    pix: pixCopiaCola.length,
    swaps: sideswapSwaps.length,
    pending: boletos.filter(b => b.status === 'PENDING').length + recharges.filter(r => r.status === 'PENDING').length + sendPixOrders.filter(s => s.status === 'PENDING').length + pixCopiaCola.filter(p => p.status === 'PENDING' || p.status === 'TXID_SUBMITTED').length + sideswapSwaps.filter(s => s.status === 'pending_deposit' || s.status === 'broadcasting').length,
    paid: boletos.filter(b => b.status === 'PAID').length + recharges.filter(r => r.status === 'PAID').length + sendPixOrders.filter(s => s.status === 'COMPLETED').length + pixCopiaCola.filter(p => p.status === 'APPROVED').length + sideswapSwaps.filter(s => s.status === 'completed').length,
    problem: boletos.filter(b => b.status === 'PROBLEM').length + sendPixOrders.filter(s => s.status === 'FAILED').length + pixCopiaCola.filter(p => p.status === 'REJECTED').length + sideswapSwaps.filter(s => s.status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 md:h-64">
        <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-gray-400 text-xs md:text-sm truncate">Total</p>
              <p className="text-xl font-bold text-white md:text-2xl">{stats.total}</p>
            </div>
            <HistoryIcon className="w-6 h-6 md:w-8 md:h-8 text-gray-400 flex-shrink-0" />
          </div>
        </div>
        <div className="bg-yellow-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-yellow-500/30">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-yellow-400 text-xs md:text-sm">Pendentes</p>
              <p className="text-xl font-bold text-white md:text-2xl">{stats.pending}</p>
            </div>
            <Clock className="w-6 h-6 md:w-8 md:h-8 text-yellow-400 flex-shrink-0" />
          </div>
        </div>
        <div className="bg-green-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-green-500/30">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-green-400 text-xs md:text-sm">Pagos</p>
              <p className="text-xl font-bold text-white md:text-2xl">{stats.paid}</p>
            </div>
            <CheckCircle2 className="w-6 h-6 md:w-8 md:h-8 text-green-400 flex-shrink-0" />
          </div>
        </div>
        <div className="bg-red-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-red-500/30">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-red-400 text-xs md:text-sm">Problemas</p>
              <p className="text-xl font-bold text-white md:text-2xl">{stats.problem}</p>
            </div>
            <AlertCircle className="w-6 h-6 md:w-8 md:h-8 text-red-400 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {(['all', 'boletos', 'recargas', 'envios', 'pix', 'swaps'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${focusRing} ${
                  typeFilter === t ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {t === 'all' ? 'Todos' : t === 'boletos' ? 'Boletos' : t === 'recargas' ? 'Recargas' : t === 'envios' ? 'Enviar Pix' : t === 'pix' ? 'Pix C&C' : 'Swaps'}
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <div className="flex-1 relative min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por código, TXID, chave PIX ou número..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-10 md:pl-11 ${focusRing}`}
              />
            </div>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {['ALL', 'PENDING', 'PAID', 'PROBLEM'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${focusRing} ${
                    filter === f ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {f === 'ALL' ? 'Todos status' : getStatusConfig(f).label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3 md:space-y-4">
        {((typeFilter === 'all' && mergedItems.length === 0) || (typeFilter === 'boletos' && filteredBoletos.length === 0) || (typeFilter === 'recargas' && filteredRecharges.length === 0) || (typeFilter === 'envios' && filteredSendPix.length === 0) || (typeFilter === 'pix' && filteredPixCopiaCola.length === 0) || (typeFilter === 'swaps' && filteredSideswapSwaps.length === 0)) ? (
          <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-8 md:p-12 border border-gray-700/50 text-center">
            <HistoryIcon className="w-12 h-12 md:w-16 md:h-16 text-gray-600 mx-auto mb-3 md:mb-4" />
            <h3 className="text-lg font-bold text-gray-400 mb-2 md:text-xl">
              {typeFilter === 'envios' ? 'Nenhum envio Pix encontrado' : typeFilter === 'recargas' ? 'Nenhuma recarga encontrada' : typeFilter === 'boletos' ? 'Nenhum boleto encontrado' : typeFilter === 'pix' ? 'Nenhum Pix Copia e Cola encontrado' : typeFilter === 'swaps' ? 'Nenhum swap encontrado' : 'Nenhum registro'}
            </h3>
            <p className="text-gray-500 text-sm md:text-base">
              {filter !== 'ALL'
                ? `Nenhum item com status "${getStatusConfig(filter).label}"`
                : typeFilter === 'envios' ? 'Você ainda não fez nenhum envio de Depix para Pix' : typeFilter === 'recargas' ? 'Você ainda não fez nenhuma recarga' : typeFilter === 'boletos' ? 'Você ainda não pagou nenhum boleto' : typeFilter === 'pix' ? 'Você ainda não usou o Pix Copia e Cola' : typeFilter === 'swaps' ? 'Você ainda não realizou nenhum swap' : 'Você ainda não tem boletos, recargas nem envios Pix'}
            </p>
          </div>
        ) : (
          <>
          {(typeFilter === 'all' ? mergedItems : typeFilter === 'boletos' ? filteredBoletos.map((item): HistoryItem => ({ type: 'boleto' as const, item })) : typeFilter === 'recargas' ? filteredRecharges.map((item): HistoryItem => ({ type: 'recharge' as const, item })) : typeFilter === 'envios' ? filteredSendPix.map((item): HistoryItem => ({ type: 'sendpix' as const, item })) : typeFilter === 'swaps' ? filteredSideswapSwaps.map((item): HistoryItem => ({ type: 'swap' as const, item })) : filteredPixCopiaCola.map((item): HistoryItem => ({ type: 'pix' as const, item }))).map((entry) => {
            if (entry.type === 'sendpix') {
              const sp = entry.item;
              const statusConfig = getStatusConfig(sp.status);
              const StatusIcon = statusConfig.icon;
              return (
                <div key={`s-${sp.id}`} className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 hover:border-bitcoin/30 transition-all">
                  <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                    <span className="px-2 py-1 bg-bitcoin/20 text-bitcoin rounded-lg text-xs font-medium flex items-center gap-1">
                      <Send className="w-3 h-3" /> Enviar Pix
                    </span>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl ${statusConfig.bg} border ${statusConfig.border}`}>
                      <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${statusConfig.color}`} />
                      <span className={`font-medium text-xs md:text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Valor</div>
                      <p className="text-lg font-bold text-white md:text-xl">R$ {sp.amountBrl.toFixed(2)}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Chave PIX</div>
                      <p className="text-white font-medium text-sm md:text-base truncate">{sp.pixKey ? `${sp.pixKey.slice(0, 12)}...` : '-'}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Data</div>
                      <p className="text-white text-sm md:text-base">{sp.createdAt ? new Date(sp.createdAt).toLocaleDateString('pt-BR') : '-'}</p>
                    </div>
                  </div>
                  {sp.statusDetail && !['PENDING', 'COMPLETED'].includes(sp.status) && (
                    <p className="mt-2 text-gray-400 text-xs">{sp.statusDetail}</p>
                  )}
                  {sp.status === 'COMPLETED' && (
                    <div className="mt-3 md:mt-4 flex flex-wrap gap-2">
                      {sp.receiptUrl ? (
                        <button
                          type="button"
                          disabled={downloadingReceiptId === sp.id}
                          onClick={() => downloadSendPixReceipt(sp.id)}
                          className={`p-2.5 md:p-3 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg md:rounded-xl text-bitcoin text-xs md:text-sm font-medium flex items-center gap-1.5 ${focusRing} disabled:opacity-50`}
                        >
                          {downloadingReceiptId === sp.id ? <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" /> : <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                          {downloadingReceiptId === sp.id ? 'Baixando...' : 'Baixar comprovante'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={loadingReceiptId === sp.id}
                          onClick={async () => {
                            setLoadingReceiptId(sp.id);
                            setReceiptUnavailableOrderId(null);
                            try {
                              const { data: orderData } = await api.get(`/depix/send-pix/${sp.id}`, { params: { _refresh: Date.now() } });
                              const { data: listData } = await api.get('/depix/send-pix', { params: { limit: 100, _refresh: Date.now() } });
                              setSendPixOrders(listData.orders ?? []);
                              if (orderData?.receiptUrl) {
                                await downloadSendPixReceipt(sp.id);
                              } else {
                                setReceiptUnavailableOrderId(sp.id);
                              }
                            } finally {
                              setLoadingReceiptId(null);
                            }
                          }}
                          className={`p-2.5 md:p-3 bg-gray-600/50 hover:bg-gray-600 rounded-lg md:rounded-xl text-gray-300 text-xs md:text-sm font-medium flex items-center gap-1.5 ${focusRing} disabled:opacity-50`}
                        >
                          {loadingReceiptId === sp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                          {loadingReceiptId === sp.id ? 'Buscando...' : 'Buscar comprovante'}
                        </button>
                      )}
                      {receiptUnavailableOrderId === sp.id && (
                        <p className="text-amber-400/90 text-xs mt-1 w-full">Comprovante não disponível no momento. Tente novamente em instantes ou verifique no app da GeraDePix.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            if (entry.type === 'pix') {
              const pix = entry.item;
              const statusConfig = getStatusConfig(pix.status);
              const StatusIcon = statusConfig.icon;
              return (
                <div key={`pcc-${pix.id}`} className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 hover:border-bitcoin/30 transition-all">
                  <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-medium flex items-center gap-1">
                      <QrCode className="w-3 h-3" /> Pix Copia e Cola
                    </span>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl ${statusConfig.bg} border ${statusConfig.border}`}>
                      <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${statusConfig.color}`} />
                      <span className={`font-medium text-xs md:text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-3">
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Valor Pix</div>
                      <p className="text-lg font-bold text-white md:text-xl">R$ {Number(pix.valorOriginal).toFixed(2)}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Taxa ({(Number(pix.taxa) * 100).toFixed(1)}%)</div>
                      <p className="text-white font-medium text-sm md:text-base">R$ {Number(pix.valorTaxa).toFixed(2)}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Total Pago</div>
                      <p className="text-white font-medium text-sm md:text-base">R$ {Number(pix.totalFinal).toFixed(2)}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Data</div>
                      <p className="text-white text-sm md:text-base">{new Date(pix.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 mb-3">
                    <div className="text-gray-400 text-xs mb-1">Destinatário</div>
                    <p className="text-white text-sm font-medium">{pix.nomeDestinatario}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 mb-3">
                    <div className="text-gray-400 text-xs mb-1.5">Código Pix</div>
                    <div className="flex items-start gap-2">
                      <p className="text-white font-mono text-xs break-all flex-1">{pix.codigoPix.slice(0, 80)}{pix.codigoPix.length > 80 ? '...' : ''}</p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(pix.codigoPix, `pix-${pix.id}`)}
                        className={`flex-shrink-0 p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors ${focusRing}`}
                        title="Copiar código Pix"
                      >
                        {copiedId === `pix-${pix.id}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                  {pix.txid && (
                    <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 mb-3">
                      <div className="text-gray-400 text-xs mb-1.5">TXID</div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-mono text-xs break-all flex-1">{pix.txid}</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(pix.txid!, `txid-${pix.id}`)}
                          className={`flex-shrink-0 p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors ${focusRing}`}
                          title="Copiar TXID"
                        >
                          {copiedId === `txid-${pix.id}` ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {pix.cupomUsado && (
                      <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs">Cupom: {pix.cupomUsado}</span>
                    )}
                    {pix.cryptoAmount && (
                      <span className="px-2.5 py-1 bg-gray-700/50 text-gray-300 rounded-lg text-xs">{pix.cryptoAmount} {pix.paymentCurrency}</span>
                    )}
                    {pix.comprovante && (
                      <button
                        type="button"
                        onClick={() => window.open(pix.comprovante as string, '_blank')}
                        className={`p-2 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg text-bitcoin text-xs font-medium flex items-center gap-1.5 ${focusRing}`}
                      >
                        <Download className="w-3.5 h-3.5" /> Comprovante
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            if (entry.type === 'recharge') {
              const rec = entry.item;
              const statusConfig = getStatusConfig(rec.status || 'PENDING');
              const StatusIcon = statusConfig.icon;
              return (
                <div key={`r-${rec.id}`} className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 hover:border-bitcoin/30 transition-all">
                  <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-lg text-xs font-medium flex items-center gap-1">
                      <Smartphone className="w-3 h-3" /> Recarga
                    </span>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl ${statusConfig.bg} border ${statusConfig.border}`}>
                      <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${statusConfig.color}`} />
                      <span className={`font-medium text-xs md:text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Operadora / Número</div>
                      <p className="text-white font-medium text-sm md:text-base truncate">{rec.operator} — {formatPhone(rec.phoneNumber || '')}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Valor</div>
                      <p className="text-lg font-bold text-white md:text-xl">R$ {rec.totalAmount?.toFixed(2).replace('.', ',')}</p>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs md:text-sm mb-1">TXID</div>
                      <p className="text-white font-mono text-xs md:text-sm truncate">{rec.txid ? rec.txid.substring(0, 16) + '...' : 'Aguardando'}</p>
                    </div>
                  </div>
                  {rec.couponUsed && (
                    <div className="mt-2 md:mt-3">
                      <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs md:text-sm">Cupom: {rec.couponUsed}</span>
                    </div>
                  )}
                  {rec.status === 'PENDING' && (
                    <div className="mt-3 md:mt-4">
                      <button type="button" onClick={() => handleEditRechargeClick(rec)} className={`p-2.5 md:p-3 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-lg md:rounded-xl text-yellow-400 text-xs md:text-sm font-medium flex items-center gap-1.5 ${focusRing}`}>
                        <Edit className="w-3.5 h-3.5 md:w-4 md:h-4" /> Editar TXID
                      </button>
                    </div>
                  )}
                  {rec.status === 'PAID' && rec.receiptUrl && (
                    <div className="mt-3 md:mt-4">
                      <button
                        type="button"
                        onClick={() => window.open(rec.receiptUrl as string, '_blank')}
                        className={`p-2.5 md:p-3 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg md:rounded-xl text-bitcoin text-xs md:text-sm font-medium flex items-center gap-1.5 ${focusRing}`}
                      >
                        <Download className="w-3.5 h-3.5 md:w-4 md:h-4" /> Baixar comprovante
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (entry.type === 'swap') {
              const sw = entry.item;
              const swapStatusMap: Record<string, { label: string; color: string; bg: string; border: string; Icon: typeof CheckCircle2 }> = {
                pending_deposit: { label: 'Aguardando depósito', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/50', Icon: Clock },
                broadcasting:    { label: 'Executando swap',     color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/50',   Icon: RefreshCw },
                completed:       { label: 'Concluído',           color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/50',  Icon: CheckCircle2 },
                failed:          { label: 'Falhou',              color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/50',    Icon: XCircle },
                refunded:        { label: 'Reembolsado',         color: 'text-gray-400',   bg: 'bg-gray-500/10',   border: 'border-gray-500/50',   Icon: CheckCircle2 },
              };
              const sc = swapStatusMap[sw.status] ?? swapStatusMap.pending_deposit;
              const StatusIcon = sc.Icon;
              const isFailed = sw.status === 'failed';
              const rf = getRefundState(sw.id);
              const alreadyRequested = !!sw.refundAddress;
              return (
                <div key={`sw-${sw.id}`} className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 hover:border-bitcoin/30 transition-all">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-medium flex items-center gap-1">
                      <ArrowRightLeft className="w-3 h-3" /> Swap
                    </span>
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${sc.bg} border ${sc.border}`}>
                      <StatusIcon className={`w-4 h-4 ${sc.color}`} />
                      <span className={`font-medium text-xs ${sc.color}`}>{sc.label}</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-auto">{new Date(sw.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                    <div>
                      <p className="text-gray-500 mb-0.5">Enviei</p>
                      <p className="text-white font-semibold">{sw.depositAmount ? `${sw.depositAmount} ${sw.depositAsset}` : sw.depositAsset}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 mb-0.5">Recebi</p>
                      <p className="text-white font-semibold">{sw.settleAmount ? `${sw.settleAmount} ${sw.settleAsset}` : sw.settleAsset}</p>
                    </div>
                    {sw.depositTxid && (
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-0.5">TXID depósito</p>
                        <p className="text-gray-300 font-mono truncate">{sw.depositTxid.slice(0, 20)}…</p>
                      </div>
                    )}
                    {sw.settleTxid && (
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-0.5">TXID swap</p>
                        <p className="text-gray-300 font-mono truncate">{sw.settleTxid.slice(0, 20)}…</p>
                      </div>
                    )}
                  </div>

                  {isFailed && (
                    <div className="mt-2 space-y-2">
                      {sw.errorMessage && (
                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{sw.errorMessage}</p>
                      )}
                      {alreadyRequested || rf.sent ? (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                          <p className="text-xs text-green-400 font-medium">✓ Reembolso solicitado</p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono break-all">{sw.refundAddress || rf.addr}</p>
                        </div>
                      ) : (
                        <div className="bg-gray-900/40 border border-[rgba(214,235,253,0.12)] rounded-lg p-3 space-y-2">
                          <p className="text-xs text-gray-400 font-medium">Solicitar reembolso</p>
                          <input
                            type="text"
                            placeholder="Endereço Liquid (lq1qq...)"
                            value={rf.addr}
                            onChange={e => setRefundStates(prev => ({ ...prev, [sw.id]: { ...getRefundState(sw.id), addr: e.target.value } }))}
                            className="w-full bg-gray-800 border border-[rgba(214,235,253,0.15)] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-bitcoin/40"
                          />
                          {rf.error && <p className="text-xs text-red-400">{rf.error}</p>}
                          <button
                            onClick={() => handleRefundSubmit(sw.id)}
                            disabled={!rf.addr.trim() || rf.loading}
                            className="w-full py-2 rounded-lg text-xs font-semibold transition-colors bg-bitcoin/10 border border-bitcoin/30 text-bitcoin hover:bg-bitcoin/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {rf.loading ? 'Enviando...' : 'Solicitar reembolso'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            const boleto = entry.item;
            const statusConfig = getStatusConfig(boleto.status);
            const StatusIcon = statusConfig.icon;
            return (
              <div
                key={boleto.id}
                className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 hover:border-bitcoin/30 transition-all"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-lg md:rounded-xl ${statusConfig.bg} border ${statusConfig.border} w-fit`}>
                    <StatusIcon className={`w-4 h-4 md:w-5 md:h-5 ${statusConfig.color}`} />
                    <span className={`font-medium text-xs md:text-sm ${statusConfig.color}`}>{statusConfig.label}</span>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 min-w-0">
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-xs md:text-sm mb-1">
                        <DollarSign className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>Valor</span>
                      </div>
                      <p className="text-lg font-bold text-white md:text-xl">R$ {boleto.totalAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-xs md:text-sm mb-1">
                        <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>Data</span>
                      </div>
                      <p className="text-white text-sm md:text-base">{new Date(boleto.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-gray-400 text-xs md:text-sm mb-1">
                        <Hash className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        <span>TXID</span>
                      </div>
                      <p className="text-white font-mono text-xs md:text-sm truncate">{boleto.txid ? boleto.txid.substring(0, 16) + '...' : 'Aguardando'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 md:gap-2">
                    {boleto.status === 'PENDING' && (
                      <button
                        type="button"
                        className={`p-2.5 md:p-3 bg-yellow-500/10 hover:bg-yellow-500/20 rounded-lg md:rounded-xl transition-colors ${focusRing}`}
                        title="Editar boleto"
                        onClick={() => handleEditClick(boleto)}
                      >
                        <Edit className="w-4 h-4 md:w-5 md:h-5 text-yellow-400" />
                      </button>
                    )}
                    {boleto.status === 'PAID' && boleto.receiptUrl && (
                      <button
                        type="button"
                        className={`p-2.5 md:p-3 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg md:rounded-xl transition-colors ${focusRing}`}
                        title="Baixar comprovante"
                        onClick={() => window.open(boleto.receiptUrl as string, '_blank')}
                      >
                        <Download className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 md:mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {boleto.barcode && (
                    <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
                      <div className="text-gray-400 text-xs md:text-sm mb-1">Código de Barras</div>
                      <p className="text-xs text-white break-all font-mono">{boleto.barcode}</p>
                    </div>
                  )}
                  {boleto.pdfUrl && (
                    <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
                      <div className="text-gray-400 text-xs md:text-sm mb-1">PDF do Boleto</div>
                      <button type="button" onClick={() => window.open(boleto.pdfUrl as string, '_blank')} className={`text-bitcoin text-xs md:text-sm hover:underline ${focusRing} rounded`}>
                        Abrir PDF
                      </button>
                    </div>
                  )}
                </div>

                {boleto.couponUsed && (
                  <div className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-gray-700/50">
                    <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
                      <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-lg">🎉 Cupom: {boleto.couponUsed}</span>
                      <span className="text-gray-400">Economia de R$ {boleto.fee.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
        )}
      </div>

      {/* Modal de Edição Boleto */}
      {editingBoleto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 rounded-xl md:rounded-2xl p-6 md:p-8 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-2 md:text-xl">Editar Boleto</h3>
            <p className="text-xs md:text-sm text-gray-400 mb-4 md:mb-5">Você pode editar as informações do boleto enquanto ele estiver pendente.</p>

            <div className="space-y-4 mb-5 md:mb-6">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Código de Barras</label>
                <input
                  type="text"
                  value={editForm.barcode}
                  onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                  className={`${inputClass} ${focusRing}`}
                  placeholder="00000.00000 00000.000000..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Data de Vencimento</label>
                <input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  className={`${inputClass} ${focusRing}`}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">TXID da Transação (64 caracteres hex)</label>
                <input
                  type="text"
                  value={editForm.txid}
                  onChange={(e) => setEditForm({ ...editForm, txid: e.target.value })}
                  className={`${inputClass} font-mono ${focusRing}`}
                  placeholder="a1b2c3d4e5f6..."
                  maxLength={64}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  {editForm.txid.length > 0 && editForm.txid.length !== 64 && (
                    <span className="text-yellow-400">TXID deve ter exatamente 64 caracteres ({editForm.txid.length}/64)</span>
                  )}
                  {editForm.txid.length === 64 && <span className="text-green-400">✓ Formato válido</span>}
                </p>
              </div>
              {editError && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 md:p-4 rounded-lg md:rounded-xl text-sm">{editError}</div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditingBoleto(null); setEditForm({ barcode: '', dueDate: '', txid: '' }); setEditError(''); }}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gray-700 text-gray-200 text-sm font-medium hover:bg-gray-600 ${focusRing}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editLoading || (editForm.txid.length > 0 && editForm.txid.length !== 64)}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/40 disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
              >
                {editLoading ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar TXID da Recarga */}
      {editingRecharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 rounded-xl md:rounded-2xl p-6 md:p-8 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-2 md:text-xl">Registrar TXID da Recarga</h3>
            <p className="text-xs md:text-sm text-gray-400 mb-4 md:mb-5">
              {editingRecharge.operator} — {formatPhone(editingRecharge.phoneNumber || '')}
            </p>
            <div className="mb-5 md:mb-6">
              <label className="block text-sm text-gray-300 mb-2">TXID da transação Depix (mín. 32 caracteres)</label>
              <input
                type="text"
                value={editRechargeTxid}
                onChange={(e) => setEditRechargeTxid(e.target.value)}
                className={`${inputClass} font-mono ${focusRing}`}
                placeholder="a1b2c3d4..."
              />
              {editRechargeTxid.length > 0 && editRechargeTxid.length < 32 && (
                <p className="text-xs text-yellow-400 mt-1.5">Mínimo 32 caracteres ({editRechargeTxid.length}/32)</p>
              )}
            </div>
            {editError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 md:p-4 rounded-lg md:rounded-xl text-sm mb-4">{editError}</div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setEditingRecharge(null); setEditRechargeTxid(''); setEditError(''); }}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gray-700 text-gray-200 text-sm font-medium hover:bg-gray-600 ${focusRing}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRechargeTxid}
                disabled={editLoading || editRechargeTxid.trim().length < 32}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
              >
                {editLoading ? 'Salvando...' : 'Salvar TXID'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
