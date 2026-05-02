import { useEffect, useRef } from 'react';
import { X, ExternalLink, Share2 } from 'lucide-react';
import type { NewsItem } from '../../hooks/useNewsFeed';

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

const CATEGORY_LABEL: Record<string, string> = {
  crypto: 'CRIPTO',
  finance: 'FINANÇAS',
  politics: 'POLÍTICA',
};

interface Props {
  item: NewsItem;
  onClose: () => void;
}

export default function NewsPreviewModal({ item, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      const el = containerRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url: item.url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(item.url).catch(() => {});
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Container */}
      <div
        ref={containerRef}
        className="relative z-10 w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-app-surface border border-app-stroke rounded-2xl shadow-card-lg"
      >
        {/* Close */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 z-10 size-8 flex items-center justify-center rounded-lg bg-app-elevated border border-app-stroke text-app-muted hover:text-app-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50"
        >
          <X size={16} />
        </button>

        <div className="p-6">
          {/* Thumbnail */}
          {item.thumbnail && (
            <div className="mb-5 rounded-xl overflow-hidden aspect-video bg-app-elevated">
              <img
                src={item.thumbnail}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-1.5 text-[11px] text-app-subtle mb-2 flex-wrap">
            <span className="font-semibold uppercase tracking-wide text-bitcoin">
              {CATEGORY_LABEL[item.category] ?? item.category.toUpperCase()}
            </span>
            <span aria-hidden>·</span>
            <span className="font-medium">{item.source}</span>
            <span aria-hidden>·</span>
            <span>{formatRelative(item.publishedAt)}</span>
          </div>

          {/* Title */}
          <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-app-text mb-3">
            {item.title}
          </h1>

          {/* Description */}
          {item.description && (
            <p className="text-[14px] text-app-muted leading-relaxed mb-5 line-clamp-3">
              {item.description}
            </p>
          )}

          {/* CTAs */}
          <div className="flex items-center gap-2 pt-4 border-t border-app-stroke">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-bitcoin hover:bg-[#d97706] active:scale-[0.98] text-white text-[14px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50"
            >
              Ler na fonte
              <ExternalLink size={14} strokeWidth={2.25} />
            </a>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Compartilhar notícia"
              className="size-10 inline-flex items-center justify-center rounded-lg bg-app-elevated hover:bg-app-stroke text-app-muted hover:text-app-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50"
            >
              <Share2 size={16} />
            </button>
          </div>

          {/* Disclaimer */}
          <p className="mt-3 text-[11px] text-app-subtle text-center">
            Conteúdo de terceiros. Você será redirecionado ao site da fonte.
          </p>
        </div>
      </div>
    </div>
  );
}
