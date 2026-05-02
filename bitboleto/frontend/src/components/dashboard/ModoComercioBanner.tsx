import { X, Zap, Clock, Plug } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ModoComercioBannerProps {
  onDismiss: () => void;
}

const BENEFITS = [
  { icon: Zap,   title: 'Taxa competitiva',    desc: '0,5% + R$0,99 por cobrança' },
  { icon: Clock, title: 'Liquidação rápida',   desc: 'Receba em DePix instantaneamente' },
  { icon: Plug,  title: 'API + QR code',        desc: 'Integre ao seu sistema facilmente' },
];

export default function ModoComercioBanner({ onDismiss }: ModoComercioBannerProps) {
  const navigate = useNavigate();

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-app-stroke bg-app-surface shadow-card-premium"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 0% 50%, rgba(247,147,26,0.07) 0%, transparent 50%), radial-gradient(ellipse at 100% 50%, rgba(52,211,153,0.06) 0%, transparent 50%)',
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar banner"
        className="absolute top-3 right-3 p-1 rounded-md text-app-subtle hover:text-app-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="px-5 pt-5 pb-4">
        {/* Headline */}
        <div className="mb-4 pr-6">
          <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest mb-1">
            Para seu negócio
          </p>
          <p className="text-base font-bold text-app-text leading-snug">
            Receba pagamentos em cripto{' '}
            <span className="text-bitcoin">sem custódia</span>{' '}
            com o Modo Comércio
          </p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-2.5">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-app-elevated border border-app-stroke flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-app-muted" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-semibold text-app-text leading-tight">{title}</p>
                <p className="text-xs text-app-subtle leading-tight mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => navigate('/comercio/ativar')}
          className="
            inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
            text-xs font-semibold
            bg-bitcoin/10 text-bitcoin border border-bitcoin/25
            hover:bg-bitcoin/15 hover:border-bitcoin/35
            transition-all duration-150
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50
          "
        >
          Ativar Modo Comércio
        </button>
      </div>
    </div>
  );
}
