import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  badge?: string;
  title: string;
  desc: string;
  fee: string;
  min: string;
  onClick: () => void;
}

export default function ProductCard({ icon: Icon, badge, title, desc, fee, min, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group relative bg-gray-900/60 border border-gray-700/50 rounded-xl md:rounded-2xl p-4 md:p-6 text-left
        hover:border-bitcoin/50 hover:bg-gray-900/80 hover:shadow-xl hover:shadow-bitcoin/10
        active:scale-[0.98] transition-all duration-300
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50
        focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 w-full overflow-hidden"
      aria-label={`Acessar ${title}`}
    >
      {badge && (
        <div className="absolute top-0 right-0 bg-gradient-to-l from-bitcoin to-orange-500
          text-black text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-2xl">
          {badge}
        </div>
      )}

      <div className="w-10 h-10 md:w-12 md:h-12 bg-bitcoin/10 rounded-lg md:rounded-xl flex items-center justify-center mb-3 md:mb-5
        group-hover:scale-110 group-hover:bg-bitcoin/15 transition-all duration-300">
        <Icon className="w-5 h-5 md:w-6 md:h-6 text-bitcoin" />
      </div>

      <h3 className="text-sm md:text-base font-bold text-white mb-1.5 md:mb-2 group-hover:text-bitcoin transition-colors">
        {title}
      </h3>
      <p className="text-xs md:text-sm text-gray-400 leading-relaxed mb-3 md:mb-5 line-clamp-2 md:line-clamp-none">{desc}</p>

      <div className="space-y-1.5 border-t border-gray-800 pt-3 md:pt-4 text-xs text-gray-500 mb-3 md:mb-4">
        <div className="flex justify-between">
          <span>Taxa</span>
          <span className="text-bitcoin font-semibold">{fee}</span>
        </div>
        <div className="flex justify-between">
          <span>Mínimo</span>
          <span className="text-gray-400">{min}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-bitcoin text-sm font-semibold">
        <span>Acessar</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );
}
