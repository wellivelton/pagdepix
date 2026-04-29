import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import api from '../services/api';

interface Notification {
  id: string;
  title: string;
  body: string;
  imageUrl?: string | null;
  buttonText?: string | null;
  buttonUrl?: string | null;
  type: 'POPUP' | 'BANNER';
}

const MAX_POPUPS_PER_SESSION = 5;

export default function NotificationPopup() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/notifications/me')
      .then(({ data }) => {
        const list = data.notifications || [];
        setNotifications(list.slice(0, MAX_POPUPS_PER_SESSION));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const current = notifications[currentIndex];

  const handleView = (id: string) => {
    api.post(`/notifications/${id}/view`).catch(() => {});
  };

  useEffect(() => {
    if (current?.id) handleView(current.id);
  }, [current?.id]);

  if (loading || !current) return null;

  const handleClose = () => {
    if (current) handleView(current.id);
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setNotifications([]);
    }
  };

  const handleButtonClick = () => {
    api.post(`/notifications/${current.id}/click`).catch(() => {});
    handleView(current.id);
    if (current.buttonUrl) {
      window.open(current.buttonUrl, '_blank', 'noopener,noreferrer');
    }
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setNotifications([]);
    }
  };

  if (current.type === 'BANNER') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-4 py-2 bg-bitcoin/20 border-b border-bitcoin/40 text-white">
        <p className="text-sm truncate flex-1">{current.title}</p>
        <div className="flex items-center gap-2 flex-shrink-0">
          {current.buttonText && current.buttonUrl && (
            <button
              type="button"
              onClick={handleButtonClick}
              className="px-3 py-1 text-xs font-medium bg-bitcoin text-black rounded-lg hover:bg-orange-400"
            >
              {current.buttonText}
            </button>
          )}
          <button type="button" onClick={handleClose} className="p-1 hover:bg-white/10 rounded" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => handleView(current.id)}>
      <div
        className="bg-gray-900 rounded-2xl border border-gray-700 max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-start justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-bold text-white flex-1 pr-10">{current.title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {current.imageUrl && (
            <img
              src={current.imageUrl}
              alt=""
              className="w-full h-40 object-cover rounded-lg mb-4"
            />
          )}
          <div className="text-gray-300 text-sm whitespace-pre-wrap">{current.body}</div>
        </div>
        <div className="p-4 border-t border-gray-700 flex gap-2">
          {current.buttonText && current.buttonUrl ? (
            <button
              type="button"
              onClick={handleButtonClick}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-bitcoin to-orange-500 text-black font-semibold rounded-xl hover:shadow-lg hover:shadow-bitcoin/30 transition-all"
            >
              {current.buttonText}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-3 border border-gray-600 text-gray-300 rounded-xl hover:border-gray-500 hover:text-white transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
