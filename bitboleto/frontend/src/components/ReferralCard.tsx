import { useState, useEffect } from 'react';
import {
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  TrendingUp,
  Tag,
  ChevronRight,
} from 'lucide-react';
import api from '../services/api';

interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  referredCount: number;
  totalEarned: number;
  legacyEarned: number;
  newEarned: number;
  legacyBalance: number;
  legacyPendingBalance: number;
}

const SHARE_MESSAGE = (link: string) =>
  `💰 Ei, você precisa conhecer o PagDepix!\n\nPague boletos, recarregue celular e envie Pix usando criptomoedas (Depix, BTC, USDT) — rápido, seguro e sem burocracia.\n\n✅ Você ganha 20% de desconto nas taxas\n✅ Funciona direto pelo navegador, sem app\n\nAcesse agora pelo meu link exclusivo:\n👉 ${link}`;

export default function ReferralCard({ compact = false }: { compact?: boolean }) {
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/user/referral')
      .then(({ data }) => setInfo(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCopyLink = async () => {
    if (!info) return;
    await navigator.clipboard.writeText(info.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!info) return;
    const text = SHARE_MESSAGE(info.referralLink);

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      // Fallback: copiar mensagem para clipboard
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // ── Compact (mobile) ──────────────────────────────────────────
  if (compact) {
    if (loading) return (
      <div className="xl:hidden bg-app-surface border border-app-stroke rounded-xl p-3 animate-pulse">
        <div className="flex gap-2 mb-2">
          <div className="w-6 h-6 bg-app-elevated rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-28 bg-app-elevated rounded" />
            <div className="h-2 w-20 bg-app-elevated rounded" />
          </div>
        </div>
        <div className="h-7 bg-app-elevated rounded-lg" />
      </div>
    );
    if (!info) return null;
    return (
      <div className="xl:hidden bg-app-surface border border-app-stroke rounded-xl p-3 shadow-card">
        {/* Linha 1: ícone + título + stats */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="p-1.5 bg-bitcoin/10 rounded-lg flex-shrink-0">
            <Gift className="w-3.5 h-3.5 text-bitcoin" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-app-text leading-tight">Indique e ganhe <span className="text-bitcoin">20%</span></p>
            <p className="text-[10px] text-app-muted leading-tight">Indicado ganha 20% de desconto</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-center">
              <div className="flex items-center justify-center gap-0.5">
                <Users className="w-3 h-3 text-app-muted" />
                <p className="text-xs font-bold text-app-text">{info.referredCount}</p>
              </div>
              <p className="text-[9px] text-app-subtle leading-tight">indicados</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-bitcoin leading-tight">
                {info.totalEarned.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <p className="text-[9px] text-app-subtle leading-tight">ganhos</p>
            </div>
          </div>
        </div>
        {/* Linha 2: link + botões */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 bg-app-elevated rounded-lg border border-app-stroke">
            <span className="text-[10px] text-app-text font-mono truncate flex-1">{info.referralLink}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-shrink-0 p-0.5 text-app-muted hover:text-bitcoin transition-colors"
              title="Copiar link"
            >
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleShare}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-bitcoin to-orange-500 rounded-lg text-black text-[11px] font-bold active:scale-95 transition-transform"
          >
            <Share2 className="w-3 h-3" />
            Indicar
          </button>
        </div>
        {copied && (
          <p className="text-[10px] text-green-500 mt-1.5 flex items-center gap-1">
            <Check className="w-2.5 h-2.5" /> Copiado!
          </p>
        )}
      </div>
    );
  }

  // ── Full (desktop xl+) ────────────────────────────────────────
  if (loading) {
    return (
      <div className="hidden xl:block bg-app-surface border border-app-stroke rounded-xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-app-elevated rounded mb-3" />
        <div className="h-8 w-full bg-app-elevated rounded mb-2" />
        <div className="h-4 w-24 bg-app-elevated rounded" />
      </div>
    );
  }

  if (!info) return null;

  return (
    <div className="hidden xl:flex flex-col bg-app-surface border border-app-stroke rounded-xl overflow-hidden shadow-card">
      {/* Header com gradiente */}
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-bitcoin/10 via-orange-500/5 to-transparent border-b border-app-stroke">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-bitcoin/15 rounded-lg">
                <Gift className="w-4 h-4 text-bitcoin" />
              </div>
              <span className="text-xs font-semibold text-bitcoin uppercase tracking-wide">Indicação</span>
            </div>
            <h3 className="text-sm font-bold text-app-text leading-tight">
              Indique amigos e ganhe comissão
            </h3>
            <p className="text-xs text-app-muted mt-0.5">
              Você recebe <span className="text-bitcoin font-semibold">20%</span> das taxas deles
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 border-b border-app-stroke">
        <div className="px-4 py-3 border-r border-app-stroke">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-app-muted" />
            <span className="text-[10px] uppercase tracking-wide text-app-muted font-medium">Indicados</span>
          </div>
          <p className="text-xl font-bold text-app-text">{info.referredCount}</p>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-app-muted" />
            <span className="text-[10px] uppercase tracking-wide text-app-muted font-medium">Ganhos totais</span>
          </div>
          <p className="text-xl font-bold text-bitcoin">
            {info.totalEarned.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
          {info.legacyEarned > 0 && (
            <p className="text-[10px] text-app-subtle mt-0.5">
              inclui {info.legacyEarned.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} do programa anterior
            </p>
          )}
        </div>
      </div>

      {/* Saldo disponível para saque (legado) */}
      {(info.legacyBalance > 0 || info.legacyPendingBalance > 0) && (
        <div className="px-4 py-3 border-b border-app-stroke bg-green-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-app-subtle font-medium mb-0.5">Disponível para saque</p>
              <p className="text-base font-bold text-green-500 dark:text-green-400">
                {info.legacyBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              {info.legacyPendingBalance > 0 && (
                <p className="text-[10px] text-app-subtle">
                  + {info.legacyPendingBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} pendente
                </p>
              )}
            </div>
            <a
              href="/affiliate"
              className="text-[11px] font-semibold text-bitcoin hover:underline flex items-center gap-1"
            >
              Sacar
              <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Benefícios */}
      <div className="px-4 py-3 border-b border-app-stroke space-y-1.5">
        {[
          { icon: Gift, text: 'Você ganha 20% das taxas cobradas', color: 'text-bitcoin' },
          { icon: Tag, text: 'Seu indicado ganha 20% de desconto', color: 'text-green-500 dark:text-green-400' },
          { icon: TrendingUp, text: 'Comissão recorrente em cada pagamento', color: 'text-blue-400' },
        ].map(({ icon: Icon, text, color }) => (
          <div key={text} className="flex items-center gap-2">
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
            <span className="text-xs text-app-muted">{text}</span>
          </div>
        ))}
      </div>

      {/* Link */}
      <div className="px-4 py-3 border-b border-app-stroke">
        <p className="text-[10px] uppercase tracking-wide text-app-subtle font-medium mb-1.5">
          Seu link exclusivo
        </p>
        <div className="flex items-center gap-2 p-2 bg-app-elevated rounded-lg border border-app-stroke">
          <span className="flex-1 text-xs text-app-text font-mono truncate">
            {info.referralLink}
          </span>
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex-shrink-0 p-1.5 rounded-md hover:bg-app-surface transition-colors text-app-muted hover:text-bitcoin"
            title="Copiar link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-app-subtle mt-1">
          Código: <span className="font-mono font-semibold text-app-muted">{info.referralCode}</span>
        </p>
      </div>

      {/* Botão compartilhar */}
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={handleShare}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-bitcoin to-orange-500 hover:opacity-90 active:scale-[0.98] text-black font-bold text-sm rounded-xl transition-all shadow-sm shadow-bitcoin/20"
        >
          <Share2 className="w-4 h-4" />
          Compartilhar nas Redes Sociais
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {copied && (
          <p className="text-center text-xs text-green-500 dark:text-green-400 mt-1.5 flex items-center justify-center gap-1">
            <Check className="w-3 h-3" /> Mensagem copiada!
          </p>
        )}
      </div>
    </div>
  );
}
