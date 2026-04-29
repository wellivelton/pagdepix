import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Wallet, ArrowDownToLine, History, ChevronLeft, ChevronRight } from 'lucide-react';

export default function SellerBalance() {
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPagination, setTransactionsPagination] = useState({ pages: 1, total: 0 });

  const load = () => {
    api.get('/marketplace/seller/balance')
      .then(({ data }) => {
        setBalance(data);
        setWallet(data?.liquidWallet || '');
      })
      .catch(() => setBalance(null))
      .finally(() => setLoading(false));
  };

  const loadTransactions = (page = 1) => {
    api.get('/marketplace/seller/transactions', { params: { page, limit: 15 } })
      .then(({ data }) => {
        setTransactions(data.transactions || []);
        setTransactionsPagination({
          pages: data.pagination?.pages ?? 1,
          total: data.pagination?.total ?? 0,
        });
        setTransactionsPage(page);
      })
      .catch(() => setTransactions([]));
  };

  useEffect(() => {
    load();
    loadTransactions(1);
  }, []);

  const handleSaveWallet = (e: React.FormEvent) => {
    e.preventDefault();
    setWalletError('');
    setWalletSaving(true);
    api.put('/marketplace/seller/wallet', { liquidWallet: wallet.trim() })
      .then(() => load())
      .catch((err) => setWalletError(err.response?.data?.error || 'Erro ao salvar carteira'))
      .finally(() => setWalletSaving(false));
  };

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawError('');
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 1) {
      setWithdrawError('Valor inválido (mínimo 1 DEPIX)');
      return;
    }
    const w = (wallet || balance?.liquidWallet || '').trim();
    if (!w || w.length < 20) {
      setWithdrawError('Configure a carteira Liquid antes de solicitar saque');
      return;
    }
    setWithdrawLoading(true);
    api.post('/marketplace/seller/withdrawal', { amount: amt, liquidWallet: w })
      .then(() => {
        load();
        setWithdrawAmount('');
      })
      .catch((err) => setWithdrawError(err.response?.data?.error || 'Erro ao solicitar saque'))
      .finally(() => setWithdrawLoading(false));
  };

  const typeLabels: Record<string, string> = {
    SALE_CREDIT: 'Venda creditada',
    WITHDRAWAL: 'Saque',
    ADJUSTMENT: 'Ajuste',
    REFUND: 'Reembolso',
    FEE: 'Taxa',
  };

  if (loading) {
    return (
      <div className="max-w-2xl animate-pulse space-y-4">
        <div className="h-32 bg-gray-800 rounded-xl" />
        <div className="h-48 bg-gray-800 rounded-xl" />
      </div>
    );
  }

  const available = Number(balance?.availableBalance ?? 0);
  const pending = Number(balance?.pendingBalance ?? 0);
  const locked = Number(balance?.lockedBalance ?? 0);
  const totalEarned = Number(balance?.totalEarned ?? 0);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-white flex items-center gap-2">
        <Wallet className="w-5 h-5 text-bitcoin" />
        Saldo e saques
      </h1>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Seu saldo</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold text-bitcoin">{available.toFixed(2)} DEPIX</p>
            <p className="text-xs text-gray-500">Disponível para saque</p>
          </div>
          <div>
            <p className="text-lg text-gray-300">{pending.toFixed(2)} DEPIX</p>
            <p className="text-xs text-gray-500">Pendente de liberação</p>
          </div>
          <div>
            <p className="text-lg text-gray-300">{locked.toFixed(2)} DEPIX</p>
            <p className="text-xs text-gray-500">Bloqueado</p>
          </div>
          <div>
            <p className="text-lg text-gray-300">{totalEarned.toFixed(2)} DEPIX</p>
            <p className="text-xs text-gray-500">Total recebido</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Carteira Liquid (para saques)</h2>
        <form onSubmit={handleSaveWallet} className="space-y-3">
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="Endereço da carteira Liquid"
            className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50"
          />
          {walletError && <p className="text-sm text-red-400">{walletError}</p>}
          <button
            type="submit"
            disabled={walletSaving || wallet.trim().length < 20}
            className="px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium disabled:opacity-50 transition"
          >
            {walletSaving ? 'Salvando...' : 'Salvar Endereço'}
          </button>
        </form>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4" />
          Solicitar saque
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          O saque será enviado para a carteira Liquid configurada acima. Mínimo: 1 DEPIX.
        </p>
        <form onSubmit={handleWithdraw} className="space-y-3">
          <input
            type="number"
            step="0.01"
            min="1"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            placeholder="Valor em DEPIX"
            className="w-full px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder-gray-500 focus:border-bitcoin/50"
          />
          {withdrawError && <p className="text-sm text-red-400">{withdrawError}</p>}
          <button
            type="submit"
            disabled={withdrawLoading || available < 1}
            className="px-4 py-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium disabled:opacity-50 transition"
          >
            {withdrawLoading ? 'Enviando...' : 'Solicitar saque'}
          </button>
        </form>
      </div>

      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <History className="w-4 h-4" />
          Histórico de transações
        </h2>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma transação ainda.</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((t: any) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0"
              >
                <div>
                  <p className="text-sm text-white">{typeLabels[t.type] || t.type}</p>
                  <p className="text-xs text-gray-500">{t.description || new Date(t.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <span className={`font-medium ${t.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.amount >= 0 ? '+' : ''}{t.amount.toFixed(2)} DEPIX
                </span>
              </div>
            ))}
            {transactionsPagination.pages > 1 && (
              <div className="flex justify-center gap-2 pt-4">
                <button
                  onClick={() => loadTransactions(transactionsPage - 1)}
                  disabled={transactionsPage <= 1}
                  className="p-2 rounded-lg bg-gray-700 disabled:opacity-50 text-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 py-1 text-gray-400 text-sm">
                  {transactionsPage} / {transactionsPagination.pages}
                </span>
                <button
                  onClick={() => loadTransactions(transactionsPage + 1)}
                  disabled={transactionsPage >= transactionsPagination.pages}
                  className="p-2 rounded-lg bg-gray-700 disabled:opacity-50 text-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
