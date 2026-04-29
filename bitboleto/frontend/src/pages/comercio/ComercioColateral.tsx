import { useState, useEffect, useRef } from 'react';
import {
  Shield,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wallet,
  Info,
} from 'lucide-react';
import api from '../../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

type HistoryItem = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  method: string | null;
  status: string;
  orderId: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ComercioColateral() {
  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [collateralBalance, setCollateralBalance] = useState(0);
  const [transactionLimit, setTransactionLimit] = useState(500);
  const [dailyPayerLimit, setDailyPayerLimit] = useState(500);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'PIX' | 'DEPIX'>('PIX');
  const [depositData, setDepositData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState('');

  useEffect(() => {
    loadHistory();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/commerce/collateral/history');
      setCollateralBalance(data.collateralBalance || 0);
      setTransactionLimit(data.transactionLimit || 500);
      setDailyPayerLimit(data.dailyPayerLimit || 500);
      setHistory(data.history || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };

  const simulateNewLimit = (val: string) => {
    const num = parseFloat(val.replace(',', '.'));
    if (isNaN(num) || num <= 0) return 500 + collateralBalance;
    return 500 + collateralBalance + num;
  };

  const handleDeposit = async () => {
    setError('');
    setSuccess('');
    const num = parseFloat(depositAmount.replace(',', '.'));
    if (isNaN(num) || num < 5) {
      setError('Valor minimo para deposito de colateral e R$ 5,00.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/commerce/collateral/deposit', {
        amount: num,
        method: depositMethod,
      });
      setDepositData(data);

      if (depositMethod === 'PIX' && data.orderId) {
        setPolling(true);
        startPolling(data.depositId);
      } else {
        setSuccess('Deposito DePix registrado. Aguarde confirmacao do admin.');
        await loadHistory();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar deposito.');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (depositId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let count = 0;
    pollingRef.current = setInterval(async () => {
      count++;
      if (count > 150) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setPolling(false);
        return;
      }
      try {
        const { data } = await api.get(`/commerce/collateral/deposit/${depositId}/status`);
        if (data.status === 'CONFIRMED') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPolling(false);
          setDepositData(null);
          setDepositAmount('');
          setSuccess(`Colateral confirmado! Novo limite: R$ ${data.newTransactionLimit?.toFixed(2)}`);
          setCollateralBalance(data.newCollateralBalance || 0);
          setTransactionLimit(data.newTransactionLimit || 500);
          setDailyPayerLimit(data.newTransactionLimit || 500);
          await loadHistory();
        }
      } catch { /* ignore */ }
    }, 4000);
  };

  const handleWithdraw = async () => {
    setError('');
    setSuccess('');
    const num = parseFloat(withdrawAmount.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      setError('Informe um valor valido.');
      return;
    }
    if (num > collateralBalance) {
      setError(`Saldo insuficiente. Disponivel: ${formatCurrency(collateralBalance)}`);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/commerce/collateral/withdraw', { amount: num });
      setSuccess(data.message);
      setCollateralBalance(data.newCollateralBalance || 0);
      setTransactionLimit(data.newTransactionLimit || 500);
      setDailyPayerLimit(data.newTransactionLimit || 500);
      setWithdrawAmount('');
      await loadHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao solicitar saque.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      PENDING: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', label: 'Pendente' },
      CONFIRMED: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Confirmado' },
      REJECTED: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Rejeitado' },
      PROCESSED: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Processado' },
    };
    const s = map[status] || { bg: 'bg-gray-500/20', text: 'text-gray-300', label: status };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gradient-to-br from-bitcoin/10 to-orange-500/5 rounded-xl p-4 border border-bitcoin/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-bitcoin" />
            <p className="text-xs text-gray-400">Colateral ativo</p>
          </div>
          <p className="text-2xl font-bold text-bitcoin">{formatCurrency(collateralBalance)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <p className="text-xs text-gray-400">Limite por transacao</p>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(transactionLimit)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-blue-400" />
            <p className="text-xs text-gray-400">Limite pagador/dia</p>
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(dailyPayerLimit)}</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-300 font-medium mb-1">Como funciona o colateral?</p>
            <ul className="text-xs text-gray-400 space-y-0.5">
              <li>- Seu limite base e R$ 500,00 por transacao/pagador</li>
              <li>- Para aumentar, deposite colateral: cada R$ 1 depositado aumenta R$ 1 no limite</li>
              <li>- Ex: R$ 500 de colateral = limite total de R$ 1.000,00</li>
              <li>- O colateral e uma garantia, nao uma taxa - voce pode sacar a qualquer momento</li>
              <li>- Ao sacar, o limite e reduzido imediatamente</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'deposit' as const, label: 'Depositar', icon: ArrowDownCircle },
          { id: 'withdraw' as const, label: 'Sacar', icon: ArrowUpCircle },
          { id: 'history' as const, label: 'Historico', icon: Clock },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); setSuccess(''); setDepositData(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${focusRing} ${
              tab === t.id
                ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-3 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Depositar */}
      {tab === 'deposit' && !depositData && (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Depositar Colateral</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Valor (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ex: 500.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                className={`w-full py-3 px-4 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-sm ${focusRing}`}
              />
              {depositAmount && parseFloat(depositAmount.replace(',', '.')) > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Novo limite estimado: <span className="text-bitcoin font-bold">{formatCurrency(simulateNewLimit(depositAmount))}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Metodo de deposito</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDepositMethod('PIX')}
                  className={`py-3 rounded-xl border-2 font-medium text-sm transition-all ${focusRing} ${
                    depositMethod === 'PIX'
                      ? 'border-bitcoin bg-bitcoin/10 text-bitcoin'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  Pix (automatico)
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMethod('DEPIX')}
                  className={`py-3 rounded-xl border-2 font-medium text-sm transition-all ${focusRing} ${
                    depositMethod === 'DEPIX'
                      ? 'border-bitcoin bg-bitcoin/10 text-bitcoin'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  DePix (manual)
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {depositMethod === 'PIX'
                  ? 'Via Pix: confirmacao automatica apos pagamento.'
                  : 'Via DePix: envie para a carteira do admin. Confirmacao manual.'}
              </p>
            </div>

            <button
              onClick={handleDeposit}
              disabled={loading}
              className={`w-full py-3 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold hover:shadow-lg hover:shadow-bitcoin/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 ${focusRing}`}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowDownCircle className="w-5 h-5" />}
              {loading ? 'Gerando...' : 'Depositar Colateral'}
            </button>
          </div>
        </div>
      )}

      {/* QR Code / DePix wallet */}
      {tab === 'deposit' && depositData && (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6">
          {depositData.method === 'DEPIX' ? (
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-4">Envie DePix para:</h3>
              <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/30 mb-4">
                <p className="text-white text-xs break-all font-mono">{depositData.walletAddress}</p>
              </div>
              <button
                onClick={() => copyToClipboard(depositData.walletAddress)}
                className={`px-4 py-2 rounded-xl border border-gray-600 text-sm text-gray-300 hover:border-bitcoin transition-all ${focusRing}`}
              >
                {copied ? <Check className="w-4 h-4 inline mr-1 text-green-400" /> : <Copy className="w-4 h-4 inline mr-1" />}
                {copied ? 'Copiado!' : 'Copiar endereco'}
              </button>
              <p className="text-gray-400 text-xs mt-4">Valor: <span className="text-bitcoin font-bold">R$ {depositData.amount}</span></p>
              <p className="text-gray-500 text-xs mt-1">O admin confirmara manualmente apos receber o DePix.</p>
            </div>
          ) : (
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-4">Pague via Pix</h3>
              {depositData.qr_image_url && (
                <img src={depositData.qr_image_url} alt="QR Code" className="w-56 h-56 mx-auto rounded-xl bg-white p-2 mb-4" />
              )}
              {depositData.qr_copy_paste && (
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="text"
                    readOnly
                    value={depositData.qr_copy_paste}
                    className="flex-1 py-2 px-3 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-xs truncate"
                  />
                  <button
                    onClick={() => copyToClipboard(depositData.qr_copy_paste)}
                    className={`p-2 rounded-xl border border-gray-600 hover:border-bitcoin transition-all ${focusRing}`}
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              )}
              {polling && (
                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aguardando confirmacao...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sacar */}
      {tab === 'withdraw' && (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-bold text-white mb-2">Sacar Colateral</h3>
          <p className="text-gray-400 text-xs mb-4">
            Saldo disponivel: <span className="text-bitcoin font-bold">{formatCurrency(collateralBalance)}</span>
          </p>

          {collateralBalance <= 0 ? (
            <div className="bg-gray-900/50 rounded-xl p-6 text-center border border-gray-700/30">
              <Shield className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Voce nao possui colateral para sacar.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-500/10 rounded-xl p-3 border border-yellow-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-yellow-300 text-xs">
                    Ao sacar, seu limite sera reduzido imediatamente. O envio do DePix sera processado pelo admin.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Valor do saque (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 100.00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  className={`w-full py-3 px-4 bg-gray-900/50 rounded-xl border border-gray-600 text-white text-sm ${focusRing}`}
                />
                {withdrawAmount && parseFloat(withdrawAmount.replace(',', '.')) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Novo limite: <span className="text-red-400 font-bold">
                      {formatCurrency(Math.max(500, 500 + collateralBalance - parseFloat(withdrawAmount.replace(',', '.'))))}
                    </span>
                  </p>
                )}
              </div>

              <button
                onClick={handleWithdraw}
                disabled={loading}
                className={`w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 ${focusRing}`}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUpCircle className="w-5 h-5" />}
                {loading ? 'Processando...' : 'Solicitar Saque'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historico */}
      {tab === 'history' && (
        <div className="bg-gray-800/50 rounded-2xl border border-gray-700/50 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Historico de Colateral</h3>

          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="w-10 h-10 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma movimentacao de colateral.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="bg-gray-900/50 rounded-xl p-3 border border-gray-700/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {item.type === 'DEPOSIT' ? (
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <ArrowDownCircle className="w-4 h-4 text-green-400" />
                      </div>
                    ) : (
                      <div className="p-2 bg-red-500/10 rounded-lg">
                        <ArrowUpCircle className="w-4 h-4 text-red-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-white">
                        {item.type === 'DEPOSIT' ? 'Deposito' : 'Saque'}
                        {item.method && <span className="text-gray-500 text-xs ml-1">({item.method})</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">{formatDate(item.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${item.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}`}>
                      {item.type === 'DEPOSIT' ? '+' : '-'}{formatCurrency(item.amount)}
                    </p>
                    {statusBadge(item.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
