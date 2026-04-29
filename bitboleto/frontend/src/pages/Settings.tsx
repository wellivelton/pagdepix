import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon,
  User,
  Mail,
  Send,
  Lock,
  Shield,
  Calendar,
  DollarSign,
  MapPin,
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [editForm, setEditForm] = useState({
    name: '',
    telegram: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/user/profile');
      setUser(data);
      setEditForm({
        name: data.name,
        telegram: data.telegram,
      });
    } catch (err) {
      console.error('Erro ao carregar perfil:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const { data } = await api.put('/user/profile', editForm);
      
      // Atualizar localStorage
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...currentUser, ...data.user }));
      
      setUser(data.user);
      setSuccess('Perfil atualizado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setError('');
    setSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }

    setSaving(true);

    try {
      await api.put('/user/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      
      setSuccess('Senha alterada com sucesso!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-bitcoin to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-bitcoin/20">
            <SettingsIcon className="w-8 h-8 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Configurações</h1>
            <p className="text-gray-400">Gerencie suas informações pessoais e segurança</p>
          </div>
        </div>
      </div>

      {/* Mensagens */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 text-green-400 p-4 rounded-xl mb-6 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* Editar Perfil */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-bitcoin/10 rounded-xl">
            <User className="w-6 h-6 text-bitcoin" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Informações Pessoais</h2>
            <p className="text-gray-400 text-sm">Atualize seu nome e Telegram</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Nome Completo
            </label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full pl-12 pr-4 py-4 bg-gray-900/30 rounded-xl border border-gray-700 text-gray-500 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">O email não pode ser alterado</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Telegram
            </label>
            <div className="relative">
              <Send className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={editForm.telegram}
                onChange={(e) => setEditForm({ ...editForm, telegram: e.target.value })}
                placeholder="@seuusuario"
                className="w-full pl-12 pr-4 py-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
              />
            </div>
          </div>

          <button
            onClick={handleUpdateProfile}
            disabled={saving}
            className="w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-4 rounded-xl hover:shadow-2xl hover:shadow-bitcoin/50 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alterar Senha */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Alterar Senha</h2>
            <p className="text-gray-400 text-sm">Mantenha sua conta segura</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Senha Atual
            </label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Nova Senha
            </label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
            />
            <p className="text-xs text-gray-500 mt-1">Mínimo de 6 caracteres</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="w-full p-4 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
            />
          </div>

          <button
            onClick={handleChangePassword}
            disabled={saving || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Alterando...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Alterar Senha
              </>
            )}
          </button>
        </div>
      </div>

      {/* Informações da Conta */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-green-500/10 rounded-xl">
            <Shield className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Informações da Conta</h2>
            <p className="text-gray-400 text-sm">Dados sobre sua conta e atividade</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <DollarSign className="w-4 h-4" />
              <span>Total Pago</span>
            </div>
            <p className="text-2xl font-bold text-white">
              R$ {user?.totalPaid?.toFixed(2) || '0.00'}
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Calendar className="w-4 h-4" />
              <span>Membro desde</span>
            </div>
            <p className="text-lg font-bold text-white">
              {user?.createdAt 
                ? new Date(user.createdAt).toLocaleDateString('pt-BR')
                : 'N/A'}
            </p>
          </div>

          <div className="bg-gray-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Calendar className="w-4 h-4" />
              <span>Último Login</span>
            </div>
            <p className="text-lg font-bold text-white">
              {user?.lastLoginAt 
                ? new Date(user.lastLoginAt).toLocaleString('pt-BR')
                : 'Nunca'}
            </p>
          </div>
        </div>

        {user?.lastLoginIp && (
          <div className="mt-6 pt-6 border-t border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <MapPin className="w-4 h-4" />
              <span>Último IP de Acesso</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-bitcoin font-mono text-sm">
                {user.lastLoginIp}
              </code>
              {user.lastLoginCity || user.lastLoginCountry ? (
                <span className="text-xs text-gray-500">
                  ({user.lastLoginCity || ''}{user.lastLoginCity && user.lastLoginCountry ? ' - ' : ''}{user.lastLoginCountry || ''})
                </span>
              ) : null}
            </div>
            {user.lastLoginIsVpn && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                VPN detectada no último acesso
              </p>
            )}
          </div>
        )}
      </div>

      {/* Status da Conta */}
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50">
        <h2 className="text-xl font-bold text-white mb-4">Status da Conta</h2>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl">
            <span className="text-gray-400">Status</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              user?.isActive 
                ? 'bg-green-500/10 text-green-400 border border-green-500/40'
                : 'bg-red-500/10 text-red-400 border border-red-500/40'
            }`}>
              {user?.isActive ? 'Ativa' : 'Inativa'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl">
            <span className="text-gray-400">Bloqueio</span>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
              user?.isBlocked 
                ? 'bg-red-500/10 text-red-400 border border-red-500/40'
                : 'bg-green-500/10 text-green-400 border border-green-500/40'
            }`}>
              {user?.isBlocked ? 'Bloqueada' : 'Liberada'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl">
            <span className="text-gray-400">Tipo de conta</span>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-bitcoin/10 text-bitcoin border border-bitcoin/40">
              {user?.role === 'ADMIN' ? 'Administrador' : user?.role === 'AFFILIATE' ? 'Afiliado' : 'Usuário'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
