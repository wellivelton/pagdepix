import { useState, useEffect, useCallback, useRef } from 'react';
import {
  QrCode, Copy, Check, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ExternalLink, RefreshCw, FileText, Upload,
} from 'lucide-react';
import api from '../../services/api';

// ========================================
// TIPOS
// ========================================
interface PccItem {
  id: string;
  codigoPix: string;
  valorOriginal: number;
  taxa: number;
  valorTaxa: number;
  totalFinal: number;
  nomeDestinatario: string;
  contatoTelegram?: string;
  contatoEmail?: string;
  contatoWhatsApp?: string;
  cupomUsado?: string;
  paymentCurrency: string;
  walletAddress: string;
  txid?: string;
  comprovante?: string;
  status: string;
  adminNotes?: string;
  exchangeRate?: number;
  cryptoAmount?: string;
  createdAt: string;
  txidSubmittedAt?: string;
  processedAt?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    telegram?: string;
  };
}

type FilterStatus = 'TXID_SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING' | 'ALL';

// ========================================
// HELPERS
// ========================================
function formatBrl(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Aguardando pagamento', className: 'bg-yellow-900/40 text-yellow-400 border-yellow-500/30' },
    TXID_SUBMITTED: { label: 'TXID informado', className: 'bg-blue-900/40 text-blue-400 border-blue-500/30' },
    APPROVED: { label: 'Aprovado', className: 'bg-green-900/40 text-green-400 border-green-500/30' },
    REJECTED: { label: 'Reprovado', className: 'bg-red-900/40 text-red-400 border-red-500/30' },
    EXPIRED: { label: 'Expirado', className: 'bg-gray-700/40 text-gray-400 border-gray-500/30' },
  };
  const style = map[status] || { label: status, className: 'bg-gray-700/40 text-gray-400 border-gray-500/30' };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${style.className}`}>
      {style.label}
    </span>
  );
}

// ========================================
// COMPONENTE PRINCIPAL
// ========================================
export default function AdminPixCopiaCola() {
  const [items, setItems] = useState<PccItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('TXID_SUBMITTED');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [uploadFiles, setUploadFiles] = useState<Record<string, File | null>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const limit = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      const { data } = await api.get(`/admin/pix-copia-cola?${params.toString()}`);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar solicitações.');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleProcess = async (id: string, action: 'APPROVED' | 'REJECTED') => {
    setProcessingId(id);
    try {
      const file = uploadFiles[id];
      if (file) {
        const formData = new FormData();
        formData.append('action', action);
        if (adminNotes[id]) formData.append('adminNotes', adminNotes[id]);
        formData.append('comprovante', file);
        await api.post(`/admin/pix-copia-cola/${id}/process`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post(`/admin/pix-copia-cola/${id}/process`, {
          action,
          adminNotes: adminNotes[id] || undefined,
        });
      }
      setUploadFiles((prev) => { const n = { ...prev }; delete n[id]; return n; });
      await fetchItems();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao processar solicitação.');
    } finally {
      setProcessingId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-green-400" />
            Pix Copia e Cola
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">{total} solicitações encontradas</p>
        </div>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm text-gray-400 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['TXID_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'ALL'] as FilterStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => { setFilterStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              filterStatus === s
                ? 'bg-green-500/20 text-green-400 border-green-500/40'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
            }`}
          >
            {s === 'TXID_SUBMITTED' ? 'TXID Informado' :
             s === 'ALL' ? 'Todos' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-500">Nenhuma solicitação encontrada.</div>
      )}

      {/* Lista */}
      {!loading && items.map((item) => (
        <div key={item.id} className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5 space-y-4">

          {/* Cabeçalho do card */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={item.status} />
                {item.cupomUsado && (
                  <span className="px-2 py-0.5 bg-purple-900/40 text-purple-400 border border-purple-500/30 rounded-full text-xs">
                    Cupom: {item.cupomUsado}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Criado: {formatDate(item.createdAt)}
                {item.txidSubmittedAt && ` • TXID: ${formatDate(item.txidSubmittedAt)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-white">R$ {formatBrl(item.totalFinal)}</p>
              <p className="text-xs text-gray-400">
                {formatBrl(item.valorOriginal)} + taxa R$ {formatBrl(item.valorTaxa)}
              </p>
              {item.cryptoAmount && (
                <p className="text-xs text-bitcoin font-mono">{item.cryptoAmount} {item.paymentCurrency}</p>
              )}
            </div>
          </div>

          {/* Dados financeiros */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-900/40 rounded-xl p-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Valor original</p>
              <p className="text-white font-medium">R$ {formatBrl(item.valorOriginal)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Taxa ({((item.taxa ?? 0.03) * 100).toFixed(1)}%)</p>
              <p className="text-yellow-400 font-medium">R$ {formatBrl(item.valorTaxa)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Lucro bruto</p>
              <p className="text-green-400 font-medium">R$ {formatBrl(Math.max(0, item.valorTaxa - item.valorOriginal * 0.01 - 0.99))}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total recebido</p>
              <p className="text-white font-medium">R$ {formatBrl(item.totalFinal)}</p>
            </div>
          </div>

          {/* Destinatário e contato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs mb-1">Destinatário</p>
              <p className="text-white">{item.nomeDestinatario}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Contato do usuário</p>
              <div className="space-y-0.5">
                {item.contatoTelegram && (
                  <a
                    href={`https://t.me/${item.contatoTelegram.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs"
                  >
                    Telegram: {item.contatoTelegram}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {item.contatoEmail && <p className="text-gray-300 text-xs">Email: {item.contatoEmail}</p>}
                {item.contatoWhatsApp && <p className="text-gray-300 text-xs">WhatsApp: {item.contatoWhatsApp}</p>}
              </div>
            </div>
          </div>

          {/* Usuário */}
          {item.user && (
            <div className="text-sm bg-gray-900/30 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Conta do usuário</p>
              <p className="text-white">{item.user.name}</p>
              <p className="text-gray-400 text-xs">{item.user.email}</p>
              {item.user.telegram && (
                <a
                  href={`https://t.me/${item.user.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-400 text-xs hover:text-blue-300"
                >
                  {item.user.telegram} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Código Pix */}
          <div className="bg-gray-900/40 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-gray-500 text-xs">Código Pix Copia e Cola</p>
              <button
                onClick={() => copyToClipboard(item.codigoPix, `pix-${item.id}`)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {copiedId === `pix-${item.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar
              </button>
            </div>
            <code className="text-gray-300 font-mono text-xs break-all block">{item.codigoPix}</code>
          </div>

          {/* TXID */}
          {item.txid && (
            <div className="bg-gray-900/40 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-gray-500 text-xs">TXID</p>
                <button
                  onClick={() => copyToClipboard(item.txid!, `txid-${item.id}`)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {copiedId === `txid-${item.id}` ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Copiar
                </button>
              </div>
              <code className="text-bitcoin font-mono text-xs break-all block">{item.txid}</code>
            </div>
          )}

          {/* Comprovante */}
          {item.comprovante && (
            <a
              href={item.comprovante}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Ver comprovante do usuário
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Notas admin */}
          {item.adminNotes && (
            <div className="bg-gray-900/30 rounded-xl p-3">
              <p className="text-gray-500 text-xs mb-1">Observações admin</p>
              <p className="text-gray-300 text-sm">{item.adminNotes}</p>
            </div>
          )}

          {/* Ações (apenas para TXID_SUBMITTED) */}
          {item.status === 'TXID_SUBMITTED' && (
            <div className="border-t border-gray-700/50 pt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Comprovante (opcional, para aprovação)</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => { fileInputRefs.current[item.id] = el; }}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setUploadFiles((prev) => ({ ...prev, [item.id]: file }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm text-gray-300 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadFiles[item.id] ? uploadFiles[item.id]!.name : 'Selecionar comprovante'}
                  </button>
                  {uploadFiles[item.id] && (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFiles((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                        if (fileInputRefs.current[item.id]) fileInputRefs.current[item.id]!.value = '';
                      }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Observações (opcional)</label>
                <textarea
                  value={adminNotes[item.id] || ''}
                  onChange={(e) => setAdminNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Motivo da aprovação/reprovação..."
                  rows={2}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-gray-500 text-sm resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleProcess(item.id, 'APPROVED')}
                  disabled={processingId === item.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-xl text-white font-semibold text-sm transition-colors"
                >
                  {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Aprovar
                </button>
                <button
                  onClick={() => handleProcess(item.id, 'REJECTED')}
                  disabled={processingId === item.id}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-xl text-white font-semibold text-sm transition-colors"
                >
                  {processingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Reprovar
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-xl text-sm text-gray-400 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-400">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-xl text-sm text-gray-400 transition-colors"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
