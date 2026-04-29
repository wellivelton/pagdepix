import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Calculator,
  Link as LinkIcon,
  ShoppingBag,
  Banknote,
  ExternalLink,
  Users
} from 'lucide-react';
import api from '../services/api';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';
const inputClass = 'w-full px-4 py-3 md:py-3.5 bg-gray-900/50 rounded-lg md:rounded-xl border border-gray-600 text-white placeholder-gray-500 text-sm md:text-base focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none transition-all';

// Regras de taxa (espelho do backend) para calculadora em tempo real
const COST_PERCENTAGE = 0.01;
const COST_FIXED = 0.99;
const TAX_RULES = [
  { minAmount: 20, maxAmount: 49.99, percentage: 0.04, fixedFee: 1.99 },
  { minAmount: 50, maxAmount: 99.99, percentage: 0.03, fixedFee: 1.99 },
  { minAmount: 100, maxAmount: 499.99, percentage: 0.025, fixedFee: 1.99 },
  { minAmount: 500, maxAmount: Infinity, percentage: 0.02, fixedFee: 0.99 },
];
const getTaxRule = (amount: number) =>
  amount >= 20 ? TAX_RULES.find((r) => amount >= r.minAmount && amount <= r.maxAmount) ?? null : null;
const getAffiliateCommissionRate = (rule: { percentage: number }) =>
  Math.max(0, 0.2 * (rule.percentage - COST_PERCENTAGE));
function calcCommissionPreview(amount: number) {
  const rule = getTaxRule(amount);
  if (!rule || amount < 20) return null;
  const fee = Math.ceil((amount * rule.percentage + rule.fixedFee) * 100) / 100;
  const commissionRate = getAffiliateCommissionRate(rule);
  const commission = parseFloat((amount * commissionRate).toFixed(2));
  const cost = amount * COST_PERCENTAGE + COST_FIXED;
  const profit = parseFloat((fee - cost - commission).toFixed(2));
  return { fee, commission, profit, totalAmount: amount + fee };
}

export default function AffiliateEarnings() {
  const [loading, setLoading] = useState(true);
  const [affiliateData, setAffiliateData] = useState<any>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [referralEarnings, setReferralEarnings] = useState<any[]>([]);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [liquidWallet, setLiquidWallet] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [commissionCalcInput, setCommissionCalcInput] = useState('');
  const [marketplaceSlug, setMarketplaceSlug] = useState('');
  const [marketplaceLink, setMarketplaceLink] = useState('');
  const [marketplaceLinkLoading, setMarketplaceLinkLoading] = useState(false);
  const [marketplaceEarnings, setMarketplaceEarnings] = useState<any>(null);
  const commissionPreview = useMemo(() => {
    const amount = parseFloat(commissionCalcInput.replace(',', '.'));
    if (!commissionCalcInput || isNaN(amount)) return null;
    return calcCommissionPreview(amount);
  }, [commissionCalcInput]);

  const user = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isAdmin = user?.role === 'ADMIN';

  const MIN_WITHDRAWAL_DEPIX = 20; // Saque mínimo em DEPIX

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [affiliateRes, withdrawalsRes, earningsRes, paymentsRes, referralRes] = await Promise.all([
        api.get('/affiliate/data'),
        api.get('/withdrawal/list'),
        api.get('/marketplace/affiliate/earnings').catch(() => ({ data: null })),
        api.get('/affiliate/payments').catch(() => ({ data: [] })),
        api.get('/affiliate/referral-earnings', { params: { limit: 50 } }).catch(() => ({ data: { items: [] } })),
      ]);

      setAffiliateData(affiliateRes.data);
      setWithdrawals(withdrawalsRes.data.withdrawals || []);
      setMarketplaceEarnings(earningsRes?.data ?? null);
      setPayments(Array.isArray(paymentsRes.data) ? paymentsRes.data : []);
      setReferralEarnings(referralRes.data?.items ?? []);
      
      // Preencher carteira se já existir
      if (affiliateRes.data.affiliate.liquidWallet) {
        setLiquidWallet(affiliateRes.data.affiliate.liquidWallet);
      }
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setError(err.response?.data?.error || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMarketplaceLink = async () => {
    if (!marketplaceSlug.trim()) return;
    setMarketplaceLinkLoading(true);
    setMarketplaceLink('');
    try {
      const { data } = await api.post('/marketplace/affiliate/link', { productSlug: marketplaceSlug.trim() });
      setMarketplaceLink(data.link || '');
      if (data.link) {
        navigator.clipboard.writeText(data.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err: any) {
      setMarketplaceLink(err.response?.data?.error || 'Erro ao gerar link');
    } finally {
      setMarketplaceLinkLoading(false);
    }
  };

  const handleCopyCoupon = () => {
    if (affiliateData?.coupon?.code) {
      navigator.clipboard.writeText(affiliateData.coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRequestWithdrawal = async () => {
    setError('');
    
    if (!liquidWallet || liquidWallet.trim() === '') {
      setError('Informe o endereço da carteira Liquid');
      return;
    }

    const amount = parseFloat(withdrawalAmount.replace(',', '.'));
    
    if (isNaN(amount) || amount < MIN_WITHDRAWAL_DEPIX) {
      setError(`Valor mínimo para saque é ${MIN_WITHDRAWAL_DEPIX} DEPIX.`);
      return;
    }

    if (amount > affiliateData.affiliate.balance) {
      setError('Saldo insuficiente');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/withdrawal/request', {
        amount,
        liquidWallet: liquidWallet.trim()
      });
      
      alert('Solicitação de saque criada com sucesso! Aguarde a aprovação do admin.');
      setShowWithdrawalModal(false);
      setWithdrawalAmount('');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao solicitar saque');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const base = 'px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1';
    switch (status) {
      case 'PENDING':
        return (<span className={`${base} bg-yellow-500/10 text-yellow-400`}><Clock className="w-3 h-3" /> Pendente</span>);
      case 'APPROVED':
        return (<span className={`${base} bg-blue-500/10 text-blue-400`}><CheckCircle2 className="w-3 h-3" /> Aprovado</span>);
      case 'PAID':
        return (<span className={`${base} bg-green-500/10 text-green-400`}><CheckCircle2 className="w-3 h-3" /> Pago</span>);
      case 'REJECTED':
        return (<span className={`${base} bg-red-500/10 text-red-400`}><XCircle className="w-3 h-3" /> Rejeitado</span>);
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 md:h-64">
        <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  if (!affiliateData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl md:rounded-2xl p-6 md:p-8 text-center">
          <AlertCircle className="w-10 h-10 md:w-12 md:h-12 text-red-400 mx-auto mb-3 md:mb-4" />
          <h3 className="text-lg font-bold text-white mb-2 md:text-xl">Erro ao carregar dados</h3>
          <p className="text-gray-400 text-sm md:text-base">{error || 'Não foi possível carregar os dados do afiliado'}</p>
        </div>
      </div>
    );
  }

  const { affiliate, coupon, transactions = [], earningsSummary } = affiliateData;
  const canWithdraw = affiliate.balance >= MIN_WITHDRAWAL_DEPIX;
  const hasPendingWithdrawal = withdrawals.some((w: any) => w.status === 'PENDING');
  const totalReferralCommission = referralEarnings.reduce((s: number, e: any) => s + (e.commission ?? 0), 0);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-bitcoin/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-5 border border-bitcoin/30">
          <DollarSign className="w-5 h-5 md:w-7 md:h-7 text-bitcoin mb-2" />
          <p className="text-gray-400 text-xs mb-0.5">Saldo Disponível</p>
          <p className="text-lg font-bold text-white md:text-2xl truncate">{affiliate.balance.toFixed(2)} DEPIX</p>
        </div>
        <div className="bg-yellow-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-5 border border-yellow-500/30">
          <Clock className="w-5 h-5 md:w-7 md:h-7 text-yellow-400 mb-2" />
          <p className="text-gray-400 text-xs mb-0.5">Saldo Pendente</p>
          <p className="text-lg font-bold text-white md:text-2xl truncate">{affiliate.pendingBalance.toFixed(2)} DEPIX</p>
        </div>
        <div className="bg-green-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-5 border border-green-500/30">
          <TrendingUp className="w-5 h-5 md:w-7 md:h-7 text-green-400 mb-2" />
          <p className="text-gray-400 text-xs mb-0.5">Total Ganho</p>
          <p className="text-lg font-bold text-white md:text-2xl truncate">{affiliate.totalEarned.toFixed(2)} DEPIX</p>
        </div>
        <div className="bg-purple-500/10 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-5 border border-purple-500/30">
          <Banknote className="w-5 h-5 md:w-7 md:h-7 text-purple-400 mb-2" />
          <p className="text-gray-400 text-xs mb-0.5">Total Recebido</p>
          <p className="text-lg font-bold text-white md:text-2xl truncate">
            R$ {(affiliate.totalPaid ?? 0).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Comissões de indicação (ReferralEarning) */}
      {referralEarnings.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-bitcoin" />
              Comissões de Indicação
            </h3>
            <span className="text-sm font-bold text-bitcoin">R$ {totalReferralCommission.toFixed(2)}</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {referralEarnings.map((e: any) => (
              <div key={e.id} className="bg-gray-900/50 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-300 font-medium truncate">
                    {e.sourceUser?.name || e.sourceUser?.email || 'Indicado'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                    {e.boletoId && ' · Boleto'}
                    {e.rechargeId && ' · Recarga'}
                    {e.pixCopiaColaId && ' · Pix C&C'}
                  </p>
                </div>
                <p className="text-sm font-bold text-bitcoin flex-shrink-0">+R$ {e.commission.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Como funcionam as comissões */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-400" />
          Como funcionam as comissões
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4">
            <p className="text-xs text-bitcoin font-semibold mb-2 uppercase tracking-wide">Boletos</p>
            <p className="text-sm text-gray-300 leading-relaxed">Taxa variável (2%–4%) sobre o valor do boleto. Você recebe <span className="text-white font-semibold">20% da margem líquida</span> da plataforma.</p>
          </div>
          <div className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-4">
            <p className="text-xs text-purple-400 font-semibold mb-2 uppercase tracking-wide">Recargas</p>
            <p className="text-sm text-gray-300 leading-relaxed">Taxa sobre o valor da recarga. Comissão calculada sobre a margem líquida gerada em cada transação.</p>
          </div>
          <div className="bg-gray-900/60 border border-green-500/20 rounded-xl p-4">
            <p className="text-xs text-green-400 font-semibold mb-2 uppercase tracking-wide">Pix Copia e Cola ✨</p>
            <p className="text-sm text-gray-300 leading-relaxed">Taxa fixa de 3% sobre o valor do Pix. Você recebe <span className="text-white font-semibold">1% do valor principal</span> em cada transação aprovada.</p>
          </div>
        </div>
      </div>

      {/* Breakdown de ganhos por categoria */}
      {earningsSummary && (earningsSummary.coupon.count > 0 || earningsSummary.api.count > 0 || earningsSummary.recharge?.count > 0 || earningsSummary.pixCopiaCola?.count > 0) && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-bitcoin" />
            Origem das comissões
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
              <p className="text-xs text-blue-400 mb-1">Via Cupom</p>
              <p className="text-lg font-bold text-white">{earningsSummary.coupon.total.toFixed(2).replace('.', ',')} DEPIX</p>
              <p className="text-xs text-gray-500">{earningsSummary.coupon.count} transações</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-green-400 mb-1">Via API</p>
              <p className="text-lg font-bold text-white">{earningsSummary.api.total.toFixed(2).replace('.', ',')} DEPIX</p>
              <p className="text-xs text-gray-500">{earningsSummary.api.count} transações</p>
            </div>
            {earningsSummary.recharge?.count > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                <p className="text-xs text-purple-400 mb-1">Recargas</p>
                <p className="text-lg font-bold text-white">{earningsSummary.recharge.total.toFixed(2).replace('.', ',')} DEPIX</p>
                <p className="text-xs text-gray-500">{earningsSummary.recharge.count} transações</p>
              </div>
            )}
            {earningsSummary.pixCopiaCola?.count > 0 && (
              <div className="bg-green-900/30 border border-green-500/30 rounded-xl p-4">
                <p className="text-xs text-green-400 mb-1">Pix Copia e Cola</p>
                <p className="text-lg font-bold text-white">{earningsSummary.pixCopiaCola.total.toFixed(2).replace('.', ',')} DEPIX</p>
                <p className="text-xs text-gray-500">{earningsSummary.pixCopiaCola.count} transações</p>
              </div>
            )}
            <div className="col-span-2 md:col-span-4 bg-bitcoin/10 border border-bitcoin/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-bitcoin mb-1">Total histórico</p>
                <p className="text-lg font-bold text-white">{earningsSummary.total.toFixed(2).replace('.', ',')} DEPIX</p>
              </div>
              <p className="text-xs text-gray-500">{earningsSummary.coupon.count + earningsSummary.api.count + (earningsSummary.pixCopiaCola?.count ?? 0)} transações no total</p>
            </div>
          </div>
        </div>
      )}

      {/* Calculadora de Comissão */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <Calculator className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
          <h3 className="text-lg font-bold text-white md:text-xl">Calculadora de Comissão</h3>
        </div>
        <p className="text-gray-400 text-xs md:text-sm mb-4">
          Informe o valor da transação para ver a taxa cobrada do cliente e sua comissão. Nenhum dado é salvo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <label className="block text-sm text-gray-300 mb-2">Valor da transação (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={commissionCalcInput}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d,]/g, '').replace(/,/g, '.');
                if (v === '' || /^\d*\.?\d*$/.test(v)) setCommissionCalcInput(v);
              }}
              placeholder="Ex: 100,00"
              className={`${inputClass} ${focusRing}`}
            />
          </div>
          <div className="space-y-2 md:space-y-3">
            {commissionPreview ? (
              <>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-gray-400">Taxa cobrada do cliente</span>
                  <span className="text-white font-semibold">R$ {commissionPreview.fee.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-xs md:text-sm">
                  <span className="text-gray-400">Sua comissão (DEPIX)</span>
                  <span className="text-bitcoin font-semibold">{commissionPreview.commission.toFixed(2).replace('.', ',')} DEPIX</span>
                </div>
                {isAdmin && (
                  <div className="flex justify-between text-xs md:text-sm">
                    <span className="text-gray-400">Lucro líquido estimado</span>
                    <span className="text-green-400 font-semibold">R$ {commissionPreview.profit.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-700 flex justify-between text-sm">
                  <span className="text-gray-300">Total pago pelo cliente</span>
                  <span className="text-white font-bold">R$ {commissionPreview.totalAmount.toFixed(2).replace('.', ',')}</span>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-xs md:text-sm">
                {commissionCalcInput ? 'Valor mínimo para cálculo: R$ 20,00' : 'Digite um valor ≥ R$ 20,00'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cupom Card */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 md:mb-4">
          <div>
            <h3 className="text-lg font-bold text-white mb-1 md:text-xl">Seu Cupom</h3>
            <p className="text-gray-400 text-xs md:text-sm">Compartilhe seu cupom para ganhar comissões</p>
          </div>
          {coupon && (
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              coupon.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {coupon.isActive ? 'Ativo' : 'Bloqueado'}
            </div>
          )}
        </div>

        {coupon ? (
          <div className="space-y-3 md:space-y-4">
            <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <p className="text-gray-400 text-xs md:text-sm mb-1">Código do Cupom</p>
                  <p className="text-lg font-bold text-white font-mono truncate md:text-xl">{coupon.code}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCoupon}
                  className={`p-2.5 md:p-3 bg-bitcoin/10 hover:bg-bitcoin/20 rounded-lg md:rounded-xl transition-colors flex-shrink-0 ${focusRing}`}
                  aria-label="Copiar cupom"
                >
                  {copied ? <Check className="w-4 h-4 md:w-5 md:h-5 text-green-400" /> : <Copy className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
                <p className="text-gray-400 text-xs md:text-sm mb-1">Total de Usos</p>
                <p className="text-xl font-bold text-white md:text-2xl">{coupon.usageCount}</p>
              </div>
              <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4">
                <p className="text-gray-400 text-xs md:text-sm mb-1">Comissão</p>
                <p className="text-xl font-bold text-white md:text-2xl">{(coupon.commission * 100).toFixed(2)}%</p>
              </div>
            </div>

            {!coupon.isActive && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg md:rounded-xl p-3 md:p-4">
                <div className="flex items-start gap-2 md:gap-3">
                  <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs md:text-sm text-yellow-400 font-semibold mb-1">Cupom Bloqueado</p>
                    <p className="text-xs text-gray-300">
                      Seu cupom está bloqueado e não pode ser usado, mas você ainda pode sacar seu saldo disponível.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 text-center">
            <p className="text-gray-400 text-sm">Nenhum cupom — comissões geradas via API</p>
            {affiliate.commissionRate != null && (
              <p className="text-bitcoin font-bold text-lg mt-2">{(affiliate.commissionRate * 100).toFixed(2)}% de comissão</p>
            )}
          </div>
        )}
      </div>

      {/* Marketplace - Links e comissões */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <div className="flex items-center gap-2 mb-3 md:mb-4">
          <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
          <h3 className="text-lg font-bold text-white md:text-xl">Marketplace - Gerar link</h3>
        </div>
        <p className="text-gray-400 text-xs md:text-sm mb-4">
          Cole o slug do produto (ex: meu-ebook) e gere um link com seu código de afiliado. Compartilhe e ganhe comissões nas vendas.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text"
            value={marketplaceSlug}
            onChange={(e) => setMarketplaceSlug(e.target.value)}
            placeholder="slug-do-produto"
            className={`${inputClass} ${focusRing} flex-1`}
          />
          <button
            type="button"
            onClick={handleGenerateMarketplaceLink}
            disabled={marketplaceLinkLoading || !marketplaceSlug.trim()}
            className="px-4 py-3 rounded-xl bg-bitcoin hover:bg-orange-500 text-black font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {marketplaceLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
            Gerar link
          </button>
        </div>
        {marketplaceLink && (
          <div className="bg-gray-900/50 rounded-lg p-3 flex items-center justify-between gap-2">
            <p className="text-sm text-gray-300 truncate">{marketplaceLink}</p>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(marketplaceLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="p-2 rounded-lg bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin flex-shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
        {marketplaceEarnings && (marketplaceEarnings.commissions?.length > 0 || (marketplaceEarnings.summary?.total ?? 0) > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <h4 className="text-sm font-semibold text-white mb-2">Comissões do Marketplace</h4>
            <p className="text-bitcoin font-bold text-lg mb-2">
              Total: {(marketplaceEarnings.summary?.total ?? 0).toFixed(2)} DEPIX
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {marketplaceEarnings.commissions?.slice(0, 10).map((c: any) => (
                <div key={c.id} className="flex justify-between text-sm py-1 border-b border-gray-700/50 last:border-0">
                  <span className="text-gray-400 truncate">
                    {c.sellerOrder?.items?.[0]?.product?.title || `Pedido #${c.sellerOrderId?.slice(0, 8)}`}
                  </span>
                  <span className="text-green-400 font-medium">+{c.amount.toFixed(2)} DEPIX</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Botão de Saque */}
      <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-white mb-1 md:text-xl">Solicitar Saque</h3>
            <p className="text-gray-400 text-xs md:text-sm">
              {canWithdraw
                ? `Você pode sacar até ${affiliate.balance.toFixed(2).replace('.', ',')} DEPIX`
                : `Saldo mínimo para saque: ${MIN_WITHDRAWAL_DEPIX} DEPIX`
              }
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWithdrawalModal(true)}
            disabled={!canWithdraw || hasPendingWithdrawal}
            className={`px-4 py-2.5 md:py-3 md:px-6 rounded-lg md:rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-sm md:text-base flex-shrink-0 ${focusRing} ${
              canWithdraw && !hasPendingWithdrawal
                ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Wallet className="w-4 h-4 md:w-5 md:h-5" />
            {hasPendingWithdrawal ? 'Saque Pendente' : 'Solicitar Saque'}
          </button>
        </div>
      </div>

      {/* Cupons usados aguardando confirmação */}
      {affiliateData?.pendingUsages && affiliateData.pendingUsages.length > 0 && (
        <div className="bg-yellow-900/20 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-yellow-700/50 mb-4 md:mb-6">
          <h3 className="text-lg font-bold text-yellow-400 mb-3 md:mb-4 md:text-xl flex items-center gap-2">
            <span>⏳</span> Cupons usados aguardando confirmação
          </h3>
          <p className="text-sm text-yellow-300/80 mb-3">
            Estes cupons foram usados mas o pagamento ainda não foi confirmado. A comissão será creditada automaticamente após a confirmação.
          </p>
          <div className="space-y-2.5 md:space-y-3">
            {affiliateData.pendingUsages.map((usage: any) => (
              <div
                key={usage.id}
                className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-wrap items-center justify-between gap-2 md:gap-3"
              >
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm md:text-base">
                    {usage.userName || usage.userEmail}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(usage.createdAt).toLocaleString('pt-BR')}
                    {usage.boletoId && <span className="ml-2">📄 Boleto</span>}
                    {usage.depixOrderId && <span className="ml-2">💰 Depix</span>}
                    {!usage.boletoId && !usage.depixOrderId && <span className="ml-2">📱 Recarga</span>}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-yellow-400 font-bold text-sm md:text-base">Aguardando</p>
                  <p className="text-xs text-gray-500">confirmação</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de indicações e comissões */}
      {transactions.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
          <h3 className="text-lg font-bold text-white mb-3 md:mb-4 md:text-xl">Histórico de indicações e comissões</h3>
          <div className="space-y-2.5 md:space-y-3">
            {transactions.map((tx: any) => {
              // Determinar tipo, valor e origem da transação
              let transactionType = '';
              let transactionAmount = 0;
              let isApiCommission = false;

              if (tx.pixCopiaCola) {
                transactionType = 'Pix Copia e Cola';
                transactionAmount = tx.pixCopiaCola.totalFinal ?? tx.pixCopiaCola.valorOriginal ?? 0;
                isApiCommission = !!tx.pixCopiaCola.apiKeyId;
              } else if (tx.boleto) {
                transactionType = 'Boleto';
                transactionAmount = tx.boleto.totalAmount ?? tx.boleto.amount ?? 0;
                isApiCommission = !!tx.boleto.apiKeyId;
              } else if (tx.mobileRecharge) {
                transactionType = 'Recarga';
                transactionAmount = tx.mobileRecharge.totalAmount ?? tx.mobileRecharge.amount ?? 0;
                isApiCommission = !!tx.mobileRecharge.apiKeyId;
              } else if (tx.depixOrder) {
                transactionType = 'Depix';
                transactionAmount = tx.depixOrder.totalToPay ?? tx.depixOrder.amount ?? 0;
              }
              // fallback: usar campo source derivado pelo backend
              if (!tx.boleto && !tx.mobileRecharge && !tx.pixCopiaCola) {
                isApiCommission = tx.source === 'api';
              }

              return (
                <div
                  key={tx.id}
                  className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-wrap items-center justify-between gap-2 md:gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-white font-semibold text-sm md:text-base">
                        {transactionType} R$ {transactionAmount.toFixed(2).replace('.', ',')}
                      </p>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        isApiCommission
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {isApiCommission ? 'Via API' : 'Via Cupom'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.createdAt).toLocaleString('pt-BR')}
                      <span className="ml-2">
                        {tx.status === 'PENDING' && '⏳ Pendente'}
                        {tx.status === 'AVAILABLE' && '✓ Disponível'}
                        {tx.status === 'PAID' && '✓ Pago'}
                      </span>
                      {tx.pixCopiaCola?.nomeDestinatario && (
                        <span className="ml-2 text-green-400/70">→ {tx.pixCopiaCola.nomeDestinatario}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-bitcoin font-bold text-sm md:text-base">+ {tx.commission.toFixed(2).replace('.', ',')} DEPIX</p>
                    <p className="text-xs text-gray-500">comissão</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Histórico de Pagamentos de Comissão (admin → afiliado) */}
      {payments.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50 mb-4 md:mb-6">
          <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-400" />
            Pagamentos Recebidos
          </h3>
          <div className="space-y-2.5">
            {payments.map((p: any) => (
              <div key={p.id} className="bg-gray-900/50 rounded-xl p-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-green-400">R$ {p.amount.toFixed(2)}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{new Date(p.paidAt).toLocaleString('pt-BR')}</p>
                  {p.txid && (
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5 truncate max-w-xs">TXID: {p.txid}</p>
                  )}
                  {p.notes && <p className="text-[10px] text-gray-500 mt-0.5">{p.notes}</p>}
                </div>
                {p.receiptUrl && (
                  <a
                    href={p.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-bitcoin hover:underline flex-shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Comprovante
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de Saques */}
      {withdrawals.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-gray-700/50">
          <h3 className="text-lg font-bold text-white mb-3 md:mb-4 md:text-xl">Histórico de Saques</h3>
          <div className="space-y-2.5 md:space-y-3">
            {withdrawals.map((withdrawal: any) => (
              <div
                key={withdrawal.id}
                className="bg-gray-900/50 rounded-lg md:rounded-xl p-3 md:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 md:gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1 md:mb-2">
                    {getStatusBadge(withdrawal.status)}
                    <p className="text-white font-semibold text-sm md:text-base">
                      {withdrawal.amount.toFixed(2).replace('.', ',')} DEPIX
                    </p>
                  </div>
                  <p className="text-xs text-gray-400">{new Date(withdrawal.createdAt).toLocaleString('pt-BR')}</p>
                  {withdrawal.adminNotes && (
                    <p className="text-xs text-gray-500 mt-1">Observação: {withdrawal.adminNotes}</p>
                  )}
                </div>
                <div className="text-right sm:text-right">
                  <p className="text-xs text-gray-400 font-mono break-all max-w-full">{withdrawal.liquidWallet}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Saque */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-gray-900 rounded-xl md:rounded-2xl p-6 md:p-8 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4 md:mb-5 md:text-xl">Solicitar Saque</h3>

            <div className="space-y-4 mb-5 md:mb-6">
              <div>
                <label className="block text-sm text-gray-300 mb-2">Valor (DEPIX)</label>
                <input
                  type="text"
                  value={withdrawalAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d,]/g, '').replace(',', '.');
                    setWithdrawalAmount(value);
                  }}
                  placeholder={`Mínimo: ${MIN_WITHDRAWAL_DEPIX} DEPIX`}
                  className={`${inputClass} ${focusRing}`}
                />
                <p className="text-xs text-gray-500 mt-1.5">Saldo disponível: {affiliate.balance.toFixed(2).replace('.', ',')} DEPIX</p>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-2">Endereço da Carteira Liquid (DePix)</label>
                <input
                  type="text"
                  value={liquidWallet}
                  onChange={(e) => setLiquidWallet(e.target.value)}
                  placeholder="lq1..."
                  className={`${inputClass} font-mono ${focusRing}`}
                />
                <p className="text-xs text-gray-500 mt-1.5">Endereço onde você receberá o DePix</p>
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg md:rounded-xl p-3 md:p-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowWithdrawalModal(false); setError(''); setWithdrawalAmount(''); }}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gray-700 text-gray-200 text-sm font-medium hover:bg-gray-600 ${focusRing}`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRequestWithdrawal}
                disabled={submitting}
                className={`px-4 py-2.5 md:py-3 rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${focusRing}`}
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> Enviando...</>
                ) : (
                  'Solicitar Saque'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
