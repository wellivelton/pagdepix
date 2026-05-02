import { useState } from 'react';
import { Globe, Coins, TrendingUp, Landmark, Newspaper, AlertCircle, RefreshCw, Flag } from 'lucide-react';
import { useNewsFeed, type NewsCategory, type NewsItem } from '../../hooks/useNewsFeed';
import NewsPreviewModal from './NewsPreviewModal';

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

const CATEGORIES: Array<{ id: NewsCategory; label: string; Icon: IconComponent }> = [
  { id: 'all',      label: 'Tudo',     Icon: Globe      },
  { id: 'crypto',   label: 'Cripto',   Icon: Coins      },
  { id: 'finance',  label: 'Finanças', Icon: TrendingUp },
  { id: 'politics', label: 'Política', Icon: Landmark   },
  { id: 'brasil',   label: 'Brasil',   Icon: Flag       },
];

const CATEGORY_COLOR: Record<string, string> = {
  crypto:   'text-bitcoin',
  finance:  'text-blue-400',
  politics: 'text-purple-400',
  brasil:   'text-green-400',
};

const CATEGORY_LABEL: Record<string, string> = {
  crypto: 'Cripto', finance: 'Finanças', politics: 'Política', brasil: 'Brasil',
};

function CategoryBadge({ category }: { category: NewsItem['category'] }) {
  return (
    <span className={`text-[10px] font-medium ${CATEGORY_COLOR[category] ?? 'text-app-subtle'}`}>
      {CATEGORY_LABEL[category] ?? category}
    </span>
  );
}

function SkeletonItem() {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-app-stroke last:border-0 animate-pulse">
      <div className="shrink-0 size-12 rounded-lg bg-app-elevated" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 bg-app-elevated rounded w-4/5" />
        <div className="h-3 bg-app-elevated rounded w-3/5" />
        <div className="h-2.5 bg-app-elevated rounded w-1/3 mt-1" />
      </div>
    </div>
  );
}

interface NewsRowProps {
  item: NewsItem;
  onClick: () => void;
}

function NewsRow({ item, onClick }: NewsRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full flex items-start gap-3 py-3 text-left border-b border-app-stroke last:border-0 hover:bg-app-elevated transition-colors rounded-lg px-1 -mx-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50"
    >
      {/* Thumbnail */}
      <div className="shrink-0 size-12 rounded-lg overflow-hidden bg-app-elevated flex items-center justify-center flex-shrink-0">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <Newspaper size={16} className="text-app-subtle" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug text-app-text line-clamp-2 group-hover:text-bitcoin transition-colors">
          {item.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-app-subtle flex-wrap">
          <span className="font-medium">{item.source}</span>
          <span aria-hidden>·</span>
          <span>{formatRelative(item.publishedAt)}</span>
          <span aria-hidden>·</span>
          <CategoryBadge category={item.category} />
        </div>
      </div>
    </button>
  );
}

export default function NoticiasFeedCard() {
  const [category, setCategory] = useState<NewsCategory>('all');
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);
  const { items, loading, error, refetch } = useNewsFeed(category);

  return (
    <>
      <div className="bg-app-surface border border-app-stroke rounded-xl p-5 shadow-card-premium h-full flex flex-col">
        {/* Header */}
        <p className="text-[11px] font-semibold text-app-subtle uppercase tracking-widest mb-3">
          Notícias
        </p>

        {/* Category chips */}
        <div
          role="tablist"
          aria-label="Filtrar notícias por categoria"
          className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-0.5 scrollbar-none"
        >
          {CATEGORIES.map(({ id, label, Icon }) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(id)}
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50
                  ${active
                    ? 'bg-app-elevated text-app-text border border-app-stroke'
                    : 'text-app-muted hover:text-app-text hover:bg-app-elevated'
                  }
                `}
              >
                <Icon size={12} strokeWidth={1.75} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-app-stroke mb-2" />

        {/* Scrollable list */}
        <div
          className="news-scroll overflow-y-auto max-h-[420px]"
          aria-busy={loading}
        >
          {loading ? (
            <div>{[1, 2, 3, 4].map(i => <SkeletonItem key={i} />)}</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <AlertCircle size={24} className="text-yellow-500" />
              <p className="text-sm text-app-muted">Não foi possível carregar as notícias.</p>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1.5 text-xs text-app-subtle hover:text-bitcoin transition-colors"
              >
                <RefreshCw size={12} />
                Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <Newspaper size={32} className="text-app-subtle" />
              <p className="text-sm text-app-muted">Nenhuma notícia disponível no momento.</p>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1.5 text-xs text-app-subtle hover:text-bitcoin transition-colors"
              >
                <RefreshCw size={12} />
                Tentar novamente
              </button>
            </div>
          ) : (
            <div>
              {items.map(item => (
                <NewsRow
                  key={item.id}
                  item={item}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedItem && (
        <NewsPreviewModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
