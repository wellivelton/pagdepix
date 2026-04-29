import { useState, useEffect } from 'react';
import { Bell, X, ShieldCheck } from 'lucide-react';
import { useNotifications, type PushActivationReason } from '../contexts/NotificationContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const COPY: Record<PushActivationReason, { emoji: string; question: string; detail: string; cta: string }> = {
  boleto: {
    emoji: '📄',
    question: 'Quer ser avisado quando este boleto for liquidado?',
    detail: 'Uma notificação chegará no seu celular assim que o pagamento for confirmado — mesmo com o site fechado.',
    cta: 'Sim, me avise!',
  },
  recarga: {
    emoji: '📱',
    question: 'Quer receber o aviso quando a recarga for concluída?',
    detail: 'Você vai saber na hora quando sua recarga for processada — sem precisar ficar verificando.',
    cta: 'Sim, me avise!',
  },
  pix: {
    emoji: '⚡',
    question: 'Quer acompanhar seu pagamento em tempo real?',
    detail: 'Você receberá uma notificação imediata quando o pagamento via Depix for confirmado.',
    cta: 'Sim, me avise!',
  },
};

export default function PushActivationModal() {
  const { pushActivationReason, dismissPushActivation } = useNotifications();
  const { subscribe } = usePushNotifications();

  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [success, setSuccess] = useState(false);

  // Slide-in rápido — pergunta contextual logo após a ação
  useEffect(() => {
    if (!pushActivationReason) { setVisible(false); setSuccess(false); return; }
    const t = setTimeout(() => setVisible(true), 350);
    return () => clearTimeout(t);
  }, [pushActivationReason]);

  if (!pushActivationReason) return null;

  const copy = COPY[pushActivationReason];
  const handleActivate = async () => {
    setSubscribing(true);
    const ok = await subscribe();
    setSubscribing(false);
    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        setVisible(false);
        setTimeout(() => dismissPushActivation(), 400); // aguarda animação
      }, 2200);
    } else if (Notification.permission === 'denied') {
      // Usuário bloqueou no navegador — fechar modal
      dismissPushActivation();
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(() => dismissPushActivation(), 400);
  };

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-4 transition-all duration-400 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-full max-w-md bg-gray-900 border border-gray-700/70 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        {/* Accent bar */}
        <div className="h-1 bg-gradient-to-r from-bitcoin via-orange-400 to-yellow-400" />

        <div className="p-5">
          {success ? (
            <div className="flex items-center gap-3 py-1">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-white text-sm">Notificações ativadas!</p>
                <p className="text-xs text-gray-400">Você receberá avisos em tempo real sobre seus pagamentos.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none">{copy.emoji}</span>
                  <p className="font-bold text-white text-sm leading-snug">{copy.question}</p>
                </div>
                <button
                  onClick={handleDismiss}
                  className="p-1 rounded-lg text-gray-600 hover:text-gray-400 flex-shrink-0 transition-colors"
                  aria-label="Fechar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-4 leading-relaxed">{copy.detail}</p>

              <div className="flex gap-2">
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2.5 rounded-xl bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 hover:text-gray-300 transition-colors"
                >
                  Não, obrigado
                </button>
                <button
                  onClick={handleActivate}
                  disabled={subscribing}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black text-sm font-bold hover:shadow-lg hover:shadow-bitcoin/30 disabled:opacity-70 transition-all"
                >
                  {subscribing ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                      Ativando...
                    </span>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      {copy.cta}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
