import { useState, useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, AlertCircle, Copy, Check, Wallet, Info, ExternalLink, Download, RefreshCw } from 'lucide-react';
import api from '../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-4 py-3 md:py-3.5 bg-gray-900/50 rounded-lg md:rounded-xl border border-gray-600 text-white placeholder-gray-500 text-sm md:text-base focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all';

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 6000;
const POLL_INTERVAL_MS = 10_000;
const BOT_SUPPORT_LINK = 'https://t.me/PagDepixBot';
const POPUP_HIDE_KEY = 'enviarPix_popup_hide_until';
const POPUP_HIDE_HOURS = 24;

function shouldShowPopup(): boolean {
  try {
    const until = localStorage.getItem(POPUP_HIDE_KEY);
    if (!until) return true;
    return Date.now() > parseInt(until, 10);
  } catch {
    return true;
  }
}

function setPopupHiddenFor24h(): void {
  try {
    localStorage.setItem(POPUP_HIDE_KEY, String(Date.now() + POPUP_HIDE_HOURS * 60 * 60 * 1000));
  } catch {}
}

const PIX_KEY_TYPES = [
  { value: '', label: 'Detectar automaticamente' },
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Chave aleatória' },
];

type OrderStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELED' | 'REFUNDED';

interface Order {
  id: string;
  amountBrl: number;
  depositAddress?: string;
  depositAmount?: number;
  /** Valor exato retornado pela API GeraDePix - usar este, nunca calcular no frontend */
  depositAmountExact?: string;
  expiration?: string;
  status: OrderStatus;
  statusDetail?: string | null;
  receiptUrl?: string | null;
  pixKey?: string;
  pixKeyType?: string | null;
  createdAt?: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Aguardando',
  COMPLETED: 'Concluído',
  FAILED: 'Falhou',
  EXPIRED: 'Expirado',
  CANCELED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

function EnviarPix() {
  const { triggerPushActivation } = useNotifications();
  const [amount, setAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);
  const [popupAccepted, setPopupAccepted] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);
  const navigate = useNavigate();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const downloadReceipt = async (orderId: string) => {
    setDownloadingReceipt(true);
    setError('');
    try {
      const { data, headers } = await api.get(`/depix/send-pix/${orderId}/receipt`, { responseType: 'blob' });
      const contentType = headers?.['content-type'] || '';
      if (contentType.includes('application/json')) {
        const text = await (data as Blob).text();
        const json = JSON.parse(text);
        if (json?.error) setError(json.error || 'Comprovante indisponível.');
        return;
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'comprovante-pix.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao baixar comprovante.');
    } finally {
      setDownloadingReceipt(false);
    }
  };

  const showPopup = shouldShowPopup() && !popupAccepted;

  // Valor exato da API GeraDePix - usar exatamente o retornado, sem arredondar
  const depositAmountExact = order?.depositAmountExact ?? (order?.depositAmount != null ? Number(order.depositAmount).toFixed(8) : '');

  const numAmount = parseFloat(amount.replace(',', '.')) || 0;
  const isValidAmount = numAmount >= MIN_AMOUNT && numAmount <= MAX_AMOUNT;
  const isValidPixKey = pixKey.trim().length >= 5;

  useEffect(() => {
    if (!order || order.status !== 'PENDING') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const poll = () => {
      api.get(`/depix/send-pix/${order.id}`)
        .then(({ data }) => setOrder(data))
        .catch(() => {});
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [order?.id, order?.status]);

  // Trigger push activation when PIX is completed
  useEffect(() => {
    if (order?.status === 'COMPLETED') triggerPushActivation('pix');
  }, [order?.status, triggerPushActivation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!isValidAmount || !isValidPixKey) return;

    setLoading(true);
    try {
      const { data } = await api.post('/depix/send-pix', {
        amount: numAmount,
        pixKey: pixKey.trim(),
        pixKeyType: pixKeyType || undefined,
      });
      setOrder(data.order);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar ordem. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = () => {
    if (!order?.depositAddress) return;
    navigator.clipboard.writeText(order.depositAddress);
    setCopied('address');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCopyAmount = () => {
    if (!depositAmountExact) return;
    navigator.clipboard.writeText(depositAmountExact);
    setCopied('amount');
    setTimeout(() => setCopied(null), 2000);
  };

  const handleNewOrder = () => {
    setOrder(null);
    setAmount('');
    setPixKey('');
    setPixKeyType('');
    setError('');
  };

  const renderOrderContent = () => {
    if (!order) return null;

    if (order.status === 'COMPLETED') {
      return (
        <div className="space-y-4">
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-green-400 font-semibold text-sm mb-1">✓ Pix enviado com sucesso!</p>
            <p className="text-gray-300 text-xs mb-3">
              O valor de R$ {order.amountBrl.toFixed(2)} foi enviado para a chave PIX informada.
            </p>
            {order.receiptUrl ? (
              <button
                type="button"
                disabled={downloadingReceipt}
                onClick={() => downloadReceipt(order.id)}
                className="inline-flex items-center gap-2 py-2.5 px-4 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium rounded-xl border border-bitcoin/50 transition-colors disabled:opacity-50"
              >
                {downloadingReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {downloadingReceipt ? 'Baixando...' : 'Baixar comprovante'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const { data } = await api.get(`/depix/send-pix/${order.id}`, { params: { _refresh: Date.now() } });
                      setOrder(data);
                      if (data?.receiptUrl) await downloadReceipt(order.id);
                    } catch {}
                  }}
                  className="inline-flex items-center gap-2 py-2.5 px-4 bg-gray-600/50 hover:bg-gray-600 text-gray-300 font-medium rounded-xl border border-gray-500 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Buscar comprovante
                </button>
                <p className="text-amber-400/90 text-xs mt-2">Se o comprovante não aparecer, tente novamente em instantes ou verifique no app da GeraDePix.</p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={handleNewOrder}
            className="w-full py-3 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-semibold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30"
          >
            Fazer nova ordem
          </button>
        </div>
      );
    }

    if (['FAILED', 'EXPIRED', 'CANCELED', 'REFUNDED'].includes(order.status)) {
      return (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${
            order.status === 'FAILED' ? 'bg-red-500/10 border-red-500/30' :
            order.status === 'EXPIRED' ? 'bg-amber-500/10 border-amber-500/30' :
            'bg-gray-500/10 border-gray-500/30'
          }`}>
            <p className={`font-semibold text-sm mb-1 ${
              order.status === 'FAILED' ? 'text-red-400' :
              order.status === 'EXPIRED' ? 'text-amber-400' : 'text-gray-400'
            }`}>
              {order.status === 'FAILED' && 'Falha no processamento'}
              {order.status === 'EXPIRED' && 'Ordem expirada'}
              {order.status === 'CANCELED' && 'Saque cancelado'}
              {order.status === 'REFUNDED' && 'Depix reembolsado'}
            </p>
            <p className="text-gray-300 text-xs">
              {order.statusDetail || STATUS_LABELS[order.status]}
            </p>
          </div>
          <button
            type="button"
            onClick={handleNewOrder}
            className="w-full py-3 border border-gray-600 text-gray-400 hover:border-bitcoin hover:text-bitcoin rounded-xl font-medium transition-all"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-amber-400 font-medium text-sm mb-1">Aguardando confirmação na rede</p>
          <p className="text-gray-300 text-xs flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            Envie o Depix e aguarde. O Pix será enviado automaticamente assim que a transação for confirmada.
          </p>
        </div>

        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-green-400 font-medium text-sm mb-1">Ordem criada com sucesso!</p>
          <p className="text-gray-300 text-xs">
            Envie exatamente <strong className="text-white">{depositAmountExact} DePix</strong> para o endereço abaixo.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Valor em DePix a enviar</label>
          <div className="flex items-center justify-between gap-2 p-3 bg-gray-900/50 rounded-lg border border-gray-600">
            <span className="text-xl font-bold text-bitcoin font-mono">{depositAmountExact} DPX</span>
            <span className="text-gray-500 text-sm">≈ R$ {order.amountBrl.toFixed(2)}</span>
            <button
              type="button"
              onClick={handleCopyAmount}
              className={`flex-shrink-0 px-3 py-2 rounded-lg border transition-all ${focusRing} ${
                copied === 'amount' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-gray-600 text-gray-400 hover:border-bitcoin hover:text-bitcoin'
              }`}
            >
              {copied === 'amount' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Endereço (Liquid Network)</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={order.depositAddress || ''}
              className={`${inputClass} font-mono text-xs`}
            />
            <button
              type="button"
              onClick={handleCopyAddress}
              className={`flex-shrink-0 px-4 py-3 rounded-xl border transition-all ${focusRing} ${
                copied === 'address' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'border-gray-600 text-gray-400 hover:border-bitcoin hover:text-bitcoin'
              }`}
            >
              {copied === 'address' ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {order.expiration && (
          <p className="text-gray-500 text-xs">
            Expira em: {new Date(order.expiration).toLocaleString('pt-BR')}
          </p>
        )}

        <button
          type="button"
          onClick={handleNewOrder}
          className="w-full py-3 border border-gray-600 text-gray-400 hover:border-bitcoin hover:text-bitcoin rounded-xl font-medium transition-all"
        >
          Cancelar e fazer nova ordem
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Popup de aviso obrigatório */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Atenção: Regras importantes
            </h2>
            <div className="space-y-3 text-gray-300 text-sm mb-6">
              <p>Para evitar problemas com seu envio, siga <strong className="text-white">exatamente</strong> estas regras:</p>
              <ul className="list-disc list-inside space-y-1.5 ml-1">
                <li>Insira uma <strong className="text-white">chave Pix válida</strong></li>
                <li>Envie o DePix <strong className="text-white">exatamente</strong> para o endereço exibido na tela</li>
                <li>Envie <strong className="text-white">exatamente</strong> o valor mostrado (copie usando o botão para evitar erros de digitação)</li>
              </ul>
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg mt-4">
                <p className="text-red-300 text-xs font-medium">
                  ⚠️ Se você enviar um valor incorreto ou usar dados errados, o envio do Pix ficará travado e será necessário contato manual com o suporte, podendo levar até 48 horas para resolução.
                </p>
              </div>
            </div>
            <div className="space-y-3 mb-4">
              <label className="flex items-center gap-2 cursor-pointer text-gray-400 text-sm">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-bitcoin focus:ring-bitcoin"
                />
                Não mostrar novamente por 24 horas
              </label>
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setPopupAccepted(true);
                  if (dontShowAgain) setPopupHiddenFor24h();
                }}
                className={`w-full py-3 rounded-xl font-semibold ${focusRing} bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/30`}
              >
                1️⃣ Entendi e continuar
              </button>
              <a
                href={BOT_SUPPORT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setPopupAccepted(true);
                  if (dontShowAgain) setPopupHiddenFor24h();
                }}
                className="w-full py-3 rounded-xl font-semibold border border-gray-600 text-gray-300 hover:border-bitcoin hover:text-bitcoin transition-all text-center"
              >
                2️⃣ Fazer envio com atendente humano
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl p-6 border border-gray-700/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-bitcoin/10 rounded-lg">
            <Send className="w-6 h-6 text-bitcoin" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Enviar Pix</h1>
            <p className="text-gray-400 text-sm">Converta seu Depix em Pix. Envie para qualquer chave PIX.</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 bg-bitcoin/5 border border-bitcoin/20 rounded-lg mb-6">
          <Info className="w-4 h-4 text-bitcoin flex-shrink-0 mt-0.5" />
          <p className="text-gray-300 text-xs">
            A GeraDePix cobra uma taxa de aproximadamente 1% sobre o valor. O valor em Depix que você deve enviar já inclui essa taxa.
            Você envia Depix da sua carteira Liquid e recebe o Pix na chave informada.
          </p>
        </div>

        {!order ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Valor em reais (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 150,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">
                Mínimo R$ {MIN_AMOUNT.toFixed(2)} · Máximo R$ {MAX_AMOUNT.toFixed(2)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Tipo da chave PIX</label>
              <select value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)} className={inputClass}>
                {PIX_KEY_TYPES.map((opt) => (
                  <option key={opt.value || 'auto'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1.5">Chave PIX</label>
              <input
                type="text"
                placeholder="Ex: 123.456.789-09 ou email@exemplo.com"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isValidAmount || !isValidPixKey}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-base transition-all ${focusRing} ${
                loading || !isValidAmount || !isValidPixKey
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/30'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Gerando endereço...
                </>
              ) : (
                <>
                  <Wallet className="w-5 h-5" />
                  Gerar endereço para enviar Depix
                </>
              )}
            </button>
          </form>
        ) : (
          renderOrderContent()
        )}
      </div>

      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl p-4 md:p-6 border border-gray-700/50">
        <p className="text-gray-400 text-sm mb-2">Histórico de envios de Depix para Pix</p>
        <button
          type="button"
          onClick={() => navigate('/historico')}
          className="text-bitcoin hover:underline text-sm font-medium flex items-center gap-1.5"
        >
          Ver no Histórico <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default EnviarPix;
