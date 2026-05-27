import { useState, useEffect } from 'react';
import {
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  DollarSign,
  Calendar,
  Send,
  Loader2,
  AlertCircle,
  Globe,
  Ban,
  GaugeCircle,
  Star,
  Wrench,
  Smartphone,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  LayoutGrid,
  ClipboardList,
  Megaphone,
  UserPlus,
  Mail,
  ExternalLink,
  Download,
  TrendingUp,
  X,
  Bell,
  QrCode,
  Copy,
  Upload,
  Search,
  Banknote,
  RefreshCw,
  ArrowRightLeft,
  FileText,
} from 'lucide-react';
import api from '../services/api';
import AdminDashboard from './AdminDashboard';
import AdminAudit from './AdminAudit';
import AdminSendPixAudit from './AdminSendPixAudit';
import AdminMarketplace from './AdminMarketplace';
import AdminCommunications from './admin/AdminCommunications';
import AdminBot from './admin/AdminBot';
import AdminPixCopiaCola from './admin/AdminPixCopiaCola';

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
  pdfPassword?: string | null;
  receiptUrl?: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    telegram: string;
  };
}

export default function Admin() {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('PENDING');
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File | null>>({});
  const [tab, setTab] = useState<'dashboard' | 'boletos' | 'recargas' | 'pixCopiaCola' | 'users' | 'affiliates' | 'commerce' | 'marketplace' | 'stats' | 'config' | 'support' | 'comunicacoes' | 'bot' | 'audit' | 'sendPix' | 'swapRefunds' | 'contas'>('dashboard');
  const [billPayments, setBillPayments] = useState<any[]>([]);
  const [billPaymentsLoading, setBillPaymentsLoading] = useState(false);
  const [billPaymentFilter, setBillPaymentFilter] = useState('PENDING');
  const [billPaymentActionLoading, setBillPaymentActionLoading] = useState<string | null>(null);
  const [swapRefunds, setSwapRefunds] = useState<any[]>([]);
  const [swapRefundsLoading, setSwapRefundsLoading] = useState(false);
  const [swapRefundTxid, setSwapRefundTxid] = useState<Record<string, string>>({});
  const [swapRefundProcessing, setSwapRefundProcessing] = useState<string | null>(null);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [rechargeFilter, setRechargeFilter] = useState<string>('PENDING');
  const [rechargesLoading, setRechargesLoading] = useState(false);
  const [rechargesError, setRechargesError] = useState<string | null>(null);
  const [uploadingRechargeId, setUploadingRechargeId] = useState<string | null>(null);
  const [receiptFilesRecharge, setReceiptFilesRecharge] = useState<Record<string, File | null>>({});
  const [emailModal, setEmailModal] = useState<{ userId: string; userName: string; userEmail: string } | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [pushModal, setPushModal] = useState<{ userId: string; userName: string } | null>(null);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushSending, setPushSending] = useState(false);

  interface AdminUser {
    id: string;
    name: string;
    email: string;
    telegram: string;
    role: string;
    isActive: boolean;
    isBlocked: boolean;
    totalPaid: number;
    createdAt: string;
    lastLoginAt?: string | null;
    lastLoginIp?: string | null;
    lastLoginCity?: string | null;
    lastLoginCountry?: string | null;
    lastLoginIsVpn?: boolean | null;
    commercePartner?: {
      id: string;
      status: string;
      businessType: string;
      documentType: string;
      createdAt: string;
    } | null;
  }

  interface AdminAffiliate {
    id: string;
    userId: string;
    couponCode: string;
    balance: number;
    pendingBalance: number;
    totalEarned: number;
    isActive: boolean;
    createdAt: string;
    user: { id: string; name: string; email: string; telegram: string; role: string; isActive: boolean; isBlocked: boolean; createdAt: string };
    coupons: Array<{ id: string; code: string; isActive: boolean; usageCount: number; maxUsage: number | null; discount: number; commission: number }>;
    // Campos de API (Phase 1)
    apiStatus?: 'inactive' | 'beta' | 'active' | 'blocked';
    apiKeysCount?: number;
    hasApiIntegration?: boolean;
    apiConfig?: {
      id: string;
      status: string;
      globalDailyLimitPerUser: number;
      maxDailyVolumeAffiliate: number | null;
      activatedAt: string | null;
      blockedAt: string | null;
      blockedReason: string | null;
    } | null;
    apiKeys?: Array<{
      id: string;
      keyPrefix: string;
      isActive: boolean;
      suspendedAt: string | null;
      requestCount: number;
      lastUsedAt: string | null;
      createdAt: string;
    }>;
    earningsSummary?: {
      coupon: number;
      api: number;
      recharge: number;
      total: number;
    };
  }

  interface AffiliateEarnings {
    period: string;
    coupon: { total: number; count: number };
    api: { total: number; count: number };
    recharge: { total: number; count: number };
    depix: { total: number; count: number };
    summary: { totalEarnings: number };
  }

  interface AffiliateApiUser {
    id: string;
    affiliateId: string;
    userRef: string;
    dailyLimit: number | null;
    isActive: boolean;
    blockedReason: string | null;
    blockedAt: string | null;
    usedToday: number;
    usedThisMonth: number;
    createdAt: string;
  }

  interface AdminMetrics {
    totalFaturado: number;
    totalDescontos: number;
    totalComissoes: number;
    custosOperacionais: number;
    lucro: number;
    isLucrativo: boolean;
  }

  interface MerchantMetrics {
    partnerId: string;
    userId: string;
    userName: string;
    userEmail: string;
    businessName: string;
    cnpj: string;
    createdAt: string;
    createdByAdmin?: boolean;
    useCustomFees?: boolean;
    customFixedFee?: number | null;
    customVariablePercent?: number | null;
    metrics: {
      grossRevenue: number;
      totalFees: number;
      pagdepixProfit: number;
      totalPayments: number;
    };
  }

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [merchants, setMerchants] = useState<MerchantMetrics[]>([]);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [affiliates, setAffiliates] = useState<AdminAffiliate[]>([]);
  const [affiliatesLoading, setAffiliatesLoading] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [_maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceModalMessage, setMaintenanceModalMessage] = useState('');
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'USER' | 'COMMERCE' | 'AFFILIATE'>('all');
  const [affiliateModalUser, setAffiliateModalUser] = useState<AdminUser | null>(null);
  const [affiliateDiscount, setAffiliateDiscount] = useState<string>('20');
  const [affiliateCommission, setAffiliateCommission] = useState<string>('20');
  const [affiliateCouponCode, setAffiliateCouponCode] = useState<string>('');
  const [affiliateMaxUsage, setAffiliateMaxUsage] = useState<string>('');
  const [affiliateUnlimitedUsage, setAffiliateUnlimitedUsage] = useState(true);
  const [affiliateLoading, setAffiliateLoading] = useState(false);

  // Edição de taxas de comerciante
  const [feesModalMerchant, setFeesModalMerchant] = useState<MerchantMetrics | null>(null);
  const [feesUseCustom, setFeesUseCustom] = useState(false);
  const [feesFixedFee, setFeesFixedFee] = useState('0.99');
  const [feesVariablePercent, setFeesVariablePercent] = useState('0.5');
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState('');

  // Criar conta de comerciante para terceiros (trusted merchant)
  const [showCreateTrustedMerchant, setShowCreateTrustedMerchant] = useState(false);
  const [trustedForm, setTrustedForm] = useState({
    nomeCompleto: '',
    cpf: '',
    email: '',
    telefone: '',
    senhaInicial: '',
    nomeNegocio: '',
    liquidWallet: '',
  });
  const [trustedLoading, setTrustedLoading] = useState(false);
  const [trustedError, setTrustedError] = useState('');

  // Suporte / Atendimento
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [supportTicketDetail, setSupportTicketDetail] = useState<any | null>(null);
  const [supportFilter, setSupportFilter] = useState<string>('ALL');
  const [supportSearch, setSupportSearch] = useState('');
  const [supportCounts, setSupportCounts] = useState<{ open: number; inProgress: number; total: number } | null>(null);
  const [supportMessageInput, setSupportMessageInput] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);

  // Modal de gestão de integração API do afiliado
  const [showApiModal, setShowApiModal] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AdminAffiliate | null>(null);
  const [apiModalTab, setApiModalTab] = useState<'status' | 'keys' | 'earnings' | 'audit' | 'users'>('status');
  const [apiModalLoading, setApiModalLoading] = useState(false);
  const [apiIntegration, setApiIntegration] = useState<any>(null);
  const [affiliateEarnings, setAffiliateEarnings] = useState<AffiliateEarnings | null>(null);
  const [affiliateAuditLog, setAffiliateAuditLog] = useState<any[]>([]);
  const [affiliateApiUsers, setAffiliateApiUsers] = useState<AffiliateApiUser[]>([]);
  const [apiStatusUpdate, setApiStatusUpdate] = useState<string>('');
  const [apiStatusReason, setApiStatusReason] = useState<string>('');
  const [apiLimitUpdate, setApiLimitUpdate] = useState<string>('');
  const [apiLimitReason, setApiLimitReason] = useState<string>('');
  const [apiActionLoading, setApiActionLoading] = useState(false);

  // Afiliados — busca e pagamento de comissão
  const [affiliateSearch, setAffiliateSearch] = useState('');
  const [payCommissionAffiliate, setPayCommissionAffiliate] = useState<AdminAffiliate | null>(null);
  const [payCommissionTxid, setPayCommissionTxid] = useState('');
  const [payCommissionNotes, setPayCommissionNotes] = useState('');
  const [payCommissionAmount, setPayCommissionAmount] = useState('');
  const [payCommissionFile, setPayCommissionFile] = useState<File | null>(null);
  const [payCommissionLoading, setPayCommissionLoading] = useState(false);
  const [payCommissionError, setPayCommissionError] = useState('');

  useEffect(() => {
    loadBoletos();
    loadUsers();
    loadMetrics();
    loadMaintenance();
    loadSupportCounts();
  }, []);

  const loadMaintenance = async () => {
    try {
      const { data } = await api.get('/admin/maintenance');
      setMaintenanceActive(data.active);
      setMaintenanceMessage(data.message ?? null);
    } catch {
      setMaintenanceActive(false);
    }
  };

  const handleSetMaintenance = async (active: boolean, message?: string) => {
    setMaintenanceLoading(true);
    try {
      await api.post('/admin/maintenance', { active, message: message || undefined });
      await loadMaintenance();
      setMaintenanceModalOpen(false);
      setMaintenanceModalMessage('');
      alert(active ? 'Modo manutenção ativado.' : 'Modo manutenção desativado.');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao atualizar modo manutenção';
      const details = err.response?.data?.details;
      alert(details ? `${msg}\n\nDetalhe: ${details}` : msg);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'affiliates') loadAffiliates();
    if (tab === 'recargas') loadRecharges();
    if (tab === 'commerce') loadMerchants();
    if (tab === 'stats') loadMetrics();
    if (tab === 'support') {
      loadSupportTickets();
      loadSupportCounts();
    }
    if (tab === 'swapRefunds') loadSwapRefunds();
    if (tab === 'contas') loadBillPayments();
  }, [tab]);

  const loadBillPayments = async () => {
    setBillPaymentsLoading(true);
    try {
      const { data } = await api.get('/bill-payments/admin/list', { params: { limit: 100 } });
      setBillPayments(data.billPayments ?? []);
    } catch {
    } finally {
      setBillPaymentsLoading(false);
    }
  };

  const handleApproveBillPayment = async (id: string) => {
    if (!window.confirm('Aprovar este pagamento de conta?')) return;
    setBillPaymentActionLoading(id);
    try {
      await api.post(`/bill-payments/admin/${id}/approve`);
      await loadBillPayments();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao aprovar.');
    } finally {
      setBillPaymentActionLoading(null);
    }
  };

  const handleRejectBillPayment = async (id: string) => {
    if (!window.confirm('Rejeitar este pagamento? O cliente será notificado.')) return;
    setBillPaymentActionLoading(id);
    try {
      await api.post(`/bill-payments/admin/${id}/reject`);
      await loadBillPayments();
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao rejeitar.');
    } finally {
      setBillPaymentActionLoading(null);
    }
  };

  const loadSwapRefunds = async () => {
    setSwapRefundsLoading(true);
    try {
      const { data } = await api.get('/admin/sideswap/refunds');
      setSwapRefunds(data.swaps ?? []);
    } catch {
    } finally {
      setSwapRefundsLoading(false);
    }
  };

  const handleCompleteRefund = async (swapId: string) => {
    setSwapRefundProcessing(swapId);
    try {
      await api.post(`/admin/sideswap/refund/${swapId}/complete`, {
        txid: swapRefundTxid[swapId]?.trim() || undefined,
      });
      setSwapRefunds(prev => prev.map(s => s.id === swapId ? { ...s, status: 'refunded' } : s));
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Erro ao processar reembolso.');
    } finally {
      setSwapRefundProcessing(null);
    }
  };

  const loadBoletos = async () => {
    try {
      const { data } = await api.get('/admin/boletos');
      setBoletos(data.boletos);
    } catch (err) {
      console.error('Erro ao carregar boletos:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRecharges = async (filterOverride?: string) => {
    setRechargesLoading(true);
    setRechargesError(null);
    const filter = filterOverride !== undefined ? filterOverride : rechargeFilter;
    try {
      const { data } = await api.get('/admin/recharges', {
        params: filter !== 'ALL' ? { status: filter } : {}
      });
      setRecharges(data.recharges || []);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || (err.response ? 'Erro ao carregar recargas.' : 'Sem conexão. Verifique a internet.');
      setRechargesError(msg);
      setRecharges([]);
      console.error('Erro ao carregar recargas:', err);
    } finally {
      setRechargesLoading(false);
    }
  };

  const handleApproveRecharge = (rechargeId: string) => {
    setUploadingRechargeId(rechargeId);
  };

  const handleConfirmApproveRecharge = async (rechargeId: string) => {
    const file = receiptFilesRecharge[rechargeId];
    if (!file) {
      alert('Envie o comprovante de liquidação antes de aprovar.');
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/admin/recharge/${rechargeId}/approve`, formData);
      setUploadingRechargeId(null);
      setReceiptFilesRecharge((prev) => ({ ...prev, [rechargeId]: null }));
      await loadRecharges();
      alert('Recarga aprovada. Comprovante salvo.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao aprovar recarga.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRecharge = async (rechargeId: string) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/recharge/${rechargeId}/reject`);
      await loadRecharges();
      alert('Recarga reprovada (cancelada).');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao reprovar recarga.');
    } finally {
      setActionLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const params: { search?: string; role?: string } = {};
      if (userSearch?.trim()) params.search = userSearch.trim();
      if (userRoleFilter !== 'all') params.role = userRoleFilter;
      const { data } = await api.get('/admin/users', { params });
      setUsers(data.users);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const loadAffiliates = async () => {
    setAffiliatesLoading(true);
    try {
      const { data } = await api.get('/admin/affiliates');
      const list = Array.isArray(data?.affiliates) ? data.affiliates : Array.isArray(data) ? data : [];
      setAffiliates(list);
    } catch (err: any) {
      console.error('Erro ao carregar afiliados:', err);
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar afiliados';
      alert(msg);
      setAffiliates([]);
    } finally {
      setAffiliatesLoading(false);
    }
  };

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const { data } = await api.get('/admin/metrics');
      setMetrics(data);
    } catch (err) {
      console.error('Erro ao carregar métricas:', err);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadMerchants = async () => {
    setMerchantsLoading(true);
    try {
      const { data } = await api.get('/admin/commerce/merchants/metrics');
      setMerchants(data.merchants || []);
    } catch (err: any) {
      console.error('Erro ao carregar comerciantes:', err);
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar comerciantes';
      alert(msg);
      setMerchants([]);
    } finally {
      setMerchantsLoading(false);
    }
  };

  const openFeesModal = (merchant: MerchantMetrics) => {
    setFeesModalMerchant(merchant);
    setFeesUseCustom(merchant.useCustomFees || false);
    setFeesFixedFee(merchant.customFixedFee?.toString() || '0.99');
    setFeesVariablePercent(merchant.customVariablePercent?.toString() || '0.5');
    setFeesError('');
  };

  const saveFeesModal = async () => {
    if (!feesModalMerchant) return;
    
    setFeesError('');
    setFeesLoading(true);

    try {
      const fixedFee = parseFloat(feesFixedFee.replace(',', '.'));
      const variablePercent = parseFloat(feesVariablePercent.replace(',', '.'));

      if (feesUseCustom) {
        if (isNaN(fixedFee) || fixedFee < 0) {
          setFeesError('Taxa fixa inválida');
          setFeesLoading(false);
          return;
        }
        if (isNaN(variablePercent) || variablePercent < 0 || variablePercent > 100) {
          setFeesError('Taxa variável deve estar entre 0% e 100%');
          setFeesLoading(false);
          return;
        }
      }

      await api.put(`/admin/commerce/merchant/${feesModalMerchant.partnerId}/fees`, {
        useCustomFees: feesUseCustom,
        customFixedFee: feesUseCustom ? fixedFee : null,
        customVariablePercent: feesUseCustom ? variablePercent : null,
      });

      alert('Taxas atualizadas com sucesso!');
      setFeesModalMerchant(null);
      await loadMerchants();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao atualizar taxas';
      setFeesError(msg);
    } finally {
      setFeesLoading(false);
    }
  };

  const submitCreateTrustedMerchant = async () => {
    setTrustedError('');
    if (!trustedForm.nomeCompleto.trim() || !trustedForm.email.trim() || !trustedForm.senhaInicial) {
      setTrustedError('Nome completo, e-mail e senha inicial são obrigatórios.');
      return;
    }
    if (trustedForm.senhaInicial.length < 6) {
      setTrustedError('Senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setTrustedLoading(true);
    try {
      await api.post('/admin/commerce/create-trusted-merchant', {
        nomeCompleto: trustedForm.nomeCompleto.trim(),
        cpf: (trustedForm.cpf || '').replace(/\D/g, '') || undefined,
        email: trustedForm.email.trim(),
        telefone: trustedForm.telefone.trim() || undefined,
        senhaInicial: trustedForm.senhaInicial,
        nomeNegocio: trustedForm.nomeNegocio.trim() || trustedForm.nomeCompleto.trim(),
        liquidWallet: trustedForm.liquidWallet.trim() || undefined,
      });
      alert('Conta de comerciante criada com sucesso! O usuário já pode fazer login.');
      setShowCreateTrustedMerchant(false);
      setTrustedForm({ nomeCompleto: '', cpf: '', email: '', telefone: '', senhaInicial: '', nomeNegocio: '', liquidWallet: '' });
      await loadMerchants();
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.message || data?.error || err.message || 'Erro ao criar conta';
      setTrustedError(msg);
    } finally {
      setTrustedLoading(false);
    }
  };

  const loadSupportCounts = async () => {
    try {
      const { data } = await api.get('/admin/support/counts');
      setSupportCounts(data);
    } catch {
      setSupportCounts(null);
    }
  };

  const loadSupportTickets = async () => {
    setSupportLoading(true);
    try {
      const params: { status?: string; search?: string; page?: number; limit?: number } = {};
      if (supportFilter !== 'ALL') params.status = supportFilter;
      if (supportSearch.trim()) params.search = supportSearch.trim();
      const { data } = await api.get('/admin/support/tickets', { params });
      setSupportTickets(data.tickets ?? []);
    } catch {
      setSupportTickets([]);
    } finally {
      setSupportLoading(false);
    }
  };

  const loadSupportTicketDetail = async (ticketId: string) => {
    try {
      const { data } = await api.get(`/admin/support/tickets/${ticketId}`);
      setSupportTicketDetail(data.ticket);
    } catch {
      setSupportTicketDetail(null);
    }
  };

  const handleSupportStatusChange = async (ticketId: string, status: string) => {
    try {
      await api.patch(`/admin/support/tickets/${ticketId}`, { status });
      loadSupportTickets();
      loadSupportCounts();
      if (supportTicketDetail?.id === ticketId) {
        setSupportTicketDetail((prev: { id: string; status: string; user?: any; messages?: any[] } | null) => (prev ? { ...prev, status } : null));
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar status');
    }
  };

  const handleSupportSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportTicketDetail?.id || !supportMessageInput.trim() || supportSending) return;
    const text = supportMessageInput.trim();
    setSupportMessageInput('');
    setSupportSending(true);
    try {
      await api.post(`/admin/support/tickets/${supportTicketDetail.id}/messages`, { content: text });
      await loadSupportTicketDetail(supportTicketDetail.id);
      loadSupportTickets();
      loadSupportCounts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar');
      setSupportMessageInput(text);
    } finally {
      setSupportSending(false);
    }
  };

  // ── Funções do modal de API ──────────────────────────────────────────────

  const openApiModal = async (affiliate: AdminAffiliate) => {
    setSelectedAffiliate(affiliate);
    setApiModalTab('status');
    setApiIntegration(null);
    setAffiliateEarnings(null);
    setAffiliateAuditLog([]);
    setAffiliateApiUsers([]);
    setApiStatusUpdate(affiliate.apiStatus ?? 'inactive');
    setApiStatusReason('');
    setApiLimitUpdate(String(affiliate.apiConfig?.globalDailyLimitPerUser ?? 1000));
    setApiLimitReason('');
    setShowApiModal(true);
    setApiModalLoading(true);
    try {
      const { data } = await api.get(`/admin/affiliates/${affiliate.id}/api-integration`);
      setApiIntegration(data);
      setApiStatusUpdate(data.apiConfig?.status ?? 'inactive');
      setApiLimitUpdate(String(data.apiConfig?.globalDailyLimitPerUser ?? 1000));
    } catch (err: any) {
      console.error('Erro ao carregar integração API:', err);
    } finally {
      setApiModalLoading(false);
    }
  };

  const loadApiModalTab = async (newTab: typeof apiModalTab) => {
    if (!selectedAffiliate) return;
    setApiModalTab(newTab);
    if (newTab === 'earnings' && !affiliateEarnings) {
      try {
        const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/earnings`);
        setAffiliateEarnings(data);
      } catch { /* silencioso */ }
    }
    if (newTab === 'audit' && affiliateAuditLog.length === 0) {
      try {
        const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/audit-log`);
        setAffiliateAuditLog(data.logs ?? []);
      } catch { /* silencioso */ }
    }
    if (newTab === 'users' && affiliateApiUsers.length === 0) {
      try {
        const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/api-users`);
        setAffiliateApiUsers(data.users ?? []);
      } catch { /* silencioso */ }
    }
  };

  const handleApiStatusSave = async () => {
    if (!selectedAffiliate) return;
    setApiActionLoading(true);
    try {
      await api.post(`/admin/affiliates/${selectedAffiliate.id}/api-integration/status`, {
        status: apiStatusUpdate,
        reason: apiStatusReason.trim() || undefined,
      });
      const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/api-integration`);
      setApiIntegration(data);
      setApiStatusUpdate(data.apiConfig?.status ?? 'inactive');
      await loadAffiliates();
      alert('Status atualizado com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar status');
    } finally {
      setApiActionLoading(false);
    }
  };

  const handleApiLimitSave = async () => {
    if (!selectedAffiliate) return;
    const limit = parseFloat(apiLimitUpdate.replace(',', '.'));
    if (isNaN(limit) || limit <= 0) { alert('Limite inválido'); return; }
    setApiActionLoading(true);
    try {
      await api.post(`/admin/affiliates/${selectedAffiliate.id}/api-integration/limits`, {
        globalDailyLimitPerUser: limit,
        reason: apiLimitReason.trim() || undefined,
      });
      const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/api-integration`);
      setApiIntegration(data);
      setApiLimitUpdate(String(data.apiConfig?.globalDailyLimitPerUser ?? 1000));
      await loadAffiliates();
      alert('Limite atualizado com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar limite');
    } finally {
      setApiActionLoading(false);
    }
  };

  const handleSuspendApiKey = async (keyId: string) => {
    const reason = prompt('Motivo da suspensão:');
    if (reason === null) return;
    setApiActionLoading(true);
    try {
      await api.post(`/admin/api-keys/${keyId}/suspend`, { reason });
      if (selectedAffiliate) {
        const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/api-integration`);
        setApiIntegration(data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao suspender chave');
    } finally {
      setApiActionLoading(false);
    }
  };

  const handleReactivateApiKey = async (keyId: string) => {
    setApiActionLoading(true);
    try {
      await api.post(`/admin/api-keys/${keyId}/reactivate`);
      if (selectedAffiliate) {
        const { data } = await api.get(`/admin/affiliates/${selectedAffiliate.id}/api-integration`);
        setApiIntegration(data);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao reativar chave');
    } finally {
      setApiActionLoading(false);
    }
  };

  const handleBlockApiUser = async (userRef: string) => {
    const reason = prompt('Motivo do bloqueio:');
    if (reason === null) return;
    setApiActionLoading(true);
    try {
      await api.post(`/admin/affiliates/${selectedAffiliate!.id}/api-users/${encodeURIComponent(userRef)}/block`, { reason });
      const { data } = await api.get(`/admin/affiliates/${selectedAffiliate!.id}/api-users`);
      setAffiliateApiUsers(data.users ?? []);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao bloquear usuário');
    } finally {
      setApiActionLoading(false);
    }
  };

  const handleUnblockApiUser = async (userRef: string) => {
    setApiActionLoading(true);
    try {
      await api.post(`/admin/affiliates/${selectedAffiliate!.id}/api-users/${encodeURIComponent(userRef)}/unblock`);
      const { data } = await api.get(`/admin/affiliates/${selectedAffiliate!.id}/api-users`);
      setAffiliateApiUsers(data.users ?? []);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao desbloquear usuário');
    } finally {
      setApiActionLoading(false);
    }
  };

  const apiStatusBadgeColor = (status?: string) => {
    if (status === 'active') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (status === 'beta') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (status === 'blocked') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  const apiStatusLabel = (status?: string) => {
    if (status === 'active') return 'API Ativo';
    if (status === 'beta') return 'API Beta';
    if (status === 'blocked') return 'API Bloqueado';
    if (status === 'inactive') return 'API Inativo';
    return 'Sem API';
  };

  // ─────────────────────────────────────────────────────────────────────────

  const handlePayCommission = async () => {
    if (!payCommissionAffiliate) return;
    setPayCommissionLoading(true);
    setPayCommissionError('');
    try {
      const formData = new FormData();
      if (payCommissionTxid) formData.append('txid', payCommissionTxid);
      if (payCommissionNotes) formData.append('notes', payCommissionNotes);
      if (payCommissionAmount) formData.append('amount', payCommissionAmount);
      if (payCommissionFile) formData.append('receipt', payCommissionFile);
      await api.post(`/admin/affiliates/${payCommissionAffiliate.id}/pay-commission`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await loadAffiliates();
      setPayCommissionAffiliate(null);
      setPayCommissionTxid('');
      setPayCommissionNotes('');
      setPayCommissionAmount('');
      setPayCommissionFile(null);
    } catch (err: any) {
      setPayCommissionError(err.response?.data?.error || 'Erro ao processar pagamento');
    } finally {
      setPayCommissionLoading(false);
    }
  };

  const handleRemoveAffiliate = async (userId: string) => {
    if (!window.confirm('Remover afiliação? O cupom será desativado e o usuário voltará a ser USER.')) return;
    try {
      await api.post(`/admin/users/${userId}/remove-affiliate`);
      await loadAffiliates();
      await loadUsers();
      alert('Afiliação removida com sucesso.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao remover afiliação');
    }
  };

  const handleUserAction = async (
    userId: string,
    action: 'block' | 'unblock' | 'activate' | 'deactivate' | 'delete',
  ) => {
    try {
      let body: any = { action };

      if (action === 'delete') {
        const confirmed = window.confirm(
          'Tem certeza que deseja excluir este usuário para sempre?\nEssa ação não poderá ser desfeita.'
        );
        if (!confirmed) return;
      }

      await api.post(`/admin/users/${userId}/action`, body);
      await loadUsers();
      alert('Usuário atualizado com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar usuário');
    }
  };

  const handleCommerceAction = async (userId: string, action: 'approve_commerce' | 'reject_commerce') => {
    try {
      await api.post(`/admin/users/${userId}/action`, { action });
      await loadUsers();
      alert(action === 'approve_commerce' ? 'Comerciante aprovado.' : 'Comerciante rejeitado.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar comerciante');
    }
  };

  const handleApprove = (boletoId: string) => {
    setUploadingId(boletoId);
  };

  const handleConfirmApprove = async (boletoId: string) => {
    const file = receiptFiles[boletoId];
    if (!file) {
      alert('Envie o comprovante de pagamento antes de aprovar.');
      return;
    }

    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      await api.post(`/admin/boleto/${boletoId}/approve`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadingId(null);
      setReceiptFiles((prev) => ({ ...prev, [boletoId]: null }));
      await loadBoletos();
      alert('Boleto aprovado com sucesso!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao aprovar boleto');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (boletoId: string) => {
    const reason = prompt('Motivo da rejeição:');
    if (!reason) return;
    
    setActionLoading(true);
    try {
      await api.post(`/admin/boleto/${boletoId}/reject`, { reason });
      loadBoletos();
      alert('Boleto rejeitado!');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao rejeitar boleto');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendPush = async () => {
    if (!pushModal || !pushTitle.trim() || !pushBody.trim()) return;
    setPushSending(true);
    try {
      await api.post(`/admin/users/${pushModal.userId}/notify`, {
        title: pushTitle,
        body: pushBody,
      });
      alert('Notificação push enviada!');
      setPushModal(null);
      setPushTitle('');
      setPushBody('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar notificação');
    } finally {
      setPushSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailModal || !emailSubject.trim() || !emailBody.trim()) return;
    setEmailSending(true);
    try {
      await api.post(`/admin/users/${emailModal.userId}/send-email`, {
        subject: emailSubject,
        message: emailBody,
      });
      alert('E-mail enviado com sucesso!');
      setEmailModal(null);
      setEmailSubject('');
      setEmailBody('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar e-mail');
    } finally {
      setEmailSending(false);
    }
  };

  const filteredBoletos = boletos.filter(b => {
    if (filter === 'ALL') return true;
    return b.status === filter;
  });

  const stats = {
    pending: boletos.filter(b => b.status === 'PENDING').length,
    paid: boletos.filter(b => b.status === 'PAID').length,
    problem: boletos.filter(b => b.status === 'PROBLEM').length,
    totalValue: boletos
      .filter(b => b.status === 'PAID')
      .reduce((sum, b) => sum + b.totalAmount, 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-500/20 rounded-xl">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
            <p className="text-gray-400">Gerencie pagamentos, usuários e segurança</p>
          </div>
        </div>
      </div>

      {/* Tabs — ordem: mais relevantes no topo */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setTab('dashboard')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'dashboard' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <LayoutGrid className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => setTab('boletos')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'boletos' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Boletos
        </button>
        <button
          onClick={() => setTab('recargas')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'recargas' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Recargas
        </button>
        <button
          onClick={() => setTab('pixCopiaCola')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium ${tab === 'pixCopiaCola' ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' : 'bg-gray-800 text-gray-300'}`}
        >
          <QrCode className="w-3.5 h-3.5" />
          Pix C&amp;C
        </button>
        <button
          onClick={() => setTab('users')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'users' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Usuários
        </button>
        <button
          onClick={() => setTab('commerce')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'commerce' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Comerciantes
        </button>
        <button
          onClick={() => setTab('affiliates')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'affiliates' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Afiliados
        </button>
        <button
          onClick={() => setTab('marketplace')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'marketplace' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <LayoutGrid className="w-4 h-4" />
          Loja / Marketplace
        </button>
        <button
          onClick={() => setTab('stats')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'stats' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Estatísticas
        </button>
        <button
          onClick={() => setTab('support')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'support' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <MessageSquare className="w-4 h-4" />
          Atendimento
          {supportCounts && (supportCounts.open + supportCounts.inProgress) > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {supportCounts.open + supportCounts.inProgress}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('comunicacoes')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'comunicacoes' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <Megaphone className="w-4 h-4" />
          Comunicações
        </button>
        <button
          onClick={() => setTab('bot')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'bot' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          🤖 Bot Telegram
        </button>
        <button
          onClick={() => setTab('config')}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'config' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          Configurações
        </button>
        <button
          onClick={() => setTab('audit')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'audit' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <ClipboardList className="w-4 h-4" />
          Auditoria
        </button>
        <button
          onClick={() => setTab('sendPix')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'sendPix' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <Send className="w-4 h-4" />
          Enviar PIX
        </button>
        <button
          onClick={() => setTab('contas')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'contas' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <FileText className="w-4 h-4" />
          Pagar Conta
          {billPayments.filter(b => b.status === 'PENDING').length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {billPayments.filter(b => b.status === 'PENDING').length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('swapRefunds')}
          className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5 ${tab === 'swapRefunds' ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black' : 'bg-gray-800 text-gray-300'}`}
        >
          <RefreshCw className="w-4 h-4" />
          Reembolsos Swap
          {swapRefunds.filter(s => s.status === 'failed').length > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {swapRefunds.filter(s => s.status === 'failed').length}
            </span>
          )}
        </button>
      </div>

      {/* Conteúdo principal por aba */}
      {tab === 'dashboard' && (
        <AdminDashboard
          onNavigateToTab={(t) => setTab(t === 'audit' ? 'audit' : t === 'commerce' ? 'commerce' : t === 'affiliates' ? 'affiliates' : t === 'marketplace' ? 'marketplace' : 'users')}
        />
      )}
      {tab === 'boletos' && (
        <>
      {/* Filters */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 mb-6">
        <div className="flex gap-2">
          {['PENDING', 'PAID', 'PROBLEM', 'ALL'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'PENDING' ? '⏳ Pendentes' : 
               f === 'PAID' ? '✅ Pagos' : 
               f === 'PROBLEM' ? '⚠️ Problemas' : 
               '📋 Todos'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Boletos */}
      <div className="space-y-4">
        {filteredBoletos.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
            <CheckCircle2 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-400 mb-2">Tudo em dia!</h3>
            <p className="text-gray-500">Não há boletos pendentes no momento</p>
          </div>
        ) : (
          filteredBoletos.map((boleto) => (
            <div
              key={boleto.id}
              className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
            >
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1">
                  {/* Header: avatar + info do usuário */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-bitcoin to-orange-600 rounded-full flex items-center justify-center text-black font-bold text-xl flex-shrink-0">
                      {boleto.user?.name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-white mb-1">{boleto.user?.name || 'Usuário'}</h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {boleto.user?.email || 'N/A'}
                        </span>
                        {boleto.user?.telegram && (
                          <a
                            href={`https://t.me/${boleto.user.telegram.replace(/^@/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                          >
                            <Send className="w-4 h-4" />
                            @{boleto.user.telegram.replace(/^@/, '')}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(boleto.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Breakdown financeiro */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-900/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Valor original</p>
                      <p className="text-base font-bold text-white">R$ {boleto.amount.toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Taxa cobrada</p>
                      <p className="text-base font-bold text-yellow-400">R$ {(boleto.fee ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Lucro admin</p>
                      {(() => {
                        const cost = boleto.amount * 0.01 + 0.99;
                        const profit = (boleto.fee ?? 0) - cost;
                        return (
                          <p className={`text-base font-bold ${profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            R$ {profit.toFixed(2)}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="bg-gray-900/50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">Total enviado</p>
                      <p className="text-base font-bold text-bitcoin">R$ {boleto.totalAmount.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Código de barras ou PDF */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {boleto.barcode && (
                      <div className="bg-gray-900/50 rounded-xl p-4">
                        <p className="text-xs text-gray-400 mb-1">Código de Barras</p>
                        <p className="text-sm text-white break-all font-mono">
                          {boleto.barcode}
                        </p>
                      </div>
                    )}

                    {boleto.pdfUrl && (
                      <div className="bg-gray-900/50 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between text-gray-400 text-sm">
                          <span>PDF do Boleto</span>
                          <button
                            onClick={() => window.open(boleto.pdfUrl as string, '_blank')}
                            className="text-bitcoin hover:underline text-xs"
                          >
                            Abrir PDF
                          </button>
                        </div>
                        {boleto.pdfPassword && (
                          <p className="text-xs text-gray-300">
                            <span className="font-semibold">Senha:</span>{' '}
                            <span className="font-mono">{boleto.pdfPassword}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {boleto.txid && (
                    <div className="mb-4 bg-gray-900/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
                        <Shield className="w-4 h-4" />
                        <span>TXID</span>
                      </div>
                      <code className="text-bitcoin font-mono text-sm break-all">
                        {boleto.txid}
                      </code>
                    </div>
                  )}

                  {/* Botões de contato + comprovante */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700/50">
                    <button
                      onClick={() => setEmailModal({ userId: boleto.user.id, userName: boleto.user.name, userEmail: boleto.user.email })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 text-sm transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      E-mail
                    </button>
                    <button
                      onClick={() => setPushModal({ userId: boleto.user.id, userName: boleto.user.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 text-sm transition-colors"
                    >
                      <Bell className="w-4 h-4" />
                      Push
                    </button>
                    <button
                      onClick={() => setTab('support')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 text-sm transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Suporte
                    </button>
                    {boleto.receiptUrl && (
                      <a
                        href={boleto.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-sm transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Comprovante
                      </a>
                    )}
                  </div>
                </div>

                {boleto.status === 'PENDING' && (
                  <div className="flex flex-col gap-3 min-w-[260px]">
                    {uploadingId === boleto.id ? (
                      <div className="space-y-3">
                        <div className="text-sm text-gray-300">
                          Envie o comprovante de pagamento em PDF ou imagem.
                        </div>
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          onChange={(e) =>
                            setReceiptFiles((prev) => ({
                              ...prev,
                              [boleto.id]: e.target.files?.[0] || null,
                            }))
                          }
                          className="w-full text-xs text-gray-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-green-500/20 file:text-green-400 hover:file:bg-green-500/30"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirmApprove(boleto.id)}
                            disabled={actionLoading}
                            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-xl hover:shadow-2xl hover:shadow-green-500/50 disabled:opacity-50 transition-all text-sm"
                          >
                            {actionLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                Confirmar
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setUploadingId(null);
                              setReceiptFiles((prev) => ({ ...prev, [boleto.id]: null }));
                            }}
                            className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm hover:bg-gray-600"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleApprove(boleto.id)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3 px-6 rounded-xl hover:shadow-2xl hover:shadow-green-500/50 disabled:opacity-50 transition-all"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                          Aprovar manual
                        </button>

                        <button
                          onClick={() => handleReject(boleto.id)}
                          disabled={actionLoading}
                          className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
                        >
                          <XCircle className="w-5 h-5" />
                          Rejeitar
                        </button>
                      </>
                    )}
                  </div>
                )}

                {boleto.status === 'PAID' && (
                  <div className="flex items-center justify-center min-w-[200px]">
                    <div className="text-center">
                      <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-2" />
                      <p className="text-green-400 font-bold">Aprovado</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      </>
      )}

      {tab === 'recargas' && (
        <>
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-4 border border-gray-700/50 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-2">
                {['PENDING', 'PROCESSING', 'PAID', 'ALL'].map((f) => (
                  <button
                    key={f}
                    onClick={() => { setRechargeFilter(f); loadRecharges(f); }}
                    className={`px-4 py-2 rounded-xl font-medium transition-all ${
                      rechargeFilter === f
                        ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                        : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {f === 'PENDING' ? '⏳ Aguardando' : f === 'PROCESSING' ? '🔄 Processando' : f === 'PAID' ? '✅ Pagas' : '📋 Todas'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => loadRecharges()}
                disabled={rechargesLoading}
                className="text-sm text-gray-400 hover:text-white disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>
          </div>
          {rechargesError && (
            <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-between gap-4">
              <span>{rechargesError}</span>
              <button type="button" onClick={() => loadRecharges()} className="text-sm font-medium hover:underline">Tentar novamente</button>
            </div>
          )}
          {rechargesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {recharges.length === 0 ? (
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
                  <Smartphone className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhuma recarga</h3>
                  <p className="text-gray-500">Não há recargas com esse filtro</p>
                </div>
              ) : (
                recharges.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 flex flex-col lg:flex-row gap-4 justify-between items-start"
                  >
                    <div className="flex-1">
                      {/* Header: operadora + usuário */}
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <Smartphone className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-white">{rec.operator}</span>
                            <span className="text-gray-400">—</span>
                            <span className="text-white font-mono">{rec.phoneNumber}</span>
                          </div>
                          {rec.user && (
                            <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {rec.user.name} • {rec.user.email}
                              </span>
                              {rec.user.telegram && (
                                <a
                                  href={`https://t.me/${rec.user.telegram.replace(/^@/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                                >
                                  <Send className="w-3 h-3" />
                                  @{rec.user.telegram.replace(/^@/, '')}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(rec.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Breakdown financeiro */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-xs text-gray-400 mb-1">Valor original</p>
                          <p className="text-base font-bold text-white">R$ {rec.amount?.toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-xs text-gray-400 mb-1">Taxa cobrada</p>
                          <p className="text-base font-bold text-yellow-400">R$ {(rec.fee ?? 0).toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Lucro admin</p>
                          {(() => {
                            const cost = (rec.amount ?? 0) * 0.02 + 0.99;
                            const profit = (rec.fee ?? 0) - cost;
                            return (
                              <p className={`text-base font-bold ${profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                R$ {profit.toFixed(2)}
                              </p>
                            );
                          })()}
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-xs text-gray-400 mb-1">Total enviado</p>
                          <p className="text-base font-bold text-bitcoin">R$ {rec.totalAmount?.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* TXID da recarga */}
                      {rec.txid && (
                        <div className="mb-4 bg-gray-900/50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                              <Shield className="w-4 h-4" />
                              <span>TXID</span>
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(rec.txid).catch(() => {});
                              }}
                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                              title="Copiar TXID"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              Copiar
                            </button>
                          </div>
                          <code className="text-bitcoin font-mono text-sm break-all block">{rec.txid}</code>
                        </div>
                      )}

                      {/* Botões de contato + comprovante */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-700/50">
                        {rec.user?.id && (
                          <>
                            <button
                              onClick={() => setEmailModal({ userId: rec.user.id, userName: rec.user.name, userEmail: rec.user.email })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 text-sm transition-colors"
                            >
                              <Mail className="w-4 h-4" />
                              E-mail
                            </button>
                            <button
                              onClick={() => setPushModal({ userId: rec.user.id, userName: rec.user.name })}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 text-sm transition-colors"
                            >
                              <Bell className="w-4 h-4" />
                              Push
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setTab('support')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 text-sm transition-colors"
                        >
                          <MessageSquare className="w-4 h-4" />
                          Suporte
                        </button>
                        {rec.receiptUrl && (
                          <a
                            href={rec.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 text-sm transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            Comprovante
                          </a>
                        )}
                      </div>
                    </div>
                    {rec.status === 'PENDING' && (
                      <div className="flex flex-col gap-3 min-w-[260px]">
                        {uploadingRechargeId === rec.id ? (
                          <div className="space-y-3">
                            <div className="text-sm text-gray-300">
                              Envie o comprovante de liquidação (PDF ou imagem).
                            </div>
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              onChange={(e) =>
                                setReceiptFilesRecharge((prev) => ({
                                  ...prev,
                                  [rec.id]: e.target.files?.[0] || null,
                                }))
                              }
                              className="w-full text-xs text-gray-300 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-green-500/20 file:text-green-400 hover:file:bg-green-500/30"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleConfirmApproveRecharge(rec.id)}
                                disabled={actionLoading}
                                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-xl hover:shadow-2xl hover:shadow-green-500/50 disabled:opacity-50 transition-all text-sm"
                              >
                                {actionLoading ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                                ) : (
                                  <><CheckCircle2 className="w-4 h-4" /> Confirmar</>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setUploadingRechargeId(null);
                                  setReceiptFilesRecharge((prev) => ({ ...prev, [rec.id]: null }));
                                }}
                                className="px-4 py-2 rounded-xl bg-gray-700 text-white text-sm hover:bg-gray-600"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => handleApproveRecharge(rec.id)}
                              disabled={actionLoading}
                              className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-xl hover:shadow-lg disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Aprovar (com comprovante)
                            </button>
                            <button
                              onClick={() => window.confirm('Tem certeza que deseja reprovar esta recarga? Ela será cancelada.') && handleRejectRecharge(rec.id)}
                              disabled={actionLoading}
                              className="flex items-center justify-center gap-2 bg-red-500/20 text-red-400 font-semibold py-2 px-4 rounded-xl hover:bg-red-500/30 disabled:opacity-50 border border-red-500/50"
                            >
                              <XCircle className="w-4 h-4" /> Reprovar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {rec.status === 'PROCESSING' && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">🔄 Processando</span>
                      </div>
                    )}
                    {rec.status === 'PAID' && (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">Pago</span>
                        {rec.receiptUrl && (
                          <a
                            href={rec.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-bitcoin hover:underline"
                          >
                            Ver comprovante
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 mb-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-xl">
                  <Globe className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Usuários & Segurança</h2>
                  <p className="text-gray-400 text-sm">
                    Monitore IPs, localização, VPN e limites de cada usuário.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value as 'all' | 'USER' | 'COMMERCE' | 'AFFILIATE')}
                  className="px-3 py-2 bg-gray-900/50 rounded-xl border border-gray-700 text-sm text-white"
                >
                  <option value="all">Todos</option>
                  <option value="USER">Pessoal</option>
                  <option value="COMMERCE">Comerciantes</option>
                  <option value="AFFILIATE">Afiliados</option>
                </select>
                <input
                  type="text"
                  placeholder="Buscar por nome, email ou @telegram"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="flex-1 min-w-[180px] md:w-72 px-3 py-2 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-sm text-white"
                />
                <button
                  onClick={loadUsers}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-medium"
                >
                  Atualizar
                </button>
              </div>
            </div>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
              <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum usuário encontrado</h3>
              <p className="text-gray-500">Ajuste o filtro de busca ou tente novamente.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-bitcoin to-orange-600 rounded-full flex items-center justify-center text-black font-bold text-xl">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-white truncate">{u.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              u.role === 'COMMERCE'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : u.role === 'AFFILIATE'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                : 'border border-gray-600 text-gray-300'
                            }`}>
                              {u.role === 'COMMERCE' ? 'Comerciante' : u.role === 'AFFILIATE' ? 'Afiliado' : 'Pessoal'}
                            </span>
                            {u.commercePartner && (
                              <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                                u.commercePartner.status === 'APPROVED'
                                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                                  : u.commercePartner.status === 'REJECTED'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                              }`}>
                                {u.commercePartner.status === 'APPROVED' ? 'Aprovado' : u.commercePartner.status === 'REJECTED' ? 'Rejeitado' : u.commercePartner.status === 'AWAITING_DEPOSIT' ? 'Aguardando Deposito' : u.commercePartner.status === 'SUSPENDED' ? 'Suspenso' : 'Pendente'}
                              </span>
                            )}
                            {u.commercePartner && (
                              <span className="text-xs text-gray-500">
                                {u.commercePartner.businessType} · {u.commercePartner.documentType}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          <p className="text-xs text-gray-400 truncate">{u.telegram}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-gray-900/50 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                            <DollarSign className="w-3 h-3" />
                            <span>Total Pago</span>
                          </div>
                          <p className="text-lg font-bold text-white">
                            R$ {u.totalPaid.toFixed(2)}
                          </p>
                        </div>

                        <div className="bg-gray-900/50 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                            <Calendar className="w-3 h-3" />
                            <span>Último Login</span>
                          </div>
                          <p className="text-sm text-white">
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString('pt-BR')
                              : 'Nunca'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-900/50 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                            <Globe className="w-3 h-3" />
                            <span>IP & Localização</span>
                          </div>
                          <p className="text-xs text-white break-all">
                            IP: {u.lastLoginIp || 'Desconhecido'}
                          </p>
                          <p className="text-xs text-gray-300">
                            {u.lastLoginCity || u.lastLoginCountry
                              ? `${u.lastLoginCity || ''}${
                                  u.lastLoginCity && u.lastLoginCountry ? ' - ' : ''
                                }${u.lastLoginCountry || ''}`
                              : 'Localização não disponível'}
                          </p>
                          {u.lastLoginIsVpn && (
                            <p className="mt-1 text-xs text-red-400 flex items-center gap-1">
                              <Ban className="w-3 h-3" /> VPN detectada no último acesso
                            </p>
                          )}
                        </div>

                        <div className="bg-gray-900/50 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                            <Shield className="w-3 h-3" />
                            <span>Status</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span
                              className={`px-2 py-1 rounded-full ${
                                u.isActive
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/40'
                                  : 'bg-gray-500/10 text-gray-300 border border-gray-500/40'
                              }`}
                            >
                              {u.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-full ${
                                u.isBlocked
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                                  : 'bg-gray-500/10 text-gray-300 border border-gray-500/40'
                              }`}
                            >
                              {u.isBlocked ? 'Bloqueado' : 'Liberado'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[220px]">
                      <button
                        onClick={() => handleUserAction(u.id, u.isBlocked ? 'unblock' : 'block')}
                        className={`flex items-center justify-center gap-2 font-medium py-2 px-4 rounded-xl text-sm ${
                          u.isBlocked
                            ? 'bg-green-600 hover:bg-green-500 text-white'
                            : 'bg-red-600 hover:bg-red-500 text-white'
                        }`}
                      >
                        <Ban className="w-4 h-4" />
                        {u.isBlocked ? 'Desbloquear' : 'Bloquear'}
                      </button>

                      {u.commercePartner && ['PENDING', 'AWAITING_DEPOSIT'].includes(u.commercePartner.status) && (
                        <>
                          <button
                            onClick={() => handleCommerceAction(u.id, 'approve_commerce')}
                            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-medium py-2 px-4 rounded-xl text-sm"
                          >
                            <ThumbsUp className="w-4 h-4" />
                            Aprovar Comércio
                          </button>
                          <button
                            onClick={() => handleCommerceAction(u.id, 'reject_commerce')}
                            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-xl text-sm"
                          >
                            <ThumbsDown className="w-4 h-4" />
                            Rejeitar Comércio
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleUserAction(u.id, 'delete')}
                        className="flex items-center justify-center gap-2 bg-gray-700 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-xl text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        Excluir
                      </button>

                      {u.role !== 'AFFILIATE' && (
                        <button
                          onClick={() => {
                            setAffiliateModalUser(u);
                            setAffiliateDiscount('20');
                            setAffiliateCommission('20');
                            setAffiliateCouponCode('');
                            setAffiliateMaxUsage('');
                            setAffiliateUnlimitedUsage(true);
                          }}
                          className="flex items-center justify-center gap-2 bg-bitcoin/20 hover:bg-bitcoin/30 text-bitcoin font-medium py-2 px-4 rounded-xl text-sm"
                        >
                          <Star className="w-4 h-4" />
                          Tornar Afiliado
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba Comerciantes */}
      {tab === 'commerce' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-500/10 rounded-xl">
                  <DollarSign className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Comerciantes</h2>
                  <p className="text-gray-400 text-sm">Métricas de faturamento e lucro de todos os comerciantes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateTrustedMerchant(true);
                  setTrustedError('');
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-medium text-sm hover:shadow-lg hover:shadow-bitcoin/30 transition-all shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                Criar conta de comerciante para terceiros
              </button>
            </div>
          </div>

          {merchantsLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : merchants.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
              <DollarSign className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum comerciante cadastrado</h3>
              <p className="text-gray-500">Aguardando cadastros de comerciantes no sistema.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Totalizadores */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
                  <p className="text-gray-400 text-xs mb-1">Faturamento Total</p>
                  <p className="text-2xl font-bold text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      merchants.reduce((sum, m) => sum + m.metrics.grossRevenue, 0)
                    )}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
                  <p className="text-gray-400 text-xs mb-1">Taxas Totais</p>
                  <p className="text-2xl font-bold text-white">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      merchants.reduce((sum, m) => sum + m.metrics.totalFees, 0)
                    )}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-xl p-4 border border-green-500/20">
                  <p className="text-gray-400 text-xs mb-1">Lucro PagDepix (0,3%)</p>
                  <p className="text-2xl font-bold text-green-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      merchants.reduce((sum, m) => sum + m.metrics.pagdepixProfit, 0)
                    )}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
                  <p className="text-gray-400 text-xs mb-1">Total Pagamentos</p>
                  <p className="text-2xl font-bold text-white">
                    {merchants.reduce((sum, m) => sum + m.metrics.totalPayments, 0)}
                  </p>
                </div>
              </div>

              {/* Lista de comerciantes */}
              {merchants.map((merchant) => (
                <div
                  key={merchant.partnerId}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="text-lg font-bold text-white">{merchant.businessName}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wide border border-green-500/50 text-green-400">
                          Comerciante
                        </span>
                        {merchant.createdByAdmin && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] border border-amber-500/50 text-amber-400 bg-amber-500/10">
                            Criada pelo admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{merchant.userName} • {merchant.userEmail}</p>
                      <p className="text-xs text-gray-400">CNPJ/CPF: {merchant.cnpj}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Cadastrado em: {new Date(merchant.createdAt).toLocaleDateString('pt-BR')}
                      </p>

                      {/* Métricas */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Faturamento Bruto</p>
                          <p className="font-bold text-white">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(merchant.metrics.grossRevenue)}
                          </p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Taxas Pagas</p>
                          <p className="font-bold text-orange-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(merchant.metrics.totalFees)}
                          </p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Lucro PagDepix</p>
                          <p className="font-bold text-green-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(merchant.metrics.pagdepixProfit)}
                          </p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Total Pagamentos</p>
                          <p className="font-bold text-bitcoin">{merchant.metrics.totalPayments}</p>
                        </div>
                      </div>

                      {/* Taxas atuais */}
                      <div className="mt-4 p-3 bg-gray-900/30 rounded-xl border border-gray-700/50">
                        <p className="text-gray-400 text-xs mb-2">Taxas Aplicadas</p>
                        <div className="flex items-center gap-2 text-sm">
                          {merchant.useCustomFees ? (
                            <span className="text-orange-400 font-semibold">
                              Personalizado: R$ {merchant.customFixedFee?.toFixed(2)} + {merchant.customVariablePercent}%
                            </span>
                          ) : (
                            <span className="text-gray-300">
                              Padrão: R$ 0,99 + 0,5%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botão Editar Taxas */}
                      <button
                        onClick={() => openFeesModal(merchant)}
                        className="mt-4 w-full px-4 py-2 rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/30 transition-all"
                      >
                        Editar Taxas
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'marketplace' && <AdminMarketplace />}
      {tab === 'affiliates' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="p-3 bg-bitcoin/10 rounded-xl flex-shrink-0">
                  <Star className="w-6 h-6 text-bitcoin" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Afiliados</h2>
                  <p className="text-gray-400 text-sm">Lista de afiliados. Cadastro manual; pode remover afiliação a qualquer momento.</p>
                </div>
              </div>
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar por nome, email ou cupom..."
                  value={affiliateSearch}
                  onChange={(e) => setAffiliateSearch(e.target.value)}
                  className="w-full bg-gray-900/60 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-bitcoin"
                />
              </div>
            </div>
          </div>

          {affiliatesLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : affiliates.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-12 border border-gray-700/50 text-center">
              <Star className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">Nenhum afiliado</h3>
              <p className="text-gray-500 mb-4">Torne usuários afiliados pela aba Usuários (botão &quot;Tornar afiliado&quot; na lista).</p>
              <button
                type="button"
                onClick={() => loadAffiliates()}
                className="px-4 py-2 rounded-xl bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
              >
                Recarregar lista
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {affiliates
                .filter((a) => {
                  if (!affiliateSearch.trim()) return true;
                  const q = affiliateSearch.toLowerCase();
                  return (
                    a.user.name.toLowerCase().includes(q) ||
                    a.user.email.toLowerCase().includes(q) ||
                    a.couponCode.toLowerCase().includes(q)
                  );
                })
                .map((a) => (
                <div
                  key={a.id}
                  className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <h3 className="text-lg font-bold text-white">{a.user.name}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[11px] uppercase tracking-wide border border-bitcoin/50 text-bitcoin">
                          Afiliado
                        </span>
                        {!a.isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-red-500/20 text-red-400">Inativo</span>
                        )}
                        {(a.apiStatus || (a.apiKeysCount && a.apiKeysCount > 0)) && (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] border ${apiStatusBadgeColor(a.apiStatus)}`}>
                            {apiStatusLabel(a.apiStatus)}
                          </span>
                        )}
                        {a.apiKeysCount != null && a.apiKeysCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {a.apiKeysCount} chave{a.apiKeysCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{a.user.email}</p>
                      <p className="text-xs text-gray-400">{a.user.telegram}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Cupom</p>
                          <p className="font-mono font-bold text-bitcoin">{a.couponCode}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Usos</p>
                          <p className="font-bold text-white">{a.coupons[0]?.usageCount ?? 0}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Saldo</p>
                          <p className={`font-bold ${a.balance > 0 ? 'text-green-400' : 'text-white'}`}>R$ {a.balance.toFixed(2)}</p>
                        </div>
                        <div className="bg-gray-900/50 rounded-xl p-3">
                          <p className="text-gray-400 text-xs mb-1">Total ganho</p>
                          <p className="font-bold text-white">R$ {a.totalEarned.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Breakdown de ganhos: cupom vs API (histórico completo) */}
                      {a.earningsSummary && (a.earningsSummary.coupon > 0 || a.earningsSummary.api > 0 || a.earningsSummary.recharge > 0) && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-blue-400 mb-0.5">Via Cupom</p>
                            <p className="text-sm font-bold text-white">R$ {a.earningsSummary.coupon.toFixed(2)}</p>
                          </div>
                          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-green-400 mb-0.5">Via API</p>
                            <p className="text-sm font-bold text-white">R$ {a.earningsSummary.api.toFixed(2)}</p>
                          </div>
                          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-purple-400 mb-0.5">Recargas</p>
                            <p className="text-sm font-bold text-white">R$ {a.earningsSummary.recharge.toFixed(2)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      {a.balance > 0 && (
                        <button
                          onClick={() => {
                            setPayCommissionAffiliate(a);
                            setPayCommissionAmount(a.balance.toFixed(2));
                            setPayCommissionTxid('');
                            setPayCommissionNotes('');
                            setPayCommissionFile(null);
                            setPayCommissionError('');
                          }}
                          className="flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 font-medium py-2 px-4 rounded-xl text-sm"
                        >
                          <Banknote className="w-4 h-4" />
                          Pagar comissão
                        </button>
                      )}
                      <button
                        onClick={() => openApiModal(a)}
                        className="flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-600/30 font-medium py-2 px-4 rounded-xl text-sm"
                      >
                        <Globe className="w-4 h-4" />
                        Gerenciar API
                      </button>
                      <button
                        onClick={() => handleRemoveAffiliate(a.user.id)}
                        className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-4 rounded-xl text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        Remover afiliação
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal Pagar Comissão */}
          {payCommissionAffiliate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-lg font-bold text-white">Pagar comissão</h3>
                    <p className="text-sm text-gray-400">{payCommissionAffiliate.user.name}</p>
                  </div>
                  <button onClick={() => setPayCommissionAffiliate(null)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payCommissionAmount}
                      onChange={(e) => setPayCommissionAmount(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-bitcoin"
                      placeholder={payCommissionAffiliate.balance.toFixed(2)}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Saldo atual: R$ {payCommissionAffiliate.balance.toFixed(2)}</p>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">TXID (opcional)</label>
                    <input
                      type="text"
                      value={payCommissionTxid}
                      onChange={(e) => setPayCommissionTxid(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-bitcoin"
                      placeholder="Hash da transação..."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Observações (opcional)</label>
                    <textarea
                      value={payCommissionNotes}
                      onChange={(e) => setPayCommissionNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-bitcoin resize-none"
                      placeholder="Notas adicionais..."
                    />
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Comprovante (opcional)</label>
                    {payCommissionFile ? (
                      <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-xl border border-gray-600">
                        <Upload className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-xs text-gray-300 truncate flex-1">{payCommissionFile.name}</span>
                        <button type="button" onClick={() => setPayCommissionFile(null)} className="text-gray-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 p-2 bg-gray-800 border border-dashed border-gray-600 rounded-xl cursor-pointer hover:border-gray-500">
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-xs text-gray-500">Selecionar comprovante...</span>
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setPayCommissionFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </div>

                  {payCommissionError && (
                    <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{payCommissionError}</p>
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setPayCommissionAffiliate(null)}
                    className="flex-1 py-2 rounded-xl border border-gray-600 text-gray-400 text-sm hover:bg-gray-800"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePayCommission}
                    disabled={payCommissionLoading || !payCommissionAmount}
                    className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {payCommissionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                    Confirmar pagamento
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aba Estatísticas — financeiro e contabilidade */}
      {tab === 'stats' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-bitcoin/10 rounded-xl">
              <GaugeCircle className="w-6 h-6 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Estatísticas e Financeiro</h2>
              <p className="text-gray-400 text-sm">Visão geral para contabilidade: faturado, comissões, descontos, custos e lucro.</p>
            </div>
          </div>

          {metricsLoading ? (
            <div className="flex justify-center h-32">
              <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
            </div>
          ) : metrics && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 backdrop-blur-xl rounded-xl p-4 border border-green-500/30">
                <p className="text-green-400 text-xs font-medium mb-1">Total Faturado (taxas)</p>
                <p className="text-xl font-bold text-white">R$ {metrics.totalFaturado.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 backdrop-blur-xl rounded-xl p-4 border border-blue-500/30">
                <p className="text-blue-400 text-xs font-medium mb-1">Comissões (afiliados)</p>
                <p className="text-xl font-bold text-white">R$ {metrics.totalComissoes.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 backdrop-blur-xl rounded-xl p-4 border border-yellow-500/30">
                <p className="text-yellow-400 text-xs font-medium mb-1">Descontos concedidos</p>
                <p className="text-xl font-bold text-white">R$ {metrics.totalDescontos.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 backdrop-blur-xl rounded-xl p-4 border border-red-500/30">
                <p className="text-red-400 text-xs font-medium mb-1">Custos operacionais</p>
                <p className="text-xl font-bold text-white">R$ {metrics.custosOperacionais.toFixed(2).replace('.', ',')}</p>
              </div>
              <div className={`backdrop-blur-xl rounded-xl p-4 border ${metrics.isLucrativo ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30' : 'bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/30'}`}>
                <p className={`text-xs font-medium mb-1 ${metrics.isLucrativo ? 'text-emerald-400' : 'text-red-400'}`}>Lucro líquido</p>
                <p className="text-xl font-bold text-white">R$ {metrics.lucro.toFixed(2).replace('.', ',')}</p>
                <p className="text-xs text-gray-400 mt-1">{metrics.isLucrativo ? 'Operação lucrativa' : 'Prejuízo'}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 backdrop-blur-xl rounded-xl p-6 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8 text-yellow-400" />
                <span className="text-3xl font-bold text-white">{stats.pending}</span>
              </div>
              <p className="text-yellow-400 font-medium">Boletos pendentes</p>
            </div>
            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 backdrop-blur-xl rounded-xl p-6 border border-green-500/30">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
                <span className="text-3xl font-bold text-white">{stats.paid}</span>
              </div>
              <p className="text-green-400 font-medium">Boletos aprovados</p>
            </div>
            <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 backdrop-blur-xl rounded-xl p-6 border border-red-500/30">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle className="w-8 h-8 text-red-400" />
                <span className="text-3xl font-bold text-white">{stats.problem}</span>
              </div>
              <p className="text-red-400 font-medium">Problemas</p>
            </div>
            <div className="bg-gradient-to-br from-bitcoin/10 to-orange-500/5 backdrop-blur-xl rounded-xl p-6 border border-bitcoin/30">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-8 h-8 text-bitcoin" />
                <span className="text-2xl font-bold text-white">R$ {stats.totalValue.toFixed(2)}</span>
              </div>
              <p className="text-bitcoin font-medium">Total processado (boletos)</p>
            </div>
          </div>
        </div>
      )}

      {/* Aba Atendimento / Suporte */}
      {tab === 'support' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-xl">
              <MessageSquare className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Atendimento</h2>
              <p className="text-gray-400 text-sm">Tickets de suporte e chat com clientes.</p>
            </div>
          </div>

          {!supportTicketDetail ? (
            <>
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 flex flex-wrap gap-2 items-center">
                <span className="text-gray-400 text-sm">Filtro:</span>
                {['ALL', 'OPEN', 'IN_PROGRESS', 'RESOLVED'].map((f) => (
                  <button
                    key={f}
                    onClick={() => { setSupportFilter(f); loadSupportTickets(); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                      supportFilter === f ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {f === 'ALL' ? 'Todos' : f === 'OPEN' ? 'Abertos' : f === 'IN_PROGRESS' ? 'Em andamento' : 'Resolvidos'}
                  </button>
                ))}
                <input
                  type="text"
                  placeholder="Buscar por nome, email ou Telegram..."
                  value={supportSearch}
                  onChange={(e) => setSupportSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadSupportTickets()}
                  className="ml-2 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm w-64 max-w-full"
                />
                <button
                  type="button"
                  onClick={() => loadSupportTickets()}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-200 text-sm hover:bg-gray-600"
                >
                  Buscar
                </button>
              </div>

              {supportLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : supportTickets.length === 0 ? (
                <div className="bg-gray-800/50 rounded-xl p-8 border border-gray-700/50 text-center text-gray-400">
                  Nenhum ticket encontrado.
                </div>
              ) : (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
                  <ul className="divide-y divide-gray-700/50">
                    {supportTickets.map((t: any) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => loadSupportTicketDetail(t.id)}
                          className="w-full text-left p-4 hover:bg-gray-700/30 transition-colors flex flex-wrap items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white truncate">{t.user?.name} — {t.user?.email}</p>
                            <p className="text-xs text-gray-400 truncate">{t.user?.telegram}</p>
                            {t.lastMessage && (
                              <p className="text-sm text-gray-500 mt-1 truncate">{t.lastMessage.content}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              t.status === 'OPEN' ? 'bg-amber-500/20 text-amber-400' :
                              t.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-600 text-gray-400'
                            }`}>
                              {t.status === 'OPEN' ? 'Aberto' : t.status === 'IN_PROGRESS' ? 'Em andamento' : 'Resolvido'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {t.updatedAt ? new Date(t.updatedAt).toLocaleString('pt-BR') : ''}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
              <div className="p-4 border-b border-gray-700/50 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-white">{supportTicketDetail.user?.name}</p>
                  <p className="text-sm text-gray-400">{supportTicketDetail.user?.email} • {supportTicketDetail.user?.telegram}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={supportTicketDetail.status}
                    onChange={(e) => handleSupportStatusChange(supportTicketDetail.id, e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                  >
                    <option value="OPEN">Aberto</option>
                    <option value="IN_PROGRESS">Em andamento</option>
                    <option value="RESOLVED">Resolvido</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => { setSupportTicketDetail(null); loadSupportTickets(); loadSupportCounts(); }}
                    className="px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 text-sm hover:bg-gray-600"
                  >
                    ← Voltar
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto space-y-3">
                {(supportTicketDetail.messages || []).map((m: any) => (
                  <div key={m.id} className={`flex ${m.isStaff ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded-xl px-4 py-2 ${
                      m.isStaff ? 'bg-gray-700/50 text-gray-100' : 'bg-blue-500/90 text-white'
                    }`}>
                      {m.isStaff && <p className="text-xs text-blue-300 mb-0.5">Atendente</p>}
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={`text-xs mt-1 ${m.isStaff ? 'text-gray-400' : 'text-blue-200'}`}>
                        {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {supportTicketDetail.status !== 'RESOLVED' && (
                <form onSubmit={handleSupportSendMessage} className="p-4 border-t border-gray-700/50 flex gap-2">
                  <input
                    type="text"
                    value={supportMessageInput}
                    onChange={(e) => setSupportMessageInput(e.target.value)}
                    placeholder="Digite sua resposta..."
                    maxLength={5000}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-600 text-white placeholder-gray-500 text-sm"
                    disabled={supportSending}
                  />
                  <button
                    type="submit"
                    disabled={supportSending || !supportMessageInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium disabled:opacity-50 flex items-center gap-2"
                  >
                    {supportSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'comunicacoes' && <AdminCommunications />}

      {tab === 'bot' && <AdminBot />}

      {tab === 'pixCopiaCola' && <AdminPixCopiaCola />}

      {/* Aba Configurações — manutenção e carteira */}
      {tab === 'config' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-bitcoin/10 rounded-xl">
              <Wrench className="w-6 h-6 text-bitcoin" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Configurações</h2>
              <p className="text-gray-400 text-sm">Modo manutenção e carteira Liquid.</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
            <h3 className="text-lg font-bold text-white mb-2">Modo manutenção</h3>
            <p className="text-sm text-gray-400 mb-4">
              Quando ativo, novos cadastros e login de usuários/afiliados são bloqueados. Apenas administradores acessam o sistema.
            </p>
            <div className="flex items-center gap-4 flex-wrap">
              {maintenanceActive ? (
                <button
                  onClick={() => {
                    if (window.confirm('Desativar modo manutenção? O sistema voltará ao normal para todos os usuários.')) {
                      handleSetMaintenance(false);
                    }
                  }}
                  disabled={maintenanceLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 font-medium text-sm disabled:opacity-50"
                >
                  <Wrench className="w-4 h-4" />
                  Desativar modo manutenção
                </button>
              ) : (
                <button
                  onClick={() => setMaintenanceModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600 font-medium text-sm"
                >
                  <Wrench className="w-4 h-4" />
                  Ativar modo manutenção
                </button>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
            <h3 className="text-lg font-bold text-white mb-2">Carteira Liquid</h3>
            <p className="text-sm text-gray-400 mb-4">
              Configure o endereço da chave Liquid (Depix) e o QR Code usados nos pagamentos.
            </p>
            <a
              href="/admin/carteira"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-bitcoin/20 text-bitcoin border border-bitcoin/40 hover:bg-bitcoin/30 font-medium text-sm"
            >
              <Globe className="w-4 h-4" />
              Abrir configuração da Carteira
            </a>
          </div>
        </div>
      )}

      {tab === 'audit' && <AdminAudit />}
      {tab === 'sendPix' && <AdminSendPixAudit />}

      {tab === 'swapRefunds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-bitcoin" />
              Reembolsos de Swap Pendentes
            </h2>
            <button onClick={loadSwapRefunds} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${swapRefundsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {swapRefundsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-bitcoin animate-spin" /></div>
          ) : swapRefunds.length === 0 ? (
            <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700/50">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-gray-400">Nenhum reembolso pendente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {swapRefunds.map((sw: any) => {
                const isPending = sw.status === 'failed';
                const isProcessing = swapRefundProcessing === sw.id;
                return (
                  <div key={sw.id} className={`bg-gray-800/50 rounded-xl border p-4 space-y-3 ${isPending ? 'border-yellow-500/30' : 'border-green-500/20'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${isPending ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'}`}>
                        {isPending ? '⏳ Aguardando processamento' : '✅ Reembolsado'}
                      </span>
                      <span className="text-xs text-gray-500">{new Date(sw.refundRequestAt || sw.createdAt).toLocaleString('pt-BR')}</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-gray-500 mb-0.5">Usuário</p>
                        <p className="text-white">{sw.user?.name || sw.userId}</p>
                        <p className="text-gray-500">{sw.user?.email}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 mb-0.5">Valor</p>
                        <p className="text-white font-semibold">{sw.depositAmount ? `${sw.depositAmount} ${sw.depositAsset}` : sw.depositAsset}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-gray-500 mb-0.5">Endereço de reembolso</p>
                        <p className="text-white font-mono break-all">{sw.refundAddress}</p>
                      </div>
                      {sw.errorMessage && (
                        <div className="col-span-2 md:col-span-4">
                          <p className="text-gray-500 mb-0.5">Erro original</p>
                          <p className="text-red-400 text-xs">{sw.errorMessage}</p>
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="TXID da transação de reembolso (opcional)"
                          value={swapRefundTxid[sw.id] || ''}
                          onChange={e => setSwapRefundTxid(prev => ({ ...prev, [sw.id]: e.target.value }))}
                          className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-bitcoin/40 font-mono"
                        />
                        <button
                          onClick={() => handleCompleteRefund(sw.id)}
                          disabled={isProcessing}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : '✓ Marcar como reembolsado'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal de gestão de integração API do afiliado */}
      {showApiModal && selectedAffiliate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-2xl border border-gray-700 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-gray-700/60 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedAffiliate.user.name}</h3>
                <p className="text-xs text-gray-400">{selectedAffiliate.user.email} — Integração API</p>
              </div>
              <button
                onClick={() => setShowApiModal(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-4 flex-shrink-0 flex-wrap">
              {(['status', 'keys', 'earnings', 'audit', 'users'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => loadApiModalTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    apiModalTab === t
                      ? 'bg-bitcoin text-black'
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {t === 'status' ? 'Status' : t === 'keys' ? 'API Keys' : t === 'earnings' ? 'Ganhos' : t === 'audit' ? 'Auditoria' : 'Usuários'}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {apiModalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-bitcoin" />
                </div>
              ) : (
                <>
                  {/* Aba Status */}
                  {apiModalTab === 'status' && (
                    <div className="space-y-5">
                      {/* Resumo atual */}
                      {apiIntegration?.apiConfig && (
                        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                          <p className="text-xs text-gray-400 mb-3">Status atual</p>
                          <div className="flex flex-wrap gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${apiStatusBadgeColor(apiIntegration.apiConfig.status)}`}>
                              {apiStatusLabel(apiIntegration.apiConfig.status)}
                            </span>
                            <span className="text-xs text-gray-400 self-center">
                              Limite diário por usuário: R$ {apiIntegration.apiConfig.globalDailyLimitPerUser?.toFixed(2)}
                            </span>
                          </div>
                          {apiIntegration.apiConfig.blockedAt && (
                            <p className="text-xs text-red-400 mt-2">
                              Bloqueado em {new Date(apiIntegration.apiConfig.blockedAt).toLocaleString('pt-BR')}
                              {apiIntegration.apiConfig.blockedReason && ` — ${apiIntegration.apiConfig.blockedReason}`}
                            </p>
                          )}
                          {apiIntegration.apiConfig.activatedAt && (
                            <p className="text-xs text-green-400 mt-1">
                              Ativado em {new Date(apiIntegration.apiConfig.activatedAt).toLocaleString('pt-BR')}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Alterar status */}
                      <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/40 space-y-3">
                        <p className="text-sm font-semibold text-white">Alterar status da integração</p>
                        <select
                          value={apiStatusUpdate}
                          onChange={(e) => setApiStatusUpdate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                        >
                          <option value="inactive">Inativo</option>
                          <option value="beta">Beta</option>
                          <option value="active">Ativo</option>
                          <option value="blocked">Bloqueado</option>
                        </select>
                        <input
                          type="text"
                          value={apiStatusReason}
                          onChange={(e) => setApiStatusReason(e.target.value)}
                          placeholder="Motivo (opcional, salvo no audit log)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500"
                        />
                        <button
                          onClick={handleApiStatusSave}
                          disabled={apiActionLoading}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
                        >
                          {apiActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                          Salvar status
                        </button>
                      </div>

                      {/* Alterar limite global */}
                      <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/40 space-y-3">
                        <p className="text-sm font-semibold text-white">Limite diário global por usuário final (R$)</p>
                        <input
                          type="number"
                          value={apiLimitUpdate}
                          onChange={(e) => setApiLimitUpdate(e.target.value)}
                          min={0}
                          step={50}
                          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm"
                        />
                        <input
                          type="text"
                          value={apiLimitReason}
                          onChange={(e) => setApiLimitReason(e.target.value)}
                          placeholder="Motivo (opcional)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-white text-sm placeholder-gray-500"
                        />
                        <button
                          onClick={handleApiLimitSave}
                          disabled={apiActionLoading}
                          className="px-4 py-2 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-600/40 text-sm font-semibold hover:bg-blue-600/40 disabled:opacity-50 flex items-center gap-2"
                        >
                          {apiActionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                          Salvar limite
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Aba API Keys */}
                  {apiModalTab === 'keys' && (
                    <div className="space-y-3">
                      {(!apiIntegration?.apiKeys || apiIntegration.apiKeys.length === 0) ? (
                        <div className="text-center text-gray-400 py-8">
                          <p>Nenhuma API Key cadastrada para este afiliado.</p>
                        </div>
                      ) : apiIntegration.apiKeys.map((key: any) => (
                        <div key={key.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <code className="text-bitcoin font-mono text-sm">{key.keyPrefix}…</code>
                                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${key.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {key.isActive ? 'Ativa' : 'Suspensa'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                                <span>{key.requestCount ?? 0} req</span>
                                {key.lastUsedAt && <span>Último uso: {new Date(key.lastUsedAt).toLocaleString('pt-BR')}</span>}
                                <span>Criada: {new Date(key.createdAt).toLocaleString('pt-BR')}</span>
                              </div>
                              {key.suspendedAt && (
                                <p className="text-xs text-red-400 mt-1">
                                  Suspensa em {new Date(key.suspendedAt).toLocaleString('pt-BR')}
                                  {key.suspendedReason && ` — ${key.suspendedReason}`}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {key.isActive ? (
                                <button
                                  onClick={() => handleSuspendApiKey(key.id)}
                                  disabled={apiActionLoading}
                                  className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 text-xs hover:bg-red-600/30 disabled:opacity-50"
                                >
                                  <Ban className="w-3.5 h-3.5 inline mr-1" />
                                  Suspender
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleReactivateApiKey(key.id)}
                                  disabled={apiActionLoading}
                                  className="px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 border border-green-600/30 text-xs hover:bg-green-600/30 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                                  Reativar
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Aba Ganhos */}
                  {apiModalTab === 'earnings' && (
                    <div className="space-y-4">
                      {!affiliateEarnings ? (
                        <div className="flex items-center justify-center py-10">
                          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-gray-400">Últimos 30 dias</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                              <p className="text-xs text-blue-400 mb-1">Via Cupom</p>
                              <p className="text-xl font-bold text-white">R$ {affiliateEarnings.coupon.total.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{affiliateEarnings.coupon.count} transações</p>
                            </div>
                            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                              <p className="text-xs text-green-400 mb-1">Via API (boleto)</p>
                              <p className="text-xl font-bold text-white">R$ {affiliateEarnings.api.total.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{affiliateEarnings.api.count} transações</p>
                            </div>
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
                              <p className="text-xs text-purple-400 mb-1">Recargas</p>
                              <p className="text-xl font-bold text-white">R$ {affiliateEarnings.recharge.total.toFixed(2)}</p>
                              <p className="text-xs text-gray-400">{affiliateEarnings.recharge.count} transações</p>
                            </div>
                            <div className="bg-bitcoin/10 border border-bitcoin/20 rounded-xl p-4">
                              <p className="text-xs text-bitcoin mb-1">Total (30d)</p>
                              <p className="text-xl font-bold text-white">R$ {affiliateEarnings.summary.totalEarnings.toFixed(2)}</p>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Aba Auditoria */}
                  {apiModalTab === 'audit' && (
                    <div className="space-y-2">
                      {affiliateAuditLog.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                          <p>Nenhuma ação registrada no audit log.</p>
                        </div>
                      ) : affiliateAuditLog.map((log: any) => (
                        <div key={log.id} className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{log.action?.replace(/_/g, ' ')}</p>
                              {log.details && (
                                <p className="text-xs text-gray-400 mt-0.5 truncate">
                                  {typeof log.details === 'object' ? JSON.stringify(log.details) : log.details}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-gray-500 flex-shrink-0">
                              {new Date(log.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          {log.userId && log.userId !== 'SYSTEM' && (
                            <p className="text-xs text-gray-500 mt-1">por {log.userId}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Aba Usuários da API */}
                  {apiModalTab === 'users' && (
                    <div className="space-y-3">
                      {affiliateApiUsers.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                          <p>Nenhum usuário final registrado ainda.</p>
                          <p className="text-xs mt-1">Os usuários aparecem após a primeira transação via API.</p>
                        </div>
                      ) : affiliateApiUsers.map((u) => (
                        <div key={u.id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/40">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-mono text-sm text-white">{u.userRef}</span>
                                <span className={`px-2 py-0.5 rounded text-[11px] ${u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {u.isActive ? 'Ativo' : 'Bloqueado'}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                                <span>Hoje: R$ {u.usedToday.toFixed(2)}</span>
                                <span>Mês: R$ {u.usedThisMonth.toFixed(2)}</span>
                                {u.dailyLimit != null && <span>Limite: R$ {u.dailyLimit.toFixed(2)}</span>}
                              </div>
                              {!u.isActive && u.blockedReason && (
                                <p className="text-xs text-red-400 mt-1">Motivo: {u.blockedReason}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {u.isActive ? (
                                <button
                                  onClick={() => handleBlockApiUser(u.userRef)}
                                  disabled={apiActionLoading}
                                  className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 text-xs hover:bg-red-600/30 disabled:opacity-50"
                                >
                                  <Ban className="w-3.5 h-3.5 inline mr-1" />
                                  Bloquear
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUnblockApiUser(u.userRef)}
                                  disabled={apiActionLoading}
                                  className="px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 border border-green-600/30 text-xs hover:bg-green-600/30 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                                  Desbloquear
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Ativar modo manutenção */}
      {maintenanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-2">Ativar modo manutenção</h3>
            <p className="text-sm text-gray-400 mb-4">
              Novos cadastros e login de usuários/afiliados serão bloqueados. Apenas administradores poderão acessar.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-300 mb-1">Aviso personalizado (opcional)</label>
              <textarea
                value={maintenanceModalMessage}
                onChange={(e) => setMaintenanceModalMessage(e.target.value)}
                placeholder="Ex: Sistema em manutenção. Retorno previsto para as 16h."
                rows={3}
                className="w-full px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none text-white text-sm placeholder-gray-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">Este aviso será exibido na tela de manutenção.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setMaintenanceModalOpen(false); setMaintenanceModalMessage(''); }}
                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleSetMaintenance(true, maintenanceModalMessage.trim() || undefined)}
                disabled={maintenanceLoading}
                className="px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30 text-sm font-semibold disabled:opacity-50"
              >
                {maintenanceLoading ? 'Ativando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de afiliado */}
      {affiliateModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-lg w-full border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-2">
              Tornar afiliado
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Usuário:{' '}
              <span className="font-semibold text-white">
                {affiliateModalUser.name}
              </span>
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Código do Cupom
                </label>
                <input
                  type="text"
                  value={affiliateCouponCode}
                  onChange={(e) => setAffiliateCouponCode(e.target.value.toUpperCase().trim())}
                  className="w-full px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/40 outline-none text-white text-sm uppercase"
                  placeholder="Deixe vazio para gerar automaticamente"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se deixar vazio, será gerado automaticamente a partir do nome/telegram do usuário
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Desconto na taxa para quem usar o cupom (% da margem)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step="0.1"
                  value={affiliateDiscount}
                  onChange={(e) => setAffiliateDiscount(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/40 outline-none text-white text-sm"
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Sobre a margem das taxas (não sobre o valor do boleto). Máximo 20% da margem. Pode usar 20% sem problema.
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Comissão do afiliado (% da margem das taxas)
                </label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  step="0.1"
                  value={affiliateCommission}
                  onChange={(e) => setAffiliateCommission(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/40 outline-none text-white text-sm"
                  placeholder="20"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Sobre as taxas pagas pelos indicados (não sobre o valor do boleto). Regra do sistema: até 20% da margem. Pode usar 20%.
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Quantas vezes o cupom pode ser usado?
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    id="affiliateUnlimitedUsage"
                    type="checkbox"
                    checked={affiliateUnlimitedUsage}
                    onChange={(e) => {
                      setAffiliateUnlimitedUsage(e.target.checked);
                      if (e.target.checked) {
                        setAffiliateMaxUsage('');
                      }
                    }}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-bitcoin focus:ring-bitcoin"
                  />
                  <label htmlFor="affiliateUnlimitedUsage" className="text-sm text-gray-300">
                    Ilimitado
                  </label>
                </div>
                <input
                  type="number"
                  min={1}
                  value={affiliateMaxUsage}
                  onChange={(e) => {
                    setAffiliateMaxUsage(e.target.value);
                    if (e.target.value) {
                      setAffiliateUnlimitedUsage(false);
                    }
                  }}
                  disabled={affiliateUnlimitedUsage}
                  className="w-full px-3 py-2 bg-gray-800 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-1 focus:ring-bitcoin/40 outline-none text-white text-sm disabled:opacity-50"
                  placeholder="Ex: 100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Após atingir o limite, o cupom será desativado automaticamente
                </p>
              </div>

              <p className="text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg">
                <span className="font-semibold text-white">Regra:</span> Desconto e comissão incidem sobre a <strong>margem das taxas</strong> (parte percentual, não sobre o valor do boleto). O sistema aplica no máximo 20% da margem para cada. Pode configurar 20% para ambos sem medo.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setAffiliateModalUser(null);
                  setAffiliateDiscount('20');
                  setAffiliateCommission('20');
                  setAffiliateCouponCode('');
                  setAffiliateMaxUsage('');
                  setAffiliateUnlimitedUsage(true);
                }}
                className="px-4 py-2 rounded-xl bg-gray-800 text-gray-200 text-sm hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const d = Number(affiliateDiscount.replace(',', '.'));
                  const c = Number(affiliateCommission.replace(',', '.'));
                  if (isNaN(d) || isNaN(c) || d < 0 || c < 0) {
                    alert('Percentuais inválidos');
                    return;
                  }

                  let maxUsageValue: number | null = null;
                  if (!affiliateUnlimitedUsage && affiliateMaxUsage) {
                    const maxUsageNum = Number(affiliateMaxUsage);
                    if (isNaN(maxUsageNum) || maxUsageNum < 1) {
                      alert('Quantidade de usos inválida');
                      return;
                    }
                    maxUsageValue = maxUsageNum;
                  }

                  setAffiliateLoading(true);
                  try {
                    await api.post(`/admin/users/${affiliateModalUser.id}/affiliate`, {
                      discountPercent: d,
                      commissionPercent: c,
                      couponCode: affiliateCouponCode || undefined,
                      maxUsage: maxUsageValue,
                    });
                    await loadUsers();
                    await loadAffiliates();
                    alert('Afiliado configurado com sucesso!');
                    setAffiliateModalUser(null);
                    setAffiliateCouponCode('');
                    setAffiliateMaxUsage('');
                    setAffiliateUnlimitedUsage(true);
                  } catch (err: any) {
                    alert(err.response?.data?.error || 'Erro ao configurar afiliado');
                  } finally {
                    setAffiliateLoading(false);
                  }
                }}
                disabled={affiliateLoading}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/40 disabled:opacity-50"
              >
                {affiliateLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Taxas do Comerciante */}
      {feesModalMerchant && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">
              Editar Taxas - {feesModalMerchant.businessName}
            </h3>
            
            <div className="space-y-4">
              {/* Checkbox Usar Taxas Personalizadas */}
              <div className="flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl">
                <input
                  type="checkbox"
                  checked={feesUseCustom}
                  onChange={(e) => setFeesUseCustom(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-600 text-bitcoin focus:ring-bitcoin focus:ring-offset-gray-900"
                />
                <label className="text-white text-sm font-medium">
                  Usar taxas personalizadas
                </label>
              </div>

              {/* Taxas Padrão (info) */}
              {!feesUseCustom && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                  <p className="text-blue-300 text-sm">
                    <strong>Taxas Padrão:</strong> R$ 0,99 + 0,5%
                  </p>
                </div>
              )}

              {/* Campos de Taxas Personalizadas */}
              {feesUseCustom && (
                <>
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Taxa Fixa (R$)
                    </label>
                    <input
                      type="text"
                      value={feesFixedFee}
                      onChange={(e) => setFeesFixedFee(e.target.value)}
                      placeholder="0.99"
                      className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">
                      Taxa Variável (%)
                    </label>
                    <input
                      type="text"
                      value={feesVariablePercent}
                      onChange={(e) => setFeesVariablePercent(e.target.value)}
                      placeholder="0.5"
                      className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      Digite apenas o número (ex: 0.5 para 0,5%)
                    </p>
                  </div>

                  {/* Preview */}
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <p className="text-green-300 text-sm">
                      <strong>Preview:</strong> R$ {feesFixedFee} + {feesVariablePercent}%
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      Exemplo em R$ 100: Cliente paga R$ 100,00 → Comerciante recebe R$ {(100 - parseFloat(feesFixedFee.replace(',', '.') || '0') - (100 * parseFloat(feesVariablePercent.replace(',', '.') || '0') / 100)).toFixed(2)}
                    </p>
                  </div>
                </>
              )}

              {/* Erro */}
              {feesError && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 rounded-xl text-sm">
                  {feesError}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setFeesModalMerchant(null)}
                disabled={feesLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-700 text-gray-200 text-sm hover:bg-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveFeesModal}
                disabled={feesLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/40 disabled:opacity-50"
              >
                {feesLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar conta de comerciante para terceiros (trusted merchant) */}
      {showCreateTrustedMerchant && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-700 my-8">
            <h3 className="text-xl font-bold text-white mb-2">Criar conta de comerciante para terceiros</h3>
            <p className="text-gray-400 text-sm mb-4">
              Conta verificada, sem validação de CNPJ e sem depósito inicial. Para clientes de confiança.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-1">Nome completo *</label>
                <input
                  type="text"
                  value={trustedForm.nomeCompleto}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, nomeCompleto: e.target.value }))}
                  placeholder="João da Silva"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">CPF (opcional, pode ser fictício)</label>
                <input
                  type="text"
                  value={trustedForm.cpf}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, cpf: e.target.value }))}
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">E-mail *</label>
                <input
                  type="email"
                  value={trustedForm.email}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">Telefone (opcional)</label>
                <input
                  type="text"
                  value={trustedForm.telefone}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, telefone: e.target.value }))}
                  placeholder="+55 11 99999-9999"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">Senha inicial *</label>
                <input
                  type="password"
                  value={trustedForm.senhaInicial}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, senhaInicial: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">Nome do negócio (opcional)</label>
                <input
                  type="text"
                  value={trustedForm.nomeNegocio}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, nomeNegocio: e.target.value }))}
                  placeholder="Usa nome completo se vazio"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">Carteira Liquid (opcional)</label>
                <input
                  type="text"
                  value={trustedForm.liquidWallet}
                  onChange={(e) => setTrustedForm((f) => ({ ...f, liquidWallet: e.target.value }))}
                  placeholder="Endereço para receber pagamentos DePix"
                  className="w-full px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>

              {trustedError && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 text-red-400 rounded-xl text-sm">
                  {trustedError}
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateTrustedMerchant(false);
                  setTrustedForm({ nomeCompleto: '', cpf: '', email: '', telefone: '', senhaInicial: '', nomeNegocio: '', liquidWallet: '' });
                  setTrustedError('');
                }}
                disabled={trustedLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-gray-700 text-gray-200 text-sm hover:bg-gray-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={submitCreateTrustedMerchant}
                disabled={trustedLoading}
                className="flex-1 px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold hover:shadow-lg hover:shadow-bitcoin/40 disabled:opacity-50"
              >
                {trustedLoading ? 'Criando...' : 'Criar conta'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Enviar Push Notification */}
      {pushModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-orange-400" />
                  Notificação Push
                </h3>
                <p className="text-sm text-gray-400">{pushModal.userName}</p>
              </div>
              <button
                onClick={() => { setPushModal(null); setPushTitle(''); setPushBody(''); }}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Título</label>
                <input
                  type="text"
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                  placeholder="Ex: Boleto aprovado!"
                  className="w-full px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mensagem</label>
                <textarea
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  rows={3}
                  placeholder="Mensagem curta para o usuário..."
                  className="w-full px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none resize-none"
                />
              </div>
              <p className="text-xs text-gray-500">A notificação aparecerá no dispositivo do usuário e ficará salva no histórico.</p>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setPushModal(null); setPushTitle(''); setPushBody(''); }}
                  className="flex-1 px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendPush}
                  disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {pushSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                  ) : (
                    <><Bell className="w-4 h-4" />Enviar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Enviar E-mail para usuário */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Enviar E-mail</h3>
                <p className="text-sm text-gray-400">{emailModal.userName} — {emailModal.userEmail}</p>
              </div>
              <button
                onClick={() => { setEmailModal(null); setEmailSubject(''); setEmailBody(''); }}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Assunto</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Ex: Atualização sobre seu boleto"
                  className="w-full px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mensagem</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={5}
                  placeholder="Escreva a mensagem para o usuário..."
                  className="w-full px-4 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setEmailModal(null); setEmailSubject(''); setEmailBody(''); }}
                  className="flex-1 px-4 py-2 rounded-xl bg-gray-800 text-gray-300 text-sm hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-semibold disabled:opacity-50"
                >
                  {emailSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</>
                  ) : (
                    <><Mail className="w-4 h-4" />Enviar</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA: PAGAR CONTA (BillPayment / RV Hub) ── */}
      {tab === 'contas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-bitcoin" />
              Pagamentos de Conta
            </h2>
            <button onClick={loadBillPayments} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-400 ${billPaymentsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            {['PENDING', 'PROCESSING', 'PAID', 'CANCELLED', 'FAILED', 'ALL'].map((f) => (
              <button
                key={f}
                onClick={() => setBillPaymentFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  billPaymentFilter === f
                    ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f === 'PENDING' ? '⏳ Pendentes' : f === 'PROCESSING' ? '🔄 Processando' : f === 'PAID' ? '✅ Pagos' : f === 'CANCELLED' ? '❌ Cancelados' : f === 'FAILED' ? '⚠️ Falhos' : '📋 Todos'}
              </button>
            ))}
          </div>

          {billPaymentsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-bitcoin animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {billPayments
                .filter(bp => billPaymentFilter === 'ALL' || bp.status === billPaymentFilter)
                .length === 0 ? (
                <div className="bg-gray-800/50 rounded-xl p-8 text-center border border-gray-700/50">
                  <CheckCircle2 className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                  <p className="text-gray-400">Nenhum pagamento neste filtro.</p>
                </div>
              ) : (
                billPayments
                  .filter(bp => billPaymentFilter === 'ALL' || bp.status === billPaymentFilter)
                  .map((bp: any) => (
                    <div key={bp.id} className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-5 border border-gray-700/50">
                      <div className="flex flex-col lg:flex-row gap-5">
                        <div className="flex-1 space-y-3">
                          {/* Usuário */}
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-bitcoin to-orange-600 rounded-full flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
                              {bp.user?.name?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div>
                              <p className="font-bold text-white">{bp.user?.name || 'Usuário'}</p>
                              <p className="text-sm text-gray-400">{bp.user?.email}</p>
                            </div>
                            <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-lg ${
                              bp.status === 'PENDING' ? 'bg-yellow-500/15 text-yellow-400' :
                              bp.status === 'PROCESSING' ? 'bg-blue-500/15 text-blue-400' :
                              bp.status === 'PAID' ? 'bg-green-500/15 text-green-400' :
                              'bg-red-500/15 text-red-400'
                            }`}>{bp.status}</span>
                          </div>

                          {/* Financeiro */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-gray-900/50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 mb-0.5">Valor conta</p>
                              <p className="font-bold text-white">R$ {Number(bp.amount).toFixed(2)}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 mb-0.5">Taxa</p>
                              <p className="font-bold text-yellow-400">R$ {Number(bp.fee).toFixed(2)}</p>
                            </div>
                            <div className="bg-gray-900/50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 mb-0.5">Total</p>
                              <p className="font-bold text-bitcoin">R$ {Number(bp.totalAmount).toFixed(2)}</p>
                            </div>
                          </div>

                          {/* Código + beneficiário */}
                          {(bp.barcode || bp.digitableLine) && (
                            <div className="bg-gray-900/50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 mb-1">Código de barras</p>
                              <p className="font-mono text-xs text-white break-all">{bp.barcode || bp.digitableLine}</p>
                            </div>
                          )}
                          <p className="text-xs text-gray-500">{new Date(bp.createdAt).toLocaleString('pt-BR')} · ID: <code className="font-mono">{bp.id.slice(0, 8)}</code></p>
                        </div>

                        {/* Ações */}
                        <div className="flex flex-col gap-2 min-w-[180px]">
                          {bp.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApproveBillPayment(bp.id)}
                                disabled={billPaymentActionLoading === bp.id}
                                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white font-bold text-sm disabled:opacity-50 transition-all"
                              >
                                {billPaymentActionLoading === bp.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                Aprovar
                              </button>
                              <button
                                onClick={() => handleRejectBillPayment(bp.id)}
                                disabled={billPaymentActionLoading === bp.id}
                                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-700 hover:bg-red-600 text-white font-bold text-sm disabled:opacity-50 transition-all"
                              >
                                <XCircle className="w-4 h-4" /> Rejeitar
                              </button>
                            </>
                          )}
                          {bp.status === 'PAID' && (
                            <div className="flex items-center justify-center py-4">
                              <CheckCircle2 className="w-10 h-10 text-green-400" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
