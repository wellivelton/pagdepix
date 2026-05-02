import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  desc: string;
  stat?: string;
}

export default function FeatureCard({ icon: Icon, title, desc, stat }: Props) {
  return (
    <div className="group relative bg-gray-900/60 border border-gray-700/50 rounded-xl md:rounded-2xl p-4 md:p-6
      hover:border-bitcoin/40 hover:bg-gray-900/80 hover:shadow-xl hover:shadow-bitcoin/5
      transition-all duration-300">
      <div className="w-9 h-9 md:w-12 md:h-12 bg-bitcoin/10 rounded-lg md:rounded-xl flex items-center justify-center mb-3 md:mb-5
        group-hover:scale-110 group-hover:bg-bitcoin/15 transition-all duration-300">
        <Icon className="w-4 h-4 md:w-6 md:h-6 text-bitcoin" />
      </div>

      {stat && (
        <div className="text-2xl md:text-3xl font-black text-bitcoin mb-0.5 md:mb-1 tabular-nums">{stat}</div>
      )}

      <h3 className="text-sm md:text-base font-bold text-white mb-1 md:mb-2 group-hover:text-bitcoin transition-colors">
        {title}
      </h3>
      <p className="text-xs md:text-sm text-gray-400 leading-relaxed hidden md:block">{desc}</p>
    </div>
  );
}
