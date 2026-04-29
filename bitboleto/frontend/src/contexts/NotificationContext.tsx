import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

export interface UserNotification {
  id: string;
  title: string;
  body: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export type PushActivationReason = 'boleto' | 'recarga' | 'pix';

interface NotificationContextValue {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: (page?: number) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addLocal: (n: UserNotification) => void;
  // Push activation modal
  pushActivationReason: PushActivationReason | null;
  triggerPushActivation: (reason: PushActivationReason) => void;
  dismissPushActivation: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL = 30_000;
// Sem cooldown por dismissal — "Não obrigado" não bloqueia futuras perguntas
// O único guard permanente é Notification.permission === 'denied' (browser-level)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushActivationReason, setPushActivationReason] = useState<PushActivationReason | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLoggedIn = () => Boolean(localStorage.getItem('token'));

  const fetchUnreadCount = useCallback(async () => {
    if (!isLoggedIn()) return;
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnreadCount(data.count ?? 0);
    } catch { /* silencioso */ }
  }, []);

  const fetchNotifications = useCallback(async (page = 1) => {
    if (!isLoggedIn()) return;
    setLoading(true);
    try {
      const { data } = await api.get('/notifications/history', { params: { page, limit: 20 } });
      if (page === 1) {
        setNotifications(data.notifications);
      } else {
        setNotifications((prev) => [...prev, ...data.notifications]);
      }
      setUnreadCount(data.unreadCount ?? 0);
    } catch { /* silencioso */ } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silencioso */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* silencioso */ }
  }, []);

  const addLocal = useCallback((n: UserNotification) => {
    setNotifications((prev) => [n, ...prev]);
    setUnreadCount((c) => c + 1);
  }, []);

  /**
   * Chamado pelas páginas após ação importante (boleto, recarga, PIX).
   * Decide se deve exibir o modal de ativação de push.
   */
  const triggerPushActivation = useCallback((reason: PushActivationReason) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') return;
    if (pushActivationReason === reason) return;
    setPushActivationReason(reason);
  }, [pushActivationReason]);

  const dismissPushActivation = useCallback(() => {
    setPushActivationReason(null);
    // Não grava cooldown — "Não obrigado" é apenas para esta ação,
    // nas próximas o usuário será perguntado novamente
  }, []);

  // Initial fetch + polling quando logado
  useEffect(() => {
    if (!isLoggedIn()) return;
    fetchNotifications();

    intervalRef.current = setInterval(fetchUnreadCount, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications, fetchUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markRead,
        markAllRead,
        addLocal,
        pushActivationReason,
        triggerPushActivation,
        dismissPushActivation,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
