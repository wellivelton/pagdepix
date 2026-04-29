/**
 * Dashboard Executivo do Admin – Visão geral, KPIs, drill-down, contabilidade e exportação.
 */

import { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Percent,
  PiggyBank,
  Loader2,
  FileDown,
  Wallet,
  FileText,
  Smartphone,
  Zap,
  X,
  ChevronRight,
  Building2,
  Users,
  Star,
  ClipboardList,
  Package,
} from 'lucide-react';
import api from '../services/api';

type Period = 'today' | 'week' | 'month' | 'year';

interface DashboardData {
  period: { start: string; end: string };
  kpis: {
    volumeTotal: number;
    receitaTotal: number;
    custoTotal: number;
    descontosTotal: number;
    comissoesTotal: number;
    lucroLiquido: number;
    countTransacoes: number;
  };
  porOperacao: {
    boletos: { volume: number; receita: number; custo: number; descontos: number; comissoes: number; lucro: number; count: number };
    recargas: { volume: number; receita: number; custo: number; comissoes: number; lucro: number; count: number };
    pixDepix: { volume: number; receita: number; custo: number; lucro: number; count: number };
  };
  monthlyRevenue: Array<{
    month: string;
    receita: number;
    volume: number;
    lucro: number;
    transacoes: number;
  }>;
}

interface AccountingData {
  period: { start: string; end: string };
  contabilidade: {
    volumeBruto: number;
    receitaBrutaTaxas: number;
    descontos: number;
    custosOperacionais: number;
    comissoesAfiliados: number;
    receitaLiquidaReal: number;
  };
}

interface Transaction {
  id: string;
  tipo: 'boleto' | 'recarga' | 'pixDepix';
  valorBruto: number;
  taxa: number;
  custo: number;
  lucro: number;
  createdAt: string;
  user?: { id: string; name: string; email: string; telegram: string };
  merchant?: { id: string; name: string };
  affiliate?: { id: string; couponCode: string; userName: string };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1);
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function SimpleBarChart({ data, valueKey }: { data: DashboardData['monthlyRevenue']; valueKey: 'receita' | 'lucro' }) {
  const values = data.map((d) => d[valueKey]);
  const maxVal = Math.max(...values, 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-36">
        {data.map((item, idx) => {
          const height = maxVal > 0 ? (item[valueKey] / maxVal) * 100 : 0;
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t relative group ${
                  valueKey === 'receita' ? 'bg-bitcoin/60' : 'bg-green-500/60'
                }`}
                style={{ height: `${Math.max(height, 2)}%` }}
              >
                {item[valueKey] > 0 && (
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    {formatCurrency(item[valueKey])}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-gray-400 transform -rotate-45 origin-top-left whitespace-nowrap">
                {formatMonth(item.month)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exportToCSV(data: DashboardData, accounting?: AccountingData) {
  const lines: string[] = [];
  lines.push('Painel Admin - Exportação');
  lines.push(`Período: ${data.period.start} a ${data.period.end}`);
  lines.push('');
  lines.push('KPIs;Valor');
  lines.push(`Volume Total;${data.kpis.volumeTotal.toFixed(2)}`);
  lines.push(`Receita Total;${data.kpis.receitaTotal.toFixed(2)}`);
  lines.push(`Custo Total;${data.kpis.custoTotal.toFixed(2)}`);
  lines.push(`Descontos;${data.kpis.descontosTotal.toFixed(2)}`);
  lines.push(`Comissões;${data.kpis.comissoesTotal.toFixed(2)}`);
  lines.push(`Lucro Líquido;${data.kpis.lucroLiquido.toFixed(2)}`);
  lines.push(`Transações;${data.kpis.countTransacoes}`);
  if (accounting?.contabilidade) {
    lines.push('');
    lines.push('Contabilidade Detalhada;');
    lines.push(`Volume Bruto;${accounting.contabilidade.volumeBruto.toFixed(2)}`);
    lines.push(`Receita Bruta (Taxas);${accounting.contabilidade.receitaBrutaTaxas.toFixed(2)}`);
    lines.push(`Descontos;${accounting.contabilidade.descontos.toFixed(2)}`);
    lines.push(`Custos Operacionais;${accounting.contabilidade.custosOperacionais.toFixed(2)}`);
    lines.push(`Comissões Afiliados;${accounting.contabilidade.comissoesAfiliados.toFixed(2)}`);
    lines.push(`Receita Líquida Real;${accounting.contabilidade.receitaLiquidaReal.toFixed(2)}`);
  }
  lines.push('');
  lines.push('Por Operação;Volume;Receita;Custo;Lucro;Qtd');
  lines.push(
    `Boletos;${data.porOperacao.boletos.volume};${data.porOperacao.boletos.receita};${data.porOperacao.boletos.custo};${data.porOperacao.boletos.lucro};${data.porOperacao.boletos.count}`
  );
  lines.push(
    `Recargas;${data.porOperacao.recargas.volume};${data.porOperacao.recargas.receita};${data.porOperacao.recargas.custo};${data.porOperacao.recargas.lucro};${data.porOperacao.recargas.count}`
  );
  lines.push(
    `PIX/Depix;${data.porOperacao.pixDepix.volume};${data.porOperacao.pixDepix.receita};${data.porOperacao.pixDepix.custo};${data.porOperacao.pixDepix.lucro};${data.porOperacao.pixDepix.count}`
  );
  lines.push('');
  lines.push('Receita Mensal;Mês;Receita;Volume;Lucro;Transações');
  data.monthlyRevenue.forEach((m) => {
    lines.push(`${m.month};${formatMonth(m.month)};${m.receita};${m.volume};${m.lucro};${m.transacoes}`);
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `admin-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type DrillDownType = 'volume' | 'receita' | 'lucro' | 'transacoes' | 'custo' | 'comissoes' | 'boletos' | 'recargas' | 'pixDepix' | 'all' | null;

function DrillDownModal({
  open,
  onClose,
  title,
  operation,
  period,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  operation: 'boletos' | 'recargas' | 'pixDepix' | 'all';
  period: Period;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setPage(1);
    api
      .get<{ transactions: Transaction[]; pagination: { totalPages: number } }>('/admin/transactions', {
        params: { operation, period, page: 1, limit: 20 },
      })
      .then((res) => {
        setTransactions(res.data.transactions);
        setTotalPages(res.data.pagination?.totalPages || 1);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [open, operation, period]);

  const loadPage = (p: number) => {
    setLoading(true);
    api
      .get<{ transactions: Transaction[] }>('/admin/transactions', {
        params: { operation, period, page: p, limit: 20 },
      })
      .then((res) => {
        setTransactions(res.data.transactions);
        setPage(p);
      })
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  const tipoLabel = (t: Transaction['tipo']) =>
    t === 'boleto' ? 'Boleto' : t === 'recarga' ? 'Recarga' : 'PIX/Depix';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-400 text-center py-12">Nenhuma transação encontrada</p>
          ) : (
            <div className="space-y-3">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-xs">
                      {tipoLabel(t.tipo)}
                    </span>
                    <span className="text-gray-400">
                      {new Date(t.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Bruto</span>
                      <p className="text-white font-medium">{formatCurrency(t.valorBruto)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Taxa</span>
                      <p className="text-bitcoin">{formatCurrency(t.taxa)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Custo</span>
                      <p className="text-orange-400">{formatCurrency(t.custo)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Lucro</span>
                      <p className="text-green-400 font-medium">{formatCurrency(t.lucro)}</p>
                    </div>
                  </div>
                  {(t.user || t.merchant || t.affiliate) && (
                    <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400 space-y-1">
                      {t.user && (
                        <p>
                          <Users className="w-3 h-3 inline mr-1" />
                          {t.user.name} • {t.user.email}
                        </p>
                      )}
                      {t.merchant && (
                        <p>
                          <Building2 className="w-3 h-3 inline mr-1" />
                          {t.merchant.name}
                        </p>
                      )}
                      {t.affiliate && (
                        <p>
                          <Star className="w-3 h-3 inline mr-1" />
                          {t.affiliate.userName} ({t.affiliate.couponCode})
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 p-4 border-t border-gray-700">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, i, arr) => (
                <span key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="text-gray-500">...</span>}
                  <button
                    onClick={() => loadPage(p)}
                    className={`px-3 py-1 rounded text-sm ${
                      p === page ? 'bg-bitcoin text-black' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AdminDashboardProps {
  onNavigateToTab?: (tab: 'commerce' | 'affiliates' | 'users' | 'audit' | 'marketplace') => void;
}

export default function AdminDashboard({ onNavigateToTab }: AdminDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [accounting, setAccounting] = useState<AccountingData | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillDown, setDrillDown] = useState<DrillDownType>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, accRes] = await Promise.all([
        api.get<DashboardData>('/admin/dashboard', { params: { period } }),
        api.get<AccountingData>('/admin/accounting', { params: { period } }).catch(() => ({ data: null })),
      ]);
      setData(dashRes.data);
      setAccounting(accRes.data);
    } catch (err: any) {
      const status = err.response?.status;
      const msg =
        status === 404
          ? 'Rota /admin/dashboard não encontrada (404). Atualize o backend na VPS (adminRoutes + adminController) e reinicie o servidor (ex: pm2 restart).'
          : err.response?.data?.error || err.message || 'Erro ao carregar dashboard';
      setError(msg);
      setData(null);
      setAccounting(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [period]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-medium">{error}</p>
        <button
          onClick={loadDashboard}
          className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-medium"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  const periodLabels: Record<Period, string> = {
    today: 'Hoje',
    week: '7 dias',
    month: 'Este mês',
    year: 'Este ano',
  };

  return (
    <div className="space-y-6">
      <DrillDownModal
        open={drillDown !== null}
        onClose={() => setDrillDown(null)}
        title={
          drillDown === 'boletos' ? 'Transações - Boletos' :
          drillDown === 'recargas' ? 'Transações - Recargas' :
          drillDown === 'pixDepix' ? 'Transações - PIX/Depix' :
          'Todas as transações'
        }
        operation={
          drillDown === 'boletos' ? 'boletos' :
          drillDown === 'recargas' ? 'recargas' :
          drillDown === 'pixDepix' ? 'pixDepix' : 'all'
        }
        period={period}
      />

      {/* Filtros e exportação */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                period === p ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        <button
          onClick={() => exportToCSV(data, accounting || undefined)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm font-medium"
        >
          <FileDown className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* KPIs - clicáveis */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <button
          onClick={() => setDrillDown('all')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Wallet className="w-4 h-4" />
            Volume
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(data.kpis.volumeTotal)}</p>
          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-bitcoin absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={() => setDrillDown('all')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Receita
          </div>
          <p className="text-xl font-bold text-bitcoin">{formatCurrency(data.kpis.receitaTotal)}</p>
          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-bitcoin absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <button
          onClick={() => setDrillDown('all')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <PiggyBank className="w-4 h-4" />
            Lucro
          </div>
          <p className={`text-xl font-bold ${data.kpis.lucroLiquido >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(data.kpis.lucroLiquido)}
          </p>
          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-bitcoin absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Percent className="w-4 h-4" />
            Taxas
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(data.kpis.receitaTotal)}</p>
        </div>
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            Custo
          </div>
          <p className="text-xl font-bold text-orange-400">{formatCurrency(data.kpis.custoTotal)}</p>
        </div>
        <button
          onClick={() => setDrillDown('all')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <Receipt className="w-4 h-4" />
            Transações
          </div>
          <p className="text-xl font-bold text-white">{data.kpis.countTransacoes}</p>
          <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-bitcoin absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
            <FileText className="w-4 h-4" />
            Comissões
          </div>
          <p className="text-xl font-bold text-white">{formatCurrency(data.kpis.comissoesTotal)}</p>
        </div>
      </div>

      {/* Contabilidade detalhada */}
      {accounting?.contabilidade && (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-bitcoin" />
            Contabilidade detalhada
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
            <div>
              <span className="text-gray-400 block">Volume bruto</span>
              <p className="text-white font-medium">{formatCurrency(accounting.contabilidade.volumeBruto)}</p>
            </div>
            <div>
              <span className="text-gray-400 block">Receita de taxas</span>
              <p className="text-bitcoin font-medium">{formatCurrency(accounting.contabilidade.receitaBrutaTaxas)}</p>
            </div>
            <div>
              <span className="text-gray-400 block">Descontos</span>
              <p className="text-orange-400">{formatCurrency(accounting.contabilidade.descontos)}</p>
            </div>
            <div>
              <span className="text-gray-400 block">Custos operacionais</span>
              <p className="text-orange-400">{formatCurrency(accounting.contabilidade.custosOperacionais)}</p>
            </div>
            <div>
              <span className="text-gray-400 block">Comissões afiliados</span>
              <p className="text-gray-400">{formatCurrency(accounting.contabilidade.comissoesAfiliados)}</p>
            </div>
            <div>
              <span className="text-gray-400 block">Receita líquida real</span>
              <p className={`font-bold ${accounting.contabilidade.receitaLiquidaReal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(accounting.contabilidade.receitaLiquidaReal)}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Dados prontos para declaração mensal e auditoria contábil
          </p>
        </div>
      )}

      {/* Gráficos mensais */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-bitcoin" />
            Receita mensal (últimos 12 meses)
          </h3>
          <SimpleBarChart data={data.monthlyRevenue} valueKey="receita" />
        </div>
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-green-400" />
            Lucro mensal (últimos 12 meses)
          </h3>
          <SimpleBarChart data={data.monthlyRevenue} valueKey="lucro" />
        </div>
      </div>

      {/* Por operação - clicáveis */}
      <div className="grid md:grid-cols-3 gap-6">
        <button
          onClick={() => setDrillDown('boletos')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-bitcoin" />
            Boletos
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Volume</span>
              <span className="text-white font-medium">{formatCurrency(data.porOperacao.boletos.volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Receita</span>
              <span className="text-bitcoin font-medium">{formatCurrency(data.porOperacao.boletos.receita)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Custo</span>
              <span className="text-orange-400">{formatCurrency(data.porOperacao.boletos.custo)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Lucro</span>
              <span className="text-green-400 font-medium">{formatCurrency(data.porOperacao.boletos.lucro)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="text-gray-400">Transações</span>
              <span className="text-white font-bold">{data.porOperacao.boletos.count}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-bitcoin opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Clique para ver detalhes <ChevronRight className="w-3 h-3" />
          </p>
        </button>

        <button
          onClick={() => setDrillDown('recargas')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-bitcoin" />
            Recargas
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Volume</span>
              <span className="text-white font-medium">{formatCurrency(data.porOperacao.recargas.volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Receita</span>
              <span className="text-bitcoin font-medium">{formatCurrency(data.porOperacao.recargas.receita)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Lucro</span>
              <span className="text-green-400 font-medium">{formatCurrency(data.porOperacao.recargas.lucro)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="text-gray-400">Transações</span>
              <span className="text-white font-bold">{data.porOperacao.recargas.count}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-bitcoin opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Clique para ver detalhes <ChevronRight className="w-3 h-3" />
          </p>
        </button>

        <button
          onClick={() => setDrillDown('pixDepix')}
          className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 text-left hover:border-bitcoin/50 transition-all group relative"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-bitcoin" />
            PIX / Depix
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Volume</span>
              <span className="text-white font-medium">{formatCurrency(data.porOperacao.pixDepix.volume)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Receita</span>
              <span className="text-bitcoin font-medium">{formatCurrency(data.porOperacao.pixDepix.receita)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Custo</span>
              <span className="text-orange-400">{formatCurrency(data.porOperacao.pixDepix.custo)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Lucro</span>
              <span className="text-green-400 font-medium">{formatCurrency(data.porOperacao.pixDepix.lucro)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-gray-700">
              <span className="text-gray-400">Transações</span>
              <span className="text-white font-bold">{data.porOperacao.pixDepix.count}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-bitcoin opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            Clique para ver detalhes <ChevronRight className="w-3 h-3" />
          </p>
        </button>
      </div>

      {/* Visões por entidade - quick links */}
      {onNavigateToTab && (
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-4">Visões por entidade</h3>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => onNavigateToTab('marketplace')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-left transition-all"
            >
              <Package className="w-6 h-6 text-bitcoin" />
              <div>
                <p className="font-medium text-white">Loja / Marketplace</p>
                <p className="text-xs text-gray-400">Produtos pendentes, vendas e estatísticas</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => onNavigateToTab('commerce')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-left transition-all"
            >
              <Building2 className="w-6 h-6 text-bitcoin" />
              <div>
                <p className="font-medium text-white">Comerciantes</p>
                <p className="text-xs text-gray-400">Volume, taxas e lucro por comerciante</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => onNavigateToTab('affiliates')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-left transition-all"
            >
              <Star className="w-6 h-6 text-bitcoin" />
              <div>
                <p className="font-medium text-white">Afiliados</p>
                <p className="text-xs text-gray-400">Comissões geradas e pendentes</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => onNavigateToTab('users')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-left transition-all"
            >
              <Users className="w-6 h-6 text-bitcoin" />
              <div>
                <p className="font-medium text-white">Usuários finais</p>
                <p className="text-xs text-gray-400">Volume, frequência e ticket médio</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => onNavigateToTab('audit')}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 text-left transition-all"
            >
              <ClipboardList className="w-6 h-6 text-bitcoin" />
              <div>
                <p className="font-medium text-white">Auditoria e logs</p>
                <p className="text-xs text-gray-400">Histórico de eventos e alterações</p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
      )}

      {/* Período exibido */}
      <p className="text-xs text-gray-500 text-center">
        Período: {new Date(data.period.start).toLocaleDateString('pt-BR')} até{' '}
        {new Date(data.period.end).toLocaleDateString('pt-BR')}
      </p>
    </div>
  );
}
