import { useState, useRef, useEffect } from 'react';
import { Bell, BellRing, CheckCheck, X, ExternalLink, Loader2 } from 'lucide-react';
import { useNotifications } from '../contexts/NotificationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useNavigate } from 'react-router-dom';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  return `${d}d`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead } = useNotifications();
  const { permission, isSubscribed, subscribe } = usePushNotifications();

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Push prompt no sino só aparece se o usuário ainda não ativou E nunca viu o
  // modal contextual nesta sessão (fallback para usuários que ignoraram todas as ações)
  useEffect(() => {
    if (!open) return;
    if (isSubscribed || permission === 'denied' || permission === 'unsupported') return;
    const uid = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').id ?? 'anon'; } catch { return 'anon'; } })();
    if (sessionStorage.getItem(`push_activation_shown_${uid}`)) return;
    if (sessionStorage.getItem(`push_prompt_shown_${uid}`)) return;
    const t = setTimeout(() => {
      setShowPushPrompt(true);
      sessionStorage.setItem(`push_prompt_shown_${uid}`, '1');
    }, 2000);
    return () => clearTimeout(t);
  }, [open, isSubscribed, permission]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) fetchNotifications();
  };

  const handleNotificationClick = async (n: { id: string; read: boolean; link?: string | null }) => {
    if (!n.read) await markRead(n.id);
    if (n.link) {
      if (n.link.startsWith('http')) {
        window.open(n.link, '_blank');
      } else {
        navigate(n.link);
        setOpen(false);
      }
    }
  };

  const handleEnablePush = async () => {
    setShowPushPrompt(false);
    const ok = await subscribe();
    if (!ok && Notification.permission === 'denied') {
      alert('Permissão de notificações bloqueada. Habilite nas configurações do navegador.');
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
        aria-label="Notificações"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 text-bitcoin" />
        ) : (
          <Bell className="w-5 h-5" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-gray-900 border border-gray-700/60 rounded-2xl shadow-2xl shadow-black/50 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-bitcoin" />
              <span className="font-semibold text-white text-sm">Notificações</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-bitcoin/20 text-bitcoin text-xs font-bold rounded-full">
                  {unreadCount} nova{unreadCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-400 transition-colors"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Todas lidas</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Push prompt */}
          {showPushPrompt && (
            <div className="mx-3 mt-3 p-3 bg-bitcoin/10 border border-bitcoin/30 rounded-xl">
              <p className="text-xs text-gray-300 mb-2">
                🔔 <span className="font-semibold text-white">Ative as notificações</span> e fique sabendo na hora quando seu pagamento for aprovado.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleEnablePush}
                  className="flex-1 py-1.5 rounded-lg bg-bitcoin text-black text-xs font-bold hover:bg-orange-400 transition-colors"
                >
                  Ativar
                </button>
                <button
                  onClick={() => setShowPushPrompt(false)}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs hover:bg-gray-700 transition-colors"
                >
                  Agora não
                </button>
              </div>
            </div>
          )}

          {/* Notification list */}
          <div className="overflow-y-auto max-h-[380px] divide-y divide-gray-800/50">
            {loading && notifications.length === 0 ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-bitcoin animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Nenhuma notificação ainda</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-gray-800/40 ${!n.read ? 'bg-bitcoin/5' : ''}`}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full block mt-0.5 ${!n.read ? 'bg-bitcoin' : 'bg-transparent'}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium truncate ${!n.read ? 'text-white' : 'text-gray-300'}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[10px] text-gray-500">{timeAgo(n.createdAt)}</span>
                        {n.link && <ExternalLink className="w-3 h-3 text-gray-600" />}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-700/50 bg-gray-900/50">
              <button
                onClick={() => { fetchNotifications(); }}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Atualizar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
