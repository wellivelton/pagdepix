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
      className={`group relative bg-gray-900/60 border border-gray-700/50 rounded-2xl p-5 backdrop-blur-sm
        hover:border-current hover:shadow-lg transition-all duration-300 cursor-default ${accentColor}`}
      style={{ '--glow': glowColor } as React.CSSProperties}
    >
      <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-black text-xs
        opacity-0 group-hover:opacity-100 transition-opacity bg-current">
        <CheckCircle className="w-3.5 h-3.5" />
      </div>

      <div className="flex flex-col items-center text-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-current/10 flex items-center justify-center mb-1">
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-lg font-black group-hover:scale-110 transition-transform duration-300">{name}</div>
        <div className="text-xs text-gray-400 font-medium">{subtitle}</div>
        <div className="text-[10px] text-gray-500 hidden md:block">{detail}</div>
      </div>
    </div>
  );
}
