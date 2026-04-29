import { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface RateLockCountdownProps {
  expiresAt: string | Date | null;
  onExpire?: () => void;
}

export function RateLockCountdown({ expiresAt, onExpire }: RateLockCountdownProps) {
  const [remaining, setRemaining] = useState<number>(0);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();

    const update = () => {
      const diff = Math.max(0, target - Date.now());
      setRemaining(Math.ceil(diff / 1000));
      if (diff <= 0 && !expired) {
        setExpired(true);
        onExpire?.();
      }
    };

    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  if (!expiresAt) return null;

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const isLow = remaining > 0 && remaining <= 60;

  if (expired) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>Cotação expirada. Crie um novo pagamento com cotação atualizada.</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
      isLow
        ? 'bg-yellow-500/10 border border-yellow-500/50 text-yellow-400'
        : 'bg-purple-500/10 border border-purple-500/30 text-purple-300'
    }`}>
      <Clock className="w-4 h-4 flex-shrink-0" />
      <span>Cotação válida por {min}:{sec.toString().padStart(2, '0')}</span>
    </div>
  );
}
