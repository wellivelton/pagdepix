import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Settings2 } from 'lucide-react';
import { getBusinessStatus, type BusinessStatus } from '../../utils/businessHours';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface StatusBarProps {
  permission: PermissionState;
  onSubscribe: () => Promise<boolean>;
}

// ─── Business hours hook ─────────────────────────────────────────────────────

function useBusinessStatus(): BusinessStatus {
  const [status, setStatus] = useState<BusinessStatus>(() => getBusinessStatus());
  useEffect(() => {
    const id = setInterval(() => setStatus(getBusinessStatus()), 60_000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// ─── Sub-blocks ──────────────────────────────────────────────────────────────

function BusinessHoursBlock({ status }: { status: BusinessStatus }) {
  const dotClass = {
    open:           'bg-green-500',
    'opening-soon': 'bg-yellow-500',
    closed:         'bg-red-400',
  }[status.variant];

  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden />
      <span className="font-medium text-app-text">{status.primary}</span>
      <span className="text-app-subtle">·</span>
      <span className="text-app-muted">{status.secondary}</span>
    </span>
  );
}

function ProcessingNoticeBlock() {
  return (
    <span className="inline-flex items-center gap-1.5 flex-shrink-0">
      <Settings2 className="w-3 h-3 text-app-subtle flex-shrink-0" strokeWidth={2} aria-hidden />
      <span className="text-app-muted">
        Boletos e recargas fora do horário comercial são processados no próximo dia útil
      </span>
    </span>
  );
}

function Dot() {
  return (
    <span className="inline-block px-3 text-app-stroke select-none" aria-hidden>·</span>
  );
}

interface ContentProps {
  businessStatus: BusinessStatus;
  ariaHidden?: boolean;
}

function StatusBarContent({ businessStatus, ariaHidden }: ContentProps) {
  return (
    <span
      className="inline-flex items-center"
      aria-hidden={ariaHidden || undefined}
    >
      <BusinessHoursBlock status={businessStatus} />
      <Dot />
      <ProcessingNoticeBlock />
      {/* gap so duplicated content doesn't appear immediately adjacent */}
      <span className="inline-block w-12" aria-hidden />
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StatusBar({ permission, onSubscribe }: StatusBarProps) {
  const businessStatus = useBusinessStatus();

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLSpanElement>(null);
  const [isMarquee, setIsMarquee] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const ro = new ResizeObserver(() => {
      setIsMarquee(content.scrollWidth > container.clientWidth);
    });

    ro.observe(container);
    ro.observe(content);
    return () => ro.disconnect();
  }, [businessStatus]);

  const showNotifButton = permission === 'default' || permission === 'denied';

  return (
    <div className="flex items-stretch bg-app-surface border border-app-stroke rounded-xl text-xs text-app-muted overflow-hidden">
      {/* Scrolling content area */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden h-10 min-w-0"
      >
        {/* Left fade */}
        {isMarquee && (
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to right, var(--app-surface), transparent)' }}
          />
        )}

        {/* Track */}
        <span
          ref={contentRef}
          className={`statusbar-track h-full px-4 ${isMarquee ? 'statusbar-track--animated' : ''}`}
        >
          <StatusBarContent businessStatus={businessStatus} />
          {isMarquee && (
            <StatusBarContent businessStatus={businessStatus} ariaHidden />
          )}
        </span>

        {/* Right fade (only when no notif button) */}
        {isMarquee && !showNotifButton && (
          <div
            aria-hidden
            className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to left, var(--app-surface), transparent)' }}
          />
        )}
      </div>

      {/* Notification button — fixed right, outside marquee */}
      {permission === 'default' && (
        <button
          type="button"
          onClick={onSubscribe}
          aria-label="Ativar notificações push"
          className="
            group flex-shrink-0 flex items-center gap-1.5 px-3 border-l border-app-stroke
            bg-app-elevated hover:bg-bitcoin/10
            text-app-muted hover:text-bitcoin
            transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50
          "
        >
          <span className="relative">
            <Bell className="w-3.5 h-3.5" strokeWidth={2} />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          </span>
          <span className="hidden sm:inline text-[11px] font-medium whitespace-nowrap">Ativar notificações</span>
        </button>
      )}

      {permission === 'denied' && (
        <button
          type="button"
          title="Você bloqueou notificações. Para ativar: Configurações do navegador → Privacidade → Notificações."
          aria-label="Notificações bloqueadas"
          className="
            flex-shrink-0 flex items-center gap-1.5 px-3 border-l border-app-stroke
            text-app-subtle hover:text-app-muted transition-colors
          "
        >
          <BellOff className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="hidden md:inline text-[11px] whitespace-nowrap">Bloqueadas</span>
        </button>
      )}
    </div>
  );
}
