import { type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type QuickActionVariant = 'primary' | 'secondary';

interface QuickActionCardProps {
  icon: LucideIcon;
  label: string;
  sublabel: string;
  path: string;
  variant?: QuickActionVariant;
  badge?: { label: string; color: 'green' | 'yellow' };
}

export default function QuickActionCard({
  icon: Icon,
  label,
  sublabel,
  path,
  variant = 'secondary',
  badge,
}: QuickActionCardProps) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className={`
        relative w-full flex items-center gap-3 p-4 rounded-xl border text-left
        transition-all duration-200 group shadow-card-inset
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50
        hover:-translate-y-px active:scale-[0.98]
        ${variant === 'primary'
          ? 'bg-bitcoin/8 border-bitcoin/20 hover:bg-bitcoin/12 hover:border-bitcoin/30'
          : 'bg-app-surface border-app-stroke hover:bg-app-elevated hover:border-app-stroke'
        }
      `}
    >
      {badge && (
        <span
          className={`
            absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none
            ${badge.color === 'green'
              ? 'bg-green-500/15 text-green-400'
              : 'bg-yellow-500/15 text-yellow-400'
            }
          `}
        >
          {badge.label}
        </span>
      )}

      {/* Icon container */}
      <div
        className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          transition-colors duration-200
          ${variant === 'primary'
            ? 'bg-bitcoin/15 group-hover:bg-bitcoin/20'
            : 'bg-app-elevated border border-app-stroke group-hover:bg-app-surface'
          }
        `}
      >
        <Icon
          className={`w-5 h-5 ${variant === 'primary' ? 'text-bitcoin' : 'text-app-muted group-hover:text-app-text'}`}
          strokeWidth={1.75}
        />
      </div>

      {/* Text */}
      <div className="min-w-0">
        <p
          className={`text-sm font-semibold leading-tight
            ${variant === 'primary' ? 'text-bitcoin' : 'text-app-text'}`}
        >
          {label}
        </p>
        <p className="text-xs text-app-muted leading-tight mt-0.5 truncate">{sublabel}</p>
      </div>
    </button>
  );
}
