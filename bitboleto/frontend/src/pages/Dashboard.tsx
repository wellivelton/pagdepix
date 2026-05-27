import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  Tag,
  Wallet,
  History,
  Settings,
  CreditCard,
  Menu,
  X,
  Shield,
  MessageCircle,
  DollarSign,
  FileText,
  Smartphone,
  LayoutDashboard,
  Lock,
  AlertCircle,
  ShoppingBag,
  Package,
  ShoppingCart,
  Store,
  Link2,
  Zap,
  Code2,
  ChevronDown,
  User,
  Briefcase,
  CheckCircle,
  BookOpen,
  BarChart3,
  Sun,
  Moon,
  QrCode,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import api from '../services/api';
import NotificationPopup from '../components/NotificationPopup';
import NotificationBell from '../components/NotificationBell';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import StatusBar from '../components/dashboard/StatusBar';
import TotalProcessadoCard from '../components/dashboard/TotalProcessadoCard';
import NoticiasFeedCard from '../components/dashboard/NoticiasFeedCard';
import QuickActionCard from '../components/dashboard/QuickActionCard';
import IndicacaoCard from '../components/dashboard/IndicacaoCard';
import ModoComercioBanner from '../components/dashboard/ModoComercioBanner';
import { useDismissibleBanner } from '../hooks/useDismissibleBanner';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50';

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  isKycPage?: boolean;
  children?: MenuItem[];
};

type MenuSection = {
  label?: string;
  labelColor?: string;
  items: MenuItem[];
};

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Resumo e ações rápidas' },
  '/loja': { title: 'Loja', subtitle: 'Gift cards, TV e produtos digitais com DePix' },
  '/loja/carrinho': { title: 'Carrinho', subtitle: 'Seus itens para finalizar compra' },
  '/loja/checkout-cart': { title: 'Checkout', subtitle: 'Finalize sua compra com Pix' },
  '/minhas-compras': { title: 'Minhas compras', subtitle: 'Histórico de compras na loja' },
  '/loja/notificacoes': { title: 'Notificações', subtitle: 'Notificações de pedidos da loja' },
  '/pagar': { title: 'Pagar Boleto', subtitle: 'Pague seus boletos com cripto' },
  '/recarga': { title: 'Recarga de Celular', subtitle: 'Recarregue seu celular com Depix' },
  '/area-pix': { title: 'Área Pix', subtitle: 'Envie Pix ou pague com código Pix Copia e Cola' },
  '/enviar-pix': { title: 'Enviar com chave Pix', subtitle: 'Converta Depix em Pix para qualquer chave' },
  '/pix-copia-cola': { title: 'Pagar Pix Copia e Cola', subtitle: 'Pague usando um código Pix copiado' },
  '/swap': { title: 'Swap Cripto', subtitle: 'Converta entre 200+ ativos em segundos' },
  '/historico': { title: 'Histórico de Transações', subtitle: 'Todas as suas operações' },
  '/suporte': { title: 'Suporte', subtitle: 'Entre em contato conosco pelo Telegram' },
  '/kyc': { title: 'Verificação', subtitle: 'Verifique sua identidade' },
  '/regras': { title: 'Regras & Limites', subtitle: 'Taxas, limites, afiliados e boas práticas' },
  '/config': { title: 'Configurações', subtitle: 'Gerencie suas informações e segurança' },
  '/comercio/ativar': { title: 'Ativar Modo Comércio', subtitle: 'Solicite acesso ao Modo Comércio' },
  '/comercio/dashboard': { title: 'Dashboard do Comércio', subtitle: 'Resumo de vendas e pagamentos' },
  '/comercio/links': { title: 'Links de Pagamento', subtitle: 'Crie e gerencie links de pagamento' },
  '/comercio/paginas': { title: 'Páginas de Pagamento', subtitle: 'Páginas personalizadas de pagamento' },
  '/comercio/colateral': { title: 'Antifraude & Limites', subtitle: 'Colateral e limites antifraude' },
  '/comercio/loja/produtos': { title: 'Meus Produtos', subtitle: 'Marketplace — gerencie seus produtos' },
  '/comercio/loja/vendas': { title: 'Vendas da Loja', subtitle: 'Marketplace — suas vendas' },
  '/comercio/loja/saldo': { title: 'Saldo & Saques', subtitle: 'Marketplace — saldo disponível e solicitar saques' },
  '/comercio/historico': { title: 'Histórico de Comércio', subtitle: 'Histórico de transações do comércio' },
  '/comercio/config': { title: 'Configurações Comércio', subtitle: 'Configure seu perfil comercial' },
  '/comercio/api': { title: 'API Gateway', subtitle: 'Gateway de pagamento Pix para integração em sites e apps' },
  '/afiliado/ganhos': { title: 'Meus Ganhos', subtitle: 'Gerencie seus ganhos e solicite saques' },
  '/afiliado/api': { title: 'API White-Label', subtitle: 'Integre pagamentos via API White-Label' },
  '/admin': { title: 'Painel Admin', subtitle: 'Aprovação de boletos e gestão' },
  '/admin/carteira': { title: 'Gestão de Carteira', subtitle: 'Endereço Liquid e QR Code' },
};

function getPageMeta(pathname: string): { title: string; subtitle: string } {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  if (pathname.startsWith('/loja/produto')) return { title: 'Produto', subtitle: 'Detalhes e compra do produto' };
  if (pathname.startsWith('/loja/checkout')) return { title: 'Checkout', subtitle: 'Pague com Pix e receba na hora' };
  if (pathname.startsWith('/minhas-compras/')) return { title: 'Detalhe do pedido', subtitle: 'Download e informações do pedido' };
  if (pathname.startsWith('/comercio/loja/produtos')) return { title: 'Produto', subtitle: 'Marketplace — gerencie produtos e vendas' };
  if (pathname.startsWith('/comercio/loja')) return { title: 'Loja Digital', subtitle: 'Marketplace — gerencie produtos e vendas' };
  if (pathname === '/comercio/loja/saldo') return { title: 'Saldo & Saques', subtitle: 'Marketplace — saldo disponível e solicitar saques' };
  return { title: 'Bem-vindo de volta!', subtitle: 'Gerencie seus pagamentos com Depix' };
}

function isRouteActive(pathname: string, itemPath: string): boolean {
  if (!itemPath) return false;
  return pathname === itemPath;
}

function isSubmenuActive(pathname: string, item: MenuItem): boolean {
  if (item.path && isRouteActive(pathname, item.path)) return true;
  if (item.children) return item.children.some(c => isSubmenuActive(pathname, c));
  return false;
}

export default function Dashboard({ children }: { children?: React.ReactNode }) {
  const { itemCount } = useCart();
  const { theme, toggle: toggleTheme } = useTheme();
  const { permission, subscribe } = usePushNotifications();
  const { dismissed: merchantBannerDismissed, dismiss: dismissMerchantBanner } =
    useDismissibleBanner('merchant-banner', { reappearAfterDays: 30 });
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const location = useLocation();
  const [showNavBar, setShowNavBar] = useState(false);
  const isFirstMount = useRef(true);

  // Inicializar slot AdSense após render
  useEffect(() => {
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    setShowNavBar(true);
    const t = setTimeout(() => setShowNavBar(false), 400);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const verificationEnabled = true;

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    setUser(JSON.parse(userData));
  }, [navigate]);

  useEffect(() => {
    if (!user?.id) return;

    api.get('/user/profile')
      .then(({ data }) => {
        setProfile(data);

        if (data.role) {
          const stored = JSON.parse(localStorage.getItem('user') || '{}');
          if (stored.role !== data.role) {
            const updated = { ...stored, role: data.role };
            localStorage.setItem('user', JSON.stringify(updated));
            setUser(updated);
          }
        }

        if (verificationEnabled && (data.kycStatus?.level ?? 0) < 1 && data.role !== 'ADMIN') {
          if (window.location.pathname !== '/kyc') {
            navigate('/kyc');
          }
        }
      })
      .catch(() => {});
  }, [user?.id, navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  if (!user) return null;

  const kycLevel = profile?.kycStatus?.level ?? 0;
  const needsKyc = verificationEnabled && profile && kycLevel < 1 && profile.role !== 'ADMIN';
  const needsEmailVerify = verificationEnabled && profile && !profile.emailVerified && profile.role !== 'ADMIN';

  const isCommerceActive = user.commercePartner === true || user.role === 'COMMERCE';
  const isAdmin = user.role === 'ADMIN';
  const isAffiliate = user.role === 'AFFILIATE';

  const merchantStatus: 'none' | 'pending' | 'verified' =
    isCommerceActive ? 'verified'
    : profile?.commerceApplication ? 'pending'
    : 'none';

  const commerceChildren: MenuItem[] = isCommerceActive || isAdmin
    ? [
        { icon: BarChart3, label: 'Painel', path: '/comercio/dashboard' },
        {
          icon: ShoppingBag,
          label: 'Loja',
          path: '',
          children: [
            { icon: Package, label: 'Produtos', path: '/comercio/loja/produtos' },
            { icon: BarChart3, label: 'Vendas', path: '/comercio/loja/vendas' },
            { icon: Wallet, label: 'Saldo & Saques', path: '/comercio/loja/saldo' },
            { icon: Tag, label: 'Cupons', path: '/comercio/loja/cupons' },
            { icon: Link2, label: 'Links de Pagamento', path: '/comercio/links' },
            { icon: FileText, label: 'Páginas de Pagamento', path: '/comercio/paginas' },
          ],
        },
        { icon: Shield, label: 'Colateral & Limites', path: '/comercio/colateral' },
        { icon: Code2, label: 'API', path: '/comercio/api' },
        { icon: Settings, label: 'Configurações', path: '/comercio/config' },
      ]
    : [{ icon: Zap, label: 'Ativar Modo Comércio', path: '/comercio/ativar' }];

  const menuSections: MenuSection[] = [
    {
      items: [{ icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' }],
    },
    ...(isAdmin ? [{
      label: 'LOJA',
      labelColor: 'text-purple-400',
      items: [
        { icon: ShoppingBag, label: 'Loja', path: '/loja' },
      ],
    }] : []),
    {
      label: 'PAGAMENTOS',
      labelColor: 'text-green-400',
      items: [
        ...(isAdmin ? [
          { icon: FileText, label: 'Pagar Boleto', path: '/pagar' },
          { icon: Smartphone, label: 'Recarga de Celular', path: '/recarga' },
          { icon: QrCode, label: 'Área Pix', path: '/area-pix' },
          { icon: ArrowLeftRight, label: 'Swap Cripto', path: '/swap' },
        ] : []),
        { icon: History, label: 'Histórico de Transações', path: '/historico' },
      ],
    },
    {
      label: 'COMÉRCIO',
      labelColor: 'text-orange-400',
      items: [{ icon: Store, label: 'Comércio', path: '', children: commerceChildren }],
    },
  ];

  if (isAffiliate) {
    menuSections.push({
      label: 'AFILIADO',
      labelColor: 'text-purple-400',
      items: [
        {
          icon: Briefcase,
          label: 'Afiliado',
          path: '',
          children: [
            { icon: DollarSign, label: 'Meus Ganhos', path: '/afiliado/ganhos' },
            { icon: Code2, label: 'API White-Label', path: '/afiliado/api' },
          ],
        },
      ],
    });
  }

  menuSections.push({
    label: 'CONTA & SUPORTE',
    labelColor: 'text-app-subtle',
    items: [
      {
        icon: User,
        label: 'Perfil',
        path: '',
        children: [
          { icon: CheckCircle, label: 'Verificação (KYC)', path: '/kyc', isKycPage: true },
          { icon: BookOpen, label: 'Regras & Limites', path: '/regras' },
          { icon: Settings, label: 'Configurações', path: '/config' },
          { icon: MessageCircle, label: 'Suporte', path: '/suporte' },
        ],
      },
    ],
  });

  if (isAdmin) {
    menuSections.push({
      label: 'ADMINISTRAÇÃO',
      labelColor: 'text-red-400',
      items: [
        {
          icon: Settings,
          label: 'Administração',
          path: '',
          children: [
            { icon: Shield, label: 'Painel Admin', path: '/admin' },
            { icon: Wallet, label: 'Gestão de Carteira', path: '/admin/carteira' },
          ],
        },
      ],
    });
  }

  const allMenuItems: MenuItem[] = [];
  menuSections.forEach(sec => sec.items.forEach(it => allMenuItems.push(it)));

  const resolvedOpenMenus: Record<string, boolean> = { ...openMenus };
  allMenuItems.forEach(item => {
    if (item.children && isSubmenuActive(location.pathname, item)) {
      resolvedOpenMenus[item.label] = true;
      item.children.forEach(child => {
        if (child.children && isSubmenuActive(location.pathname, child)) {
          resolvedOpenMenus[child.label] = true;
        }
      });
    }
  });

  const toggleMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const handleNav = (path: string, isBlocked: boolean) => {
    if (isBlocked || !path) return;
    navigate(path);
    setSidebarOpen(false);
  };

  function renderItem(item: MenuItem, depth: number = 0) {
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = resolvedOpenMenus[item.label] || openMenus[item.label];
    const isActive = item.path ? isRouteActive(location.pathname, item.path) : false;
    const isBlocked = needsKyc && !item.isKycPage && !hasChildren;
    const isKyc = item.isKycPage;
    const containsActive = hasChildren && isSubmenuActive(location.pathname, item);

    if (hasChildren) {
      return (
        <div key={item.label + depth}>
          <button
            type="button"
            onClick={() => {
              if (needsKyc) return;
              toggleMenu(item.label);
            }}
            disabled={needsKyc && !item.children?.some(c => c.isKycPage)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium ${focusRing} ${
              depth > 0 ? 'ml-2' : ''
            } ${
              needsKyc
                ? 'text-app-subtle opacity-50 cursor-not-allowed'
                : containsActive
                ? 'text-bitcoin bg-bitcoin/8 dark:bg-bitcoin/10'
                : 'text-app-muted hover:bg-app-elevated hover:text-app-text'
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            {needsKyc && <Lock className="w-3 h-3 flex-shrink-0 opacity-50" />}
          </button>
          {isOpen && (
            <div className={`mt-0.5 space-y-0.5 ${depth === 0 ? 'ml-3 pl-3' : 'ml-4 pl-3'} border-l ${containsActive ? 'border-bitcoin/30' : 'border-app-stroke'}`}>
              {item.children!.map(child => renderItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={item.path + item.label}
        type="button"
        onClick={() => handleNav(item.path, isBlocked)}
        disabled={isBlocked}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium relative ${focusRing} ${
          isActive
            ? isKyc && needsKyc
              ? 'bg-red-500/15 text-red-400 border border-red-500/20'
              : 'bg-bitcoin/10 text-bitcoin border-l-2 border-bitcoin pl-[10px]'
            : isBlocked
            ? 'text-app-subtle opacity-40 cursor-not-allowed'
            : isKyc && needsKyc
            ? 'text-red-400 hover:bg-red-500/10'
            : 'text-app-muted hover:bg-app-elevated hover:text-app-text'
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>

        {isKyc && needsEmailVerify && (
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Email pendente" />
        )}
        {isBlocked && <Lock className="w-3 h-3 flex-shrink-0 opacity-40" />}
      </button>
    );
  }

  const pageMeta = getPageMeta(location.pathname);

  return (
    <div className="min-h-screen bg-app-bg transition-colors duration-200">
      {/* Loading bar */}
      <div
        className="fixed top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-bitcoin via-orange-400 to-bitcoin z-[60] transition-all duration-300 ease-out"
        style={{ width: showNavBar ? '100%' : '0%', opacity: showNavBar ? 1 : 0 }}
      />

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 h-screen flex flex-col
        bg-app-surface border-r border-app-stroke
        transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-app-stroke">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className={`flex items-center justify-center w-full rounded-xl overflow-hidden group ${focusRing}`}
            aria-label="Ir para Dashboard"
          >
            <img
              src="/logo.png"
              alt="PagDepix"
              className="h-9 w-auto object-contain transition-opacity duration-200 group-hover:opacity-80"
            />
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav-scroll flex-1 overflow-y-auto px-3 py-3 space-y-0.5 min-h-0">
          {menuSections.map((section, idx) => (
            <div key={section.label || `sec-${idx}`} className={section.label ? 'pt-3' : ''}>
              {section.label && (
                <div className={`px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest ${section.labelColor || 'text-app-subtle'}`}>
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => renderItem(item, 0))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="flex-shrink-0 px-3 py-3 border-t border-app-stroke">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-app-elevated">
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-br from-bitcoin to-orange-600 flex items-center justify-center text-black font-bold text-sm flex-shrink-0 select-none"
              title={user.name}
            >
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-app-text truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-app-muted truncate leading-tight">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`text-app-muted hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10 ${focusRing}`}
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Main */}
      <main className="lg:ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-app-surface border-b border-app-stroke px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">

            {/* Left: toggle + title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`lg:hidden p-2 rounded-lg text-app-muted hover:text-app-text hover:bg-app-elevated transition-colors ${focusRing} ${sidebarOpen ? 'bg-app-elevated' : ''}`}
                aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>

              <div className="min-w-0">
                <h1 className="text-base font-bold text-app-text md:text-xl truncate leading-tight">
                  {pageMeta.title}
                </h1>
                <p className="text-[11px] md:text-xs text-app-muted truncate leading-tight">
                  {pageMeta.subtitle}
                </p>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className={`p-2 rounded-lg text-app-muted hover:text-app-text hover:bg-app-elevated transition-colors ${focusRing}`}
                title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {theme === 'dark'
                  ? <Sun className="w-4 h-4" />
                  : <Moon className="w-4 h-4" />
                }
              </button>

              {/* Notification bell */}
              <NotificationBell />

              {/* Cart */}
              <button
                type="button"
                onClick={() => navigate('/loja/carrinho')}
                className={`relative p-2 rounded-lg transition-colors ${focusRing} ${
                  itemCount > 0
                    ? 'text-bitcoin bg-bitcoin/10 hover:bg-bitcoin/15'
                    : 'text-app-muted hover:text-app-text hover:bg-app-elevated'
                }`}
                title="Carrinho"
              >
                <ShoppingCart className="w-4 h-4" />
                {itemCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold bg-bitcoin text-black rounded-full">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* System status */}
              <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-500/8 dark:bg-green-500/10 border border-green-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-600 dark:text-green-400">Online</span>
              </div>
            </div>
          </div>
        </header>

        {/* KYC alert */}
        {needsKyc && location.pathname !== '/kyc' && (
          <div className="mx-4 mt-4 md:mx-6 md:mt-5 p-4 bg-red-500/8 dark:bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400 mb-1">
                Verificação pendente
              </p>
              <p className="text-xs text-red-400/70 mb-3">
                Verifique seu Telegram para acessar todas as funcionalidades do sistema.
              </p>
              <button
                onClick={() => navigate('/kyc')}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Verificar agora
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-4 md:p-6">
          {children || (
            <div className="space-y-4 md:space-y-5">

              {/* Status bar — rede Liquid + cotações + push notification */}
              <StatusBar permission={permission} onSubscribe={subscribe} />

              {/* KPIs grid: Total processado | Última atividade | Indicação */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
                <TotalProcessadoCard profile={profile} />
                <NoticiasFeedCard />
                <IndicacaoCard />
              </div>

              {/* Ações rápidas */}
              <div className="bg-app-surface border border-app-stroke rounded-xl p-5 shadow-card-premium">
                <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest mb-4">
                  Ações rápidas
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <QuickActionCard
                    icon={CreditCard}
                    label="Pagar Boleto"
                    sublabel="Use Depix, L-USDT e L-Bitcoin"
                    path="/pagar"
                    variant="primary"
                  />
                  <QuickActionCard
                    icon={Smartphone}
                    label="Recargas Pré-pago"
                    sublabel="Use Depix, L-USDT e L-Bitcoin"
                    path="/recarga"
                    variant="primary"
                  />
                  <QuickActionCard
                    icon={QrCode}
                    label="Área Pix"
                    sublabel="Copia e Cola · Enviar"
                    path="/area-pix"
                  />
                  <QuickActionCard
                    icon={ArrowLeftRight}
                    label="Swap Cripto"
                    sublabel="Converta entre 200+ ativos"
                    path="/swap"
                  />
                  <QuickActionCard
                    icon={Store}
                    label="Modo Comércio"
                    sublabel={
                      merchantStatus === 'verified'
                        ? 'Ver painel'
                        : 'Receba pagamentos em cripto'
                    }
                    path={merchantStatus === 'verified' ? '/comercio/dashboard' : '/comercio/ativar'}
                    badge={
                      merchantStatus === 'verified'
                        ? { label: 'Ativo', color: 'green' }
                        : merchantStatus === 'pending'
                        ? { label: 'Em análise', color: 'yellow' }
                        : undefined
                    }
                  />
                </div>
              </div>

              {/* Modo Comércio persuasive banner — shown only for non-members */}
              {merchantStatus === 'none' && !merchantBannerDismissed && !needsKyc && (
                <ModoComercioBanner onDismiss={dismissMerchantBanner} />
              )}

            </div>
          )}
        </div>
      </main>

      <NotificationPopup />
    </div>
  );
}
