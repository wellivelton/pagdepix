import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.endsWith('/api') ? import.meta.env.VITE_API_URL : `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`)
  : (import.meta.env.PROD ? (typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api') : 'http://localhost:3001/api');

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawToken = searchParams.get('token');
  let token: string | null = null;
  if (rawToken) {
    try {
      token = decodeURIComponent(rawToken).trim();
    } catch {
      token = rawToken.trim();
    }
  }

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Link inválido. Use o link que enviamos no seu email.');
      return;
    }

    axios
      .get(`${API_URL}/auth/verify-email`, { params: { token } })
      .then((res) => {
        setStatus('success');
        setMessage(res.data?.message || 'Email confirmado com sucesso. Você já pode fazer login.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(
          err.response?.data?.error || 'Link inválido ou expirado. Solicite um novo email de verificação.'
        );
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-gray-700/50 text-center">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="PagDepix" className="w-16 h-16 rounded-2xl object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">PagDepix</h1>
        <p className="text-gray-400 text-sm mb-8">Verificação de email</p>

        {status === 'loading' && (
          <>
            <Loader2 className="w-12 h-12 text-bitcoin animate-spin mx-auto mb-4" />
            <p className="text-gray-300">Confirmando seu email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <p className="text-white mb-6">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold py-3 rounded-xl hover:shadow-lg transition-all"
            >
              Ir para o login
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <p className="text-gray-300 mb-6">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-gray-700 text-white font-semibold py-3 rounded-xl hover:bg-gray-600 transition-all"
            >
              Voltar ao login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
