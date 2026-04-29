import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { Bell } from 'lucide-react';

export default function MarketplaceNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = (unreadOnly?: boolean) => {
    const params = unreadOnly ? { unreadOnly: 'true' } : {};
    api.get('/marketplace/notifications', { params })
      .then(({ data }) => {
        setNotifications(data.notifications || []);
        setTotal(data.total ?? 0);
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const markAsRead = (id: string) => {
    api.put(`/marketplace/notifications/${id}/read`)
      .then(() => load())
      .catch(() => {});
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-gray-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <Bell className="w-6 h-6 text-bitcoin" />
        Notificações da loja
      </h1>
      {notifications.length === 0 ? (
        <p className="text-gray-400">Nenhuma notificação.</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-4 transition ${
                n.readAt
                  ? 'bg-gray-800/30 border-gray-700/50 opacity-80'
                  : 'bg-gray-800/50 border-gray-700/50'
              }`}
            >
              {n.marketOrderId ? (
                <Link
                  to={`/minhas-compras/${n.marketOrderId}`}
                  onClick={() => !n.readAt && markAsRead(n.id)}
                  className="block hover:opacity-90"
                >
                  <p className="font-medium text-white">{n.title}</p>
                  {n.body && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{n.body}</p>}
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(n.createdAt).toLocaleString('pt-BR')}
                  </p>
                </Link>
              ) : (
                <div>
                  <p className="font-medium text-white">{n.title}</p>
                  {n.body && <p className="text-sm text-gray-400 mt-1">{n.body}</p>}
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(n.createdAt).toLocaleString('pt-BR')}
                  </p>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => markAsRead(n.id)}
                      className="mt-2 text-xs text-bitcoin hover:underline"
                    >
                      Marcar como lida
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
