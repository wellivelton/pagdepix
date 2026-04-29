/**
 * Layout do Modo Comércio: sidebar própria e área de conteúdo.
 * Usado em todas as rotas /comercio/dashboard, /comercio/links, etc.
 * Sidebar com agrupamento lógico, suporte e botão de ação rápida.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  LayoutDashboard,
  Link2,
  FileText,
  History,
  Settings,
  Menu,
  X,
  Store,
  MessageCircle,
  ChevronRight,
  Plus,
  Package,
  ShoppingBag,
  BarChart2,
} from 'lucide-react';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

const menuGroups = [
  {
    label: 'Vendas',
    items: [
      { icon: LayoutDashboard, label: 'Início', path: '/comercio/dashboard' },
      { icon: Link2, label: 'Links de pagamento', path: '/comercio/links' },
      { icon: FileText, label: 'Páginas pré-prontas', path: '/comercio/paginas' },
    ],
  },
  {
    label: 'Loja (Marketplace)',
    items: [
      { icon: Package, label: 'Meus produtos', path: '/comercio/loja/produtos' },
      { icon: ShoppingBag, label: 'Vendas da loja', path: '/comercio/loja/vendas' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { icon: History, label: 'Histórico', path: '/comercio/historico' },
      { icon: BarChart2, label: 'Relatórios', path: '/comercio/loja/relatorios' },
    ],
  },
  {
    label: 'Configuração',
    items: [{ icon: Settings, label: 'Configurações', path: '/comercio/config' }],
  },
  {
    label: 'Suporte',
    items: [{ icon: MessageCircle, label: 'Falar com o suporte', path: '/comercio/suporte' }],
  },
];

const titleByPath: Record<string, { title: string; subtitle: string }> = {
  '/comercio/dashboard': { title: 'Início', subtitle: 'Resumo do seu comércio e ações rápidas' },
  '/comercio/links': { title: 'Links de pagamento', subtitle: 'Crie e gerencie links com valor fixo' },
  '/comercio/paginas': { title: 'Páginas pré-prontas', subtitle: 'Páginas com valores pré-definidos para seus clientes' },
  '/comercio/loja/produtos': { title: 'Meus produtos', subtitle: 'Crie e gerencie produtos digitais na loja' },
  '/comercio/loja/produtos/novo': { title: 'Novo produto', subtitle: 'Cadastre um novo produto digital' },
  '/comercio/loja/produtos/:id/editar': { title: 'Editar produto', subtitle: 'Atualize as informações do produto' },
  '/comercio/loja/vendas': { title: 'Vendas da loja', subtitle: 'Pedidos vendidos na loja' },
  '/comercio/historico': { title: 'Histórico', subtitle: 'Transações do Modo Comércio' },
  '/comercio/config': { title: 'Configurações', subtitle: 'Dados do negócio e preferências' },
  '/comercio/suporte': { title: 'Suporte', subtitle: 'Central de ajuda e atendimento' },
};

function getBreadcrumbs(pathname: string): { label: string; path?: string }[] {
  if (pathname === '/comercio/dashboard') return [];
  if (pathname.startsWith('/comercio/loja/produtos/novo')) {
    return [
      { label: 'Início', path: '/comercio/dashboard' },
      { label: 'Meus produtos', path: '/comercio/loja/produtos' },
      { label: 'Novo' },
    ];
  }
  if (pathname.match(/\/comercio\/loja\/produtos\/[^/]+\/editar/)) {
    return [
      { label: 'Início', path: '/comercio/dashboard' },
      { label: 'Meus produtos', path: '/comercio/loja/produtos' },
      { label: 'Editar' },
    ];
  }
  const labels: Record<string, string> = {
    links: 'Links',
    paginas: 'Páginas',
    loja: 'Loja',
    produtos: 'Meus produtos',
    vendas: 'Vendas',
    historico: 'Histórico',
    config: 'Configurações',
    suporte: 'Suporte',
  };
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'comercio' || segments.length < 2) return [];
  const result: { label: string; path?: string }[] = [
    { label: 'Início', path: '/comercio/dashboard' },
  ];
  if (segments[1] === 'loja' && segments[2] === 'produtos') {
    result.push({ label: 'Meus produtos' });
  } else if (segments[1] === 'loja' && segments[2] === 'vendas') {
    result.push({ label: 'Vendas da loja' });
  } else {
    result.push({ label: labels[segments[1]] || segments[1] });
  }
  return result;
}

export default function ComercioLayout({ children }: { children?: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/login');
      return;
    }
    setUser(JSON.parse(userData));
  }, [navigate]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  if (!user) return null;

  const getTitle = () => {
    const exact = titleByPath[location.pathname];
    if (exact) return exact;
    if (location.pathname.startsWith('/comercio/loja/produtos/novo')) return { title: 'Novo produto', subtitle: 'Cadastre um novo produto digital' };
    if (location.pathname.match(/\/comercio\/loja\/produtos\/[^/]+\/editar/)) return { title: 'Editar produto', subtitle: 'Atualize as informações do produto' };
    return { title: 'Modo Comércio', subtitle: '' };
  };
  const { title, subtitle } = getTitle();
  const breadcrumbs = getBreadcrumbs(location.pathname);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 h-screen bg-gray-800/50 backdrop-blur-xl border-r border-gray-700/50 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="p-4 md:p-6 border-b border-gray-700/50 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate('/comercio/dashboard')}
            className="flex items-center justify-center w-full"
            aria-label="Ir para Modo Comércio"
          >
            <img src="/logo.png" alt="PagDepix Modo Comércio" className="h-8 w-auto rounded-lg object-contain md:h-10 md:rounded-xl" />
          </button>
        </div>

        <nav className="flex-1 p-3 md:p-4 space-y-4 overflow-y-auto min-h-0">
          {menuGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => {
                      navigate(item.path);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 md:gap-3 px-3 py-2.5 md:py-3 rounded-lg md:rounded-xl transition-all text-sm md:text-base font-medium ${focusRing} ${
                      location.pathname === item.path
                        ? 'bg-gradient-to-r from-bitcoin to-orange-500 text-black shadow-lg shadow-bitcoin/30'
                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 md:p-4 border-t border-gray-700/50 flex-shrink-0">
          <div className="flex items-center gap-2.5 md:gap-3 p-2.5 md:p-3 bg-gray-700/30 rounded-lg md:rounded-xl">
            <div className="w-9 h-9 md:w-10 md:h-10 bg-gradient-to-br from-bitcoin to-orange-600 rounded-full flex items-center justify-center text-black font-bold text-sm md:text-base flex-shrink-0">
              {user.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className={`text-gray-400 hover:text-red-400 transition-colors p-1 ${focusRing} rounded`}
              title="Sair"
            >
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      <main className="lg:ml-64 flex flex-col min-h-screen">
        <header className="bg-gray-800/30 backdrop-blur-xl border-b border-gray-700/50 px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-2 md:gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className={`lg:hidden text-gray-400 hover:text-white p-1 ${focusRing} rounded`}
                  aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
                >
                  {sidebarOpen ? <X className="w-5 h-5 md:w-6 md:h-6" /> : <Menu className="w-5 h-5 md:w-6 md:h-6" />}
                </button>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-white md:text-2xl truncate">{title}</h2>
                  {subtitle && <p className="text-gray-400 text-xs md:text-sm truncate">{subtitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/comercio/links')}
                  className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black font-semibold text-xs hover:shadow-lg hover:shadow-bitcoin/30 transition-all ${focusRing}`}
                >
                  <Plus className="w-4 h-4" />
                  Novo link
                </button>
                <div className="hidden md:flex items-center gap-1.5 md:gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-gray-700/30 rounded-lg md:rounded-xl">
                  <Store className="w-4 h-4 md:w-5 md:h-5 text-bitcoin" />
                  <span className="text-xs md:text-sm text-gray-400">Modo Comércio</span>
                </div>
              </div>
            </div>
            {breadcrumbs.length > 1 && (
              <nav className="flex items-center gap-1 text-xs text-gray-400" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                    {crumb.path ? (
                      <button
                        type="button"
                        onClick={() => navigate(crumb.path!)}
                        className="hover:text-bitcoin transition-colors"
                      >
                        {crumb.label}
                      </button>
                    ) : (
                      <span className="text-gray-300">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">{children}</div>

        {/* FAB Criar link (mobile) */}
        {(location.pathname === '/comercio/dashboard' || location.pathname === '/comercio/links') && (
          <div className="fixed bottom-4 right-4 z-30 sm:hidden">
            <button
              type="button"
              onClick={() => navigate('/comercio/links')}
              className={`flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-bitcoin to-orange-500 text-black shadow-lg shadow-bitcoin/40 hover:shadow-xl hover:shadow-bitcoin/50 transition-all ${focusRing}`}
              aria-label="Criar link de pagamento"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
