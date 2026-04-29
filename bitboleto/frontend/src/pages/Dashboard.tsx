import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  Tag,
  Wallet,
  Send,
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
  Bell,
  BellOff,
  QrCode,
  type LucideIcon,
} from 'lucide-react';
import api from '../services/api';
import NotificationPopup from '../components/NotificationPopup';
import NotificationBell from '../components/NotificationBell';
import { useCart } from '../contexts/CartContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ReferralCard from '../components/ReferralCard';

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
  '/loja': { title: 'Loja', subtitle: 'Produtos digitais pagos com Depix via Pix' },
  '/loja/carrinho': { title: 'Carrinho', subtitle: 'Seus itens para finalizar compra' },
  '/loja/checkout-cart': { title: 'Checkout', subtitle: 'Finalize sua compra com Pix' },
  '/minhas-compras': { title: 'Minhas compras', subtitle: 'Histórico de compras na loja' },
  '/loja/notificacoes': { title: 'Notificações', subtitle: 'Notificações de pedidos da loja' },
  '/pagar': { title: 'Pagar Boleto', subtitle: 'Pague seus boletos com Depix na Liquid Network' },
  '/recarga': { title: 'Recarga de Celular', subtitle: 'Recarregue seu celular com Depix' },
  '/area-pix': { title: 'Área Pix', subtitle: 'Envie Pix ou pague com código Pix Copia e Cola' },
  '/enviar-pix': { title: 'Enviar com chave Pix', subtitle: 'Converta Depix em Pix para qualquer chave' },
  '/pix-copia-cola': { title: 'Pagar Pix Copia e Cola', subtitle: 'Pague usando um código Pix copiado' },
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
  const { permission, isSubscribed, subscribe, unsubscribe } = usePushNotifications();
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
          if (location.pathname !== '/kyc') {
            navigate('/kyc');
          }
        }
      })
      .catch(() => {});
  }, [user?.id, location.pathname, navigate]);

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
    // CONSUMER_DISABLED — descomentar quando área de consumidor estiver pronta
    // {
    //   label: 'CONSUMIDOR',
    //   labelColor: 'text-blue-400',
    //   items: [
    //     { icon: ShoppingBag, label: 'Loja', path: '/loja' },
    //     { icon: ShoppingCart, label: 'Minhas Compras', path: '/minhas-compras' },
    //   ],
    // },
    {
      label: 'PAGAMENTOS',
      labelColor: 'text-green-400',
      items: [
        { icon: CreditCard, label: 'Pagar Boleto', path: '/pagar' },
        { icon: Smartphone, label: 'Recarga de Celular', path: '/recarga' },
        { icon: QrCode, label: 'Área Pix', path: '/area-pix' },
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
            <div className="flex gap-5">
              {/* Coluna principal */}
              <div className="flex-1 min-w-0 space-y-3 md:space-y-4">

              {/* 1. Notificações push — topo */}
              {permission !== 'unsupported' && permission !== 'denied' && !isSubscribed && (
                <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-bitcoin/10 to-orange-500/10 border border-bitcoin/25 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-bitcoin flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-app-text leading-tight">Ativar notificações push</p>
                      <p className="text-[11px] text-app-muted leading-tight">Avisos em tempo real de pagamentos</p>
                    </div>
                  </div>
                  <button
                    onClick={subscribe}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-bitcoin text-black text-xs font-bold hover:bg-orange-400 transition-colors"
                  >
                    Ativar
                  </button>
                </div>
              )}
              {permission === 'denied' && (
                <div className="flex items-center gap-2.5 bg-app-elevated border border-app-stroke rounded-xl px-3 py-2.5">
                  <BellOff className="w-3.5 h-3.5 text-app-subtle flex-shrink-0" />
                  <p className="text-[11px] text-app-muted leading-tight">
                    Notificações bloqueadas — Cadeado → Notificações → Permitir
                  </p>
                </div>
              )}
              {isSubscribed && (
                <div className="flex items-center justify-between gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-app-text leading-tight">Notificações ativas</p>
                  </div>
                  <button
                    onClick={unsubscribe}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-app-elevated text-app-muted text-[11px] hover:text-red-400 transition-colors"
                  >
                    <BellOff className="w-3 h-3" />
                    Desativar
                  </button>
                </div>
              )}

              {/* 2. Banner referral compacto — mobile/tablet (oculto xl+) */}
              <ReferralCard compact />

              {/* 3. Total processado + slot de anúncio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Total processado */}
                <div className="bg-app-surface rounded-xl p-4 border border-app-stroke shadow-card">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-bitcoin/10 rounded-lg">
                      <Send className="w-3.5 h-3.5 text-bitcoin" />
                    </div>
                    <span className="text-[10px] font-semibold text-app-muted uppercase tracking-wide">Total Processado</span>
                  </div>
                  <p className="text-2xl md:text-3xl font-bold text-app-text tracking-tight">
                    R$ {(() => {
                      const t = profile?.totalByOperation;
                      const total = t ? (t.boletos + t.recargas) : (user.totalPaid ?? 0);
                      return Number(total).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    })()}
                  </p>
                  <p className="text-[11px] text-app-muted mt-1 flex items-center gap-1">
                    <History className="w-3 h-3" />
                    Boletos + Recargas
                  </p>
                </div>

                {/* Slot de anúncio — banner Modo Comércio até o Google Ads ser ativado */}
                <button
                  type="button"
                  onClick={() => navigate('/comercio/ativar')}
                  className={`relative overflow-hidden rounded-xl active:scale-[0.99] transition-all group text-left ${focusRing}`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-950 via-purple-950/90 to-gray-900" />
                  <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/5 via-transparent to-purple-500/10" />
                  <div className="absolute -right-6 -top-6 w-32 h-32 bg-bitcoin/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute right-4 -bottom-4 w-20 h-20 bg-purple-600/10 rounded-full blur-xl pointer-events-none" />
                  <div className="relative h-full px-4 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-bitcoin animate-pulse flex-shrink-0" />
                        <span className="text-[10px] font-bold text-bitcoin uppercase tracking-widest">Modo Comércio</span>
                      </div>
                      <p className="text-sm font-bold text-white leading-tight">Receba sem burocracia</p>
                      <p className="text-[11px] text-white/55 leading-tight mt-0.5">
                        Cliente paga via Pix · você recebe em cripto
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center px-2 py-0.5 bg-bitcoin/15 border border-bitcoin/25 rounded-full text-[10px] font-bold text-bitcoin">
                          0,5% + R$0,99
                        </span>
                        <span className="text-[10px] text-white/35">por transação</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-center gap-2">
                      <div className="p-2 bg-bitcoin/10 rounded-xl border border-bitcoin/20 group-hover:bg-bitcoin/20 transition-colors">
                        <Store className="w-5 h-5 text-bitcoin" />
                      </div>
                      <span className="px-2.5 py-1 bg-bitcoin group-hover:bg-orange-400 text-black text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors">
                        Ativar agora →
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {/* 4. Ações rápidas */}
              <div className="bg-app-surface rounded-xl p-3.5 md:p-5 border border-app-stroke shadow-card">
                <h2 className="text-xs font-bold text-app-muted uppercase tracking-wide mb-3">Ações Rápidas</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/pagar')}
                    className={`flex items-center gap-2.5 p-3 bg-gradient-to-br from-bitcoin to-orange-500 rounded-xl hover:shadow-lg hover:shadow-bitcoin/25 active:scale-[0.98] transition-all text-left ${focusRing}`}
                  >
                    <div className="p-1.5 bg-black/15 rounded-lg flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-black" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-black text-sm leading-tight">Pagar Boleto</p>
                      <p className="text-[10px] text-black/65 leading-tight">Via Liquid</p>
                    </div>
                  </button>

                  {[
                    { path: '/recarga', icon: Smartphone, label: 'Recarregar', sub: 'Celular' },
                    { path: '/area-pix', icon: QrCode, label: 'Área Pix', sub: 'Pix' },
                    { path: '/loja', icon: ShoppingBag, label: 'Loja', sub: 'Produtos' },
                  ].map(({ path, icon: Icon, label, sub }) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => navigate(path)}
                      className={`flex items-center gap-2.5 p-3 bg-app-elevated rounded-xl hover:border hover:border-app-stroke active:scale-[0.98] transition-all text-left border border-transparent ${focusRing}`}
                    >
                      <div className="p-1.5 bg-app-surface rounded-lg flex-shrink-0 border border-app-stroke">
                        <Icon className="w-4 h-4 text-app-muted" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-app-text text-sm leading-tight">{label}</p>
                        <p className="text-[10px] text-app-muted leading-tight">{sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              </div> {/* fim coluna principal */}

              {/* ReferralCard completo — apenas desktop xl+ */}
              <div className="hidden xl:block w-72 flex-shrink-0">
                <ReferralCard />
              </div>
            </div>
          )}
        </div>
      </main>

      <NotificationPopup />
    </div>
  );
}
