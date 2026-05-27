import { CheckCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  name: string;
  subtitle: string;
  detail: string;
  accentColor: string;
  glowColor: string;
}

export default function CryptoAssetCard({
  icon: Icon,
  name,
  subtitle,
  detail,
  accentColor,
  glowColor,
}: Props) {
  return (
    <div
      className={`group relative bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-3 backdrop-blur-sm
        hover:border-current hover:shadow-lg transition-all duration-300 cursor-default ${accentColor}`}
      style={{ '--glow': glowColor } as React.CSSProperties}
    >
      <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-black text-xs
        opacity-0 group-hover:opacity-100 transition-opacity bg-current">
        <CheckCircle className="w-3 h-3" />
      </div>

      <div className="flex flex-col items-center text-center gap-1.5">
        <div className="w-8 h-8 rounded-lg bg-current/10 flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div className="text-sm font-black group-hover:scale-110 transition-transform duration-300">{name}</div>
        <div className="text-xs text-gray-400 font-medium">{subtitle}</div>
        <div className="text-[10px] text-gray-500 hidden md:block">{detail}</div>
      </div>
    </div>
  );
}
