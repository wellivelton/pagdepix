import { useEffect, useState } from 'react';
import { Check, Share2, Copy, Users, TrendingUp, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';

interface ReferralInfo {
  referralLink: string;
  referralCode: string;
  referredCount: number;
  totalEarned: number;
}

const buildShareMessage = (link: string) =>
  `Pague boletos, recarregue celular e envie Pix com criptomoedas — rápido e sem burocracia.\n\n✅ Seu amigo ganha 20% de desconto nas taxas de boleto\n\n👉 ${link}`;

const BENEFITS = [
  'Você ganha 20% das taxas cobradas',
  'Seu indicado ganha 20% de desconto',
  'Comissão recorrente em cada pagamento',
];

export default function IndicacaoCard() {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    api.get('/user/referral')
      .then(({ data }) => setInfo(data))
      .catch(() => {});
  }, []);

  if (!info) return null;

  const handleShare = async () => {
    const text = buildShareMessage(info.referralLink);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      }
    } catch {}
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(info.referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(info.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {}
  };

  return (
    <div className="bg-app-surface border border-app-stroke rounded-xl shadow-card-premium h-full flex flex-col overflow-hidden">

      {/* ── Hero ── */}
      <div
        className="relative px-4 pt-4 pb-4 overflow-hidden flex-shrink-0"
        style={{
          background: 'linear-gradient(135deg, rgba(247,147,26,0.13) 0%, rgba(247,147,26,0.04) 60%, transparent 100%)',
          borderBottom: '1px solid rgba(247,147,26,0.12)',
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none select-none absolute -right-2 top-1/2 -translate-y-1/2 font-black leading-none"
          style={{ fontSize: '4rem', color: 'rgba(247,147,26,0.08)', letterSpacing: '-0.05em' }}
        >
          20%
        </span>

        <p className="text-base font-bold text-app-text leading-tight">Indicação</p>
        <p className="text-xs text-app-muted mt-0.5">Indique amigos e ganhe comissão</p>
        <p className="text-[11px] text-bitcoin mt-1 font-medium">
          Você recebe 20% das taxas deles
        </p>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-3">

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-app-elevated border border-app-stroke">
            <div className="w-6 h-6 rounded-md bg-app-surface border border-app-stroke flex items-center justify-center flex-shrink-0">
              <Users className="w-3 h-3 text-app-muted" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] text-app-subtle leading-none mb-0.5">Indicados</p>
              <p className="text-sm font-bold text-app-text tabular-nums leading-none">{info.referredCount}</p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg border"
            style={{ background: 'rgba(247,147,26,0.06)', borderColor: 'rgba(247,147,26,0.18)' }}
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(247,147,26,0.15)' }}
            >
              <TrendingUp className="w-3 h-3 text-bitcoin" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] leading-none mb-0.5" style={{ color: 'rgba(247,147,26,0.6)' }}>Ganhos totais</p>
              <p className="text-sm font-bold text-bitcoin tabular-nums leading-none">
                {info.totalEarned.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <ul className="space-y-1">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-bitcoin/60 flex-shrink-0 mt-px" strokeWidth={2} />
              <span className="text-[11px] text-app-muted leading-snug">{b}</span>
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="h-px bg-app-stroke" />

        {/* Link section */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-app-subtle uppercase tracking-wider">Seu link exclusivo</p>

          {/* Link field */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-app-elevated border border-app-stroke">
            <span className="flex-1 text-[10px] text-app-subtle font-mono truncate leading-none">
              {info.referralLink}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copiar link de indicação"
              className="flex-shrink-0 text-app-subtle hover:text-app-text transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50 rounded"
            >
              {copiedLink ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          {/* Code field */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-app-elevated border border-app-stroke">
            <span className="text-[10px] text-app-subtle leading-none">Código:</span>
            <span className="flex-1 text-[11px] font-bold text-app-text font-mono tracking-widest leading-none">
              {info.referralCode}
            </span>
            <button
              type="button"
              onClick={handleCopyCode}
              aria-label="Copiar código de indicação"
              className="flex-shrink-0 text-app-subtle hover:text-app-text transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bitcoin/50 rounded"
            >
              {copiedCode ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Share CTA */}
        <button
          type="button"
          onClick={handleShare}
          className="
            mt-auto w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
            text-xs font-semibold border transition-all duration-150
            bg-bitcoin/8 text-bitcoin border-bitcoin/20
            hover:bg-bitcoin/12 hover:border-bitcoin/30
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50
            active:scale-[0.98]
          "
        >
          <Share2 className="w-3.5 h-3.5" />
          Compartilhar nas Redes Sociais
        </button>
      </div>
    </div>
  );
}
