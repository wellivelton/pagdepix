import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  desc: string;
  stat?: string;
}

export default function FeatureCard({ icon: Icon, title, desc, stat }: Props) {
  return (
    <div className="group relative bg-gray-900/60 border border-gray-700/50 rounded-2xl p-6
      hover:border-bitcoin/40 hover:bg-gray-900/80 hover:shadow-xl hover:shadow-bitcoin/5
      transition-all duration-300">
      <div className="w-12 h-12 bg-bitcoin/10 rounded-xl flex items-center justify-center mb-5
        group-hover:scale-110 group-hover:bg-bitcoin/15 transition-all duration-300">
        <Icon className="w-6 h-6 text-bitcoin" />
      </div>

      {stat && (
        <div className="text-3xl font-black text-bitcoin mb-1 tabular-nums">{stat}</div>
      )}

      <h3 className="text-base font-bold text-white mb-2 group-hover:text-bitcoin transition-colors">
        {title}
      </h3>
      <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}
