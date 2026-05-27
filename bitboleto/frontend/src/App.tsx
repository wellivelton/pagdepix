import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { CartProvider } from './contexts/CartContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import PushActivationModal from './components/PushActivationModal';
import Landing from './pages/Landing';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RecargaCelular from './pages/RecargaCelular';
import PayBoleto from './pages/PayBoleto';
import EnviarPix from './pages/EnviarPix';
import AreaPix from './pages/AreaPix';
import PixCopiaCola from './pages/PixCopiaCola';
import History from './pages/History';
import Admin from './pages/Admin';
import AdminWallet from './pages/AdminWallet';
import Support from './pages/Support';
import Settings from './pages/Settings';
import AffiliateEarnings from './pages/AffiliateEarnings';
import AffiliateApiPanel from './pages/AffiliateApiPanel';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyTelegram from './pages/VerifyTelegram';
import Termos from './pages/Termos';
import Privacidade from './pages/Privacidade';
import Regras from './pages/Regras';
import Afiliados from './pages/Afiliados';
import CommerceLanding from './pages/CommerceLanding';
import AtivarComercio from './pages/AtivarComercio';
import ComercioDashboard from './pages/comercio/ComercioDashboard';
import ComercioLinks from './pages/comercio/ComercioLinks';
import ComercioPaginas from './pages/comercio/ComercioPaginas';
import ComercioHistorico from './pages/comercio/ComercioHistorico';
import ComercioConfig from './pages/comercio/ComercioConfig';
import SellerProducts from './pages/comercio/SellerProducts';
import CreateProduct from './pages/comercio/CreateProduct';
import EditProduct from './pages/comercio/EditProduct';
import SellerOrders from './pages/comercio/SellerOrders';
import SellerBalance from './pages/comercio/SellerBalance';
import SellerCoupons from './pages/comercio/SellerCoupons';
import SellerReports from './pages/comercio/SellerReports';
import ComercioColateral from './pages/comercio/ComercioColateral';
import ComercioApi from './pages/comercio/ComercioApi';
import Maintenance from './pages/Maintenance';
import PayLink from './pages/PayLink';
import PayPage from './pages/PayPage';
import Marketplace from './pages/marketplace/Marketplace';
import ProductDetail from './pages/marketplace/ProductDetail';
import Checkout from './pages/marketplace/Checkout';
import Cart from './pages/marketplace/Cart';
import CheckoutCart from './pages/marketplace/CheckoutCart';
import MyPurchases from './pages/marketplace/MyPurchases';
import OrderDetail from './pages/marketplace/OrderDetail';
import MarketplaceNotifications from './pages/marketplace/MarketplaceNotifications';
import Wishlist from './pages/marketplace/Wishlist';
import SellerPage from './pages/marketplace/SellerPage';
import PublicStorePage from './pages/marketplace/PublicStorePage';
import Swap from './pages/Swap';
import PagamentoConta from './pages/PagamentoConta';

function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(user.role === 'ADMIN' ? true : null);

  useEffect(() => {
    if (user.role === 'ADMIN') {
      setAllowed(true);
      return;
    }
    api.get('/maintenance/status')
      .then(({ data }) => {
        if (data.active) {
          navigate('/manutencao', { state: { message: data.message }, replace: true });
          setAllowed(false);
        } else {
          setAllowed(true);
        }
      })
      .catch(() => setAllowed(true));
  }, [user.role, navigate]);

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-bitcoin border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}

function ProtectedRoute({ children, requireVerified = true }: { children: React.ReactNode; requireVerified?: boolean }) {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState<{loading: boolean; verified: boolean; role: string} | null>(null);

  useEffect(() => {
    // Se não tem token, redirecionar para login
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    // Se não precisa verificar, permitir acesso
    if (!requireVerified) {
      setVerificationStatus({ loading: false, verified: true, role: 'USER' });
      return;
    }

    // Buscar perfil do backend para verificar status KYC
    api.get('/user/profile')
      .then(({ data }) => {
        const kycLevel = data.kycStatus?.level ?? 0;
        const verified = kycLevel >= 1 || data.role === 'ADMIN';
        setVerificationStatus({
          loading: false,
          verified,
          role: data.role,
        });

        // Se KYC nível 0 (sem e-mail verificado) e não está na página KYC, redirecionar
        if (kycLevel < 1 && data.role !== 'ADMIN') {
          navigate('/kyc', { replace: true });
        }
      })
      .catch((err) => {
        if (err?.response?.status === 403) {
          navigate('/kyc', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      });
  }, [token, requireVerified, navigate]);

  // Mostrar loading enquanto verifica
  if (!verificationStatus || verificationStatus.loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-bitcoin border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Se não verificado, não renderizar (já redirecionou)
  if (!verificationStatus.verified && requireVerified) {
    return null;
  }

  return <MaintenanceGuard>{children}</MaintenanceGuard>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.role === 'ADMIN' ? <>{children}</> : <Navigate to="/dashboard" />;
}

/** Página em manutenção: apenas ADMIN acessa; demais veem aviso. */
function AdminOnlyGuard({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role === 'ADMIN') return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="text-6xl">🔧</div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Página em manutenção</h1>
        <p className="text-gray-400 max-w-sm">
          Esta funcionalidade está temporariamente indisponível para manutenção.
          Em breve estará disponível novamente.
        </p>
      </div>
    </div>
  );
}
/** Alias para compatibilidade com rotas da loja já existentes. */
const LojaAdminGuard = AdminOnlyGuard;

function AffiliateRoute({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.role === 'AFFILIATE' ? <>{children}</> : <Navigate to="/dashboard" />;
}

/** Acesso ao Modo Comércio: logado + CommercePartner aprovado (ou ADMIN). */
function CommerceRoute({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const allowed = user.role === 'COMMERCE' || user.role === 'ADMIN' || user.commercePartner === true;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
      <CartProvider>
      <NotificationProvider>
      <PushActivationModal />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/manutencao" element={<Maintenance />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        {/* Redireciona para a página única de verificação (apenas Telegram) */}
        <Route path="/confirmar-conta" element={<Navigate to="/kyc" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/termos" element={<Termos />} />
        <Route path="/privacidade" element={<Privacidade />} />
        <Route path="/afiliados" element={<Afiliados />} />
        <Route path="/pay/:slug" element={<PayLink />} />
        <Route path="/page/:slug" element={<PayPage />} />
        <Route path="/loja" element={<ProtectedRoute><Dashboard><LojaAdminGuard><Marketplace /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/produto/:slug" element={<ProtectedRoute><Dashboard><LojaAdminGuard><ProductDetail /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/checkout/:productId" element={<ProtectedRoute><Dashboard><LojaAdminGuard><Checkout /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/carrinho" element={<ProtectedRoute><Dashboard><LojaAdminGuard><Cart /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/favoritos" element={<ProtectedRoute><Dashboard><LojaAdminGuard><Wishlist /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/checkout-cart" element={<ProtectedRoute><Dashboard><LojaAdminGuard><CheckoutCart /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/minhas-compras" element={<ProtectedRoute><Dashboard><LojaAdminGuard><MyPurchases /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/minhas-compras/:orderId" element={<ProtectedRoute><Dashboard><LojaAdminGuard><OrderDetail /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route path="/loja/notificacoes" element={<ProtectedRoute><Dashboard><LojaAdminGuard><MarketplaceNotifications /></LojaAdminGuard></Dashboard></ProtectedRoute>} />
        <Route
          path="/swap"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><Swap /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route path="/loja/vendedor/:sellerId" element={<LojaAdminGuard><SellerPage /></LojaAdminGuard>} />
        <Route path="/loja/:storeSlug" element={<LojaAdminGuard><PublicStorePage /></LojaAdminGuard>} />
        {/* Landing B2B Modo Comércio — canal principal de aquisição */}
        <Route path="/comercio" element={<CommerceLanding />} />
        <Route path="/comercio/cadastro" element={<Navigate to="/login" replace />} />
        {/* Modo Comércio — usa Dashboard como layout pai */}
        <Route path="/comercio/dashboard" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioDashboard /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/links" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioLinks /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/paginas" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioPaginas /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/produtos" element={<ProtectedRoute><CommerceRoute><Dashboard><SellerProducts /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/produtos/novo" element={<ProtectedRoute><CommerceRoute><Dashboard><CreateProduct /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/produtos/:productId/editar" element={<ProtectedRoute><CommerceRoute><Dashboard><EditProduct /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/vendas" element={<ProtectedRoute><CommerceRoute><Dashboard><SellerOrders /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/saldo" element={<ProtectedRoute><CommerceRoute><Dashboard><SellerBalance /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/cupons" element={<ProtectedRoute><CommerceRoute><Dashboard><SellerCoupons /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/loja/relatorios" element={<ProtectedRoute><CommerceRoute><Dashboard><SellerReports /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/historico" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioHistorico /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/config" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioConfig /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/colateral" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioColateral /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/api" element={<ProtectedRoute><CommerceRoute><Dashboard><ComercioApi /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/suporte" element={<ProtectedRoute><CommerceRoute><Dashboard><Support /></Dashboard></CommerceRoute></ProtectedRoute>} />
        <Route path="/comercio/ativar" element={<ProtectedRoute><Dashboard><AtivarComercio /></Dashboard></ProtectedRoute>} />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/recarga"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><RecargaCelular /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route path="/tv" element={<Navigate to="/loja" replace />} />
        <Route
          path="/pagar"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><PayBoleto /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pagar-conta"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><PagamentoConta /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/area-pix"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><AreaPix /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pix-copia-cola"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><PixCopiaCola /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/enviar-pix"
          element={
            <ProtectedRoute>
              <Dashboard>
                <AdminOnlyGuard><EnviarPix /></AdminOnlyGuard>
              </Dashboard>
            </ProtectedRoute>
          }
        />
        <Route 
          path="/historico" 
          element={
            <ProtectedRoute>
              <Dashboard>
                <History />
              </Dashboard>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
              <AdminRoute>
                <Dashboard>
                  <Admin />
                </Dashboard>
              </AdminRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/suporte" 
          element={
            <ProtectedRoute>
              <Dashboard>
                <Support />
              </Dashboard>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/regras" 
          element={
            <ProtectedRoute>
              <Dashboard>
                <Regras />
              </Dashboard>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/config" 
          element={
            <ProtectedRoute>
              <Dashboard>
                <Settings />
              </Dashboard>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/kyc" 
          element={
            <ProtectedRoute requireVerified={false}>
              <Dashboard>
                <VerifyTelegram />
              </Dashboard>
            </ProtectedRoute>
          } 
        />
        <Route path="/verificar-telegram" element={<Navigate to="/kyc" replace />} />
        <Route 
          path="/admin/carteira" 
          element={
            <ProtectedRoute>
              <AdminRoute>
                <Dashboard>
                  <AdminWallet />
                </Dashboard>
              </AdminRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/afiliado/ganhos" 
          element={
            <ProtectedRoute>
              <AffiliateRoute>
                <Dashboard>
                  <AffiliateEarnings />
                </Dashboard>
              </AffiliateRoute>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/afiliado/api" 
          element={
            <ProtectedRoute>
              <AffiliateRoute>
                <Dashboard>
                  <AffiliateApiPanel />
                </Dashboard>
              </AffiliateRoute>
            </ProtectedRoute>
          } 
        />
      </Routes>
      </NotificationProvider>
      </CartProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
