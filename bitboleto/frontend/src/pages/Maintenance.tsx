import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wrench, Loader2 } from 'lucide-react';
import api from '../services/api';

export default function Maintenance() {
  const location = useLocation();
  const navigate = useNavigate();
  const stateMessage = (location.state as any)?.message;
  const [message, setMessage] = useState<string | null>(stateMessage || null);
  const [loading, setLoading] = useState(!stateMessage);

  useEffect(() => {
    const fromStorage = typeof window !== 'undefined' ? window.sessionStorage.getItem('maintenanceMessage') : null;
    if (fromStorage) {
      window.sessionStorage.removeItem('maintenanceMessage');
      setMessage(fromStorage);
      setLoading(false);
      return;
    }
    if (stateMessage) {
      setMessage(stateMessage);
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const { data } = await api.get('/maintenance/status');
        if (data.active) {
          setMessage(data.message || 'Sistema em manutenção. Tente novamente em breve.');
        } else {
          navigate('/', { replace: true });
          return;
        }
      } catch {
        setMessage('Sistema temporariamente indisponível. Tente novamente em breve.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [stateMessage, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-bitcoin animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-20 text-bitcoin text-9xl">₿</div>
        <div className="absolute bottom-20 right-20 text-bitcoin text-9xl">₿</div>
      </div>

      <div className="w-full max-w-lg relative z-10 text-center">
        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-10 shadow-2xl border border-amber-500/30">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-amber-500/20 rounded-2xl">
              <Wrench className="w-16 h-16 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Sistema em manutenção
          </h1>
          <p className="text-gray-400 mb-6">
            O PagDepix está temporariamente indisponível para melhorarmos sua experiência.
          </p>
          {message && (
            <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50 text-left">
              <p className="text-amber-200/90 text-sm font-medium mb-1">Aviso:</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{message}</p>
            </div>
          )}
          <p className="text-gray-500 text-sm mt-6">
            Volte em alguns instantes. Agradecemos a compreensão.
          </p>
        </div>
        <p className="text-gray-500 text-xs mt-6">
          PagDepix · Pagamentos via Liquid Network
        </p>
      </div>
    </div>
  );
}
