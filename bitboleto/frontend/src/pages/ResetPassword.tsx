import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowLeft, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.endsWith('/api') ? import.meta.env.VITE_API_URL : `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`)
  : (import.meta.env.PROD ? (typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api') : 'http://localhost:3001/api');

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      return;
    }
    axios
      .get(`${API_URL}/auth/validate-reset-token`, { params: { token } })
      .then(() => setTokenValid(true))
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        newPassword,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha. O link pode ter expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700/50">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="PagDepix" className="w-16 h-16 rounded-2xl object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-white text-center mb-2">PagDepix</h1>
        <p className="text-gray-400 text-sm text-center mb-8">Nova senha</p>

        {tokenValid === null && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 text-bitcoin animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Validando link...</p>
          </div>
        )}

        {tokenValid === false && (
          <div className="text-center space-y-4">
            <XCircle className="w-16 h-16 text-red-400 mx-auto" />
            <p className="text-gray-300">
              Link inválido ou expirado. Solicite uma nova recuperação de senha.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block w-full bg-gray-700 text-white font-semibold py-3 rounded-xl hover:bg-gray-600 transition-all text-center"
            >
              Solicitar novo link
            </Link>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-gray-400 hover:text-bitcoin text-sm transition-colors mt-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao login
            </Link>
          </div>
        )}

        {tokenValid === true && !success && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Nova senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  className="w-full pl-12 pr-4 py-3 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Confirmar senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha"
                  minLength={6}
                  className="w-full pl-12 pr-4 py-3 bg-gray-900/50 rounded-xl border border-gray-700 focus:border-bitcoin focus:ring-2 focus:ring-bitcoin/20 outline-none text-white"
                  required
                />
              </div>
            </div>
            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3 rounded-xl hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Redefinir senha'
              )}
            </button>
          </form>
        )}

        {tokenValid === true && success && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
            <p className="text-gray-300">
              Senha alterada com sucesso. Faça login com a nova senha.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3 rounded-xl hover:shadow-lg transition-all"
            >
              Ir para o login
            </button>
          </div>
        )}

        {tokenValid !== false && !success && (
          <Link
            to="/login"
            className="mt-6 flex items-center justify-center gap-2 text-gray-400 hover:text-bitcoin text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao login
          </Link>
        )}
      </div>
    </div>
  );
}
