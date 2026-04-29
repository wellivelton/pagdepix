import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.endsWith('/api') ? import.meta.env.VITE_API_URL : `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`)
  : (import.meta.env.PROD ? (typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api') : 'http://localhost:3001/api');

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Informe seu email.');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/forgot-password`, { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar. Tente novamente.');
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
        <p className="text-gray-400 text-sm text-center mb-8">Recuperação de senha</p>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
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
                  Enviando...
                </>
              ) : (
                'Enviar instruções'
              )}
            </button>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
            <p className="text-gray-300">
              Se o email existir, você receberá instruções para redefinir sua senha. Verifique também a pasta de spam.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3 rounded-xl hover:shadow-lg transition-all"
            >
              Voltar ao login
            </button>
          </div>
        )}

        <Link
          to="/login"
          className="mt-6 flex items-center justify-center gap-2 text-gray-400 hover:text-bitcoin text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
