import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
}

export default function TrustBadge({ icon: Icon, label }: Props) {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-xs hover:text-gray-300 transition-colors">
      <Icon className="w-3.5 h-3.5 text-bitcoin flex-shrink-0" />
      <span>{label}</span>
    </div>
  );
}
