import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  desc: string;
  stat?: string;
}

export default function FeatureCard({ icon: Icon, title, desc, stat }: Props) {
  return (
    <div className="group relative bg-gray-900/60 border border-[rgba(214,235,253,0.19)] rounded-xl p-3
      hover:border-bitcoin/40 hover:bg-gray-900/80 hover:shadow-xl hover:shadow-bitcoin/5
      transition-all duration-300">
      <div className="w-8 h-8 bg-bitcoin/10 rounded-lg flex items-center justify-center mb-2.5
        group-hover:scale-110 group-hover:bg-bitcoin/15 transition-all duration-300">
        <Icon className="w-4 h-4 text-bitcoin" />
      </div>

      {stat && (
        <div className="text-xl font-black text-bitcoin mb-0.5 tabular-nums">{stat}</div>
      )}

      <h3 className="text-xs font-bold text-white mb-1 group-hover:text-bitcoin transition-colors">
        {title}
      </h3>
      <p className="text-xs text-gray-400 leading-relaxed hidden md:block">{desc}</p>
    </div>
  );
}
