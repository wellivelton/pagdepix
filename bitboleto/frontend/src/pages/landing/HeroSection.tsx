import { useNavigate, Link } from 'react-router-dom';
import { Wallet, ArrowRight, Shield, Lock, Zap, Globe, Coins, Bitcoin } from 'lucide-react';
import { usePriceTicker } from '../../hooks/usePriceTicker';
import CryptoAssetCard from '../../components/landing/CryptoAssetCard';
import TrustBadge from '../../components/landing/TrustBadge';
import PaymentFlowVisual from '../../components/landing/PaymentFlowVisual';

function formatBrl(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toFixed(1).replace('.', ',')}k`;
  return `R$ ${value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950';

export default function HeroSection() {
  const navigate = useNavigate();
  const { tickerItems } = usePriceTicker();

  return (
    <section
      className="max-w-7xl mx-auto px-4 pt-4 pb-5 md:px-6 md:pt-6 md:pb-8 relative overflow-x-hidden"
      aria-labelledby="hero-heading"
    >
      {tickerItems.length > 0 && (
        <div className="hidden md:block mb-3 py-1.5 border-y border-[rgba(214,235,253,0.19)] backdrop-blur-sm">
          <div className="ticker-wrap overflow-hidden">
            <div className="ticker-content inline-flex">
              {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
                <span
                  key={`ticker-${i}`}
                  className="inline-flex items-center gap-2 mx-6 text-xs text-gray-500 whitespace-nowrap"
                >
                  <span className="font-medium text-gray-400">{item.name}</span>
                  <span className="font-bold text-bitcoin">{formatBrl(item.brl)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 lg:gap-8 items-center">
        <div className="flex flex-col items-start">
          <div className="inline-flex items-center gap-1.5 bg-bitcoin/10 text-bitcoin px-3 py-1
            rounded-full border border-bitcoin/25 text-xs font-semibold mb-3 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-bitcoin animate-pulse" />
            Liquid Network · Sem KYC · Liquidação em minutos
          </div>

          <h1
            id="hero-heading"
            className="text-2xl md:text-3xl lg:text-4xl font-black text-white leading-[1.05] mb-3"
          >
            Pague boletos e contas{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin via-orange-400 to-yellow-400 animate-gradient-x bg-[length:200%_auto]">
              com suas criptos.
            </span>
          </h1>

          <p className="text-sm text-gray-400 leading-relaxed mb-3 max-w-lg">
            Depix, L-USDT ou L-BTC{' '}
            <span className="text-white font-medium">→ boleto pago</span>. Em minutos.
            Sem banco, sem exchange, sem burocracia.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mb-4">
            <button
              onClick={() => navigate('/login')}
              aria-label="Abrir conta — ir para login"
              className={`group relative inline-flex items-center justify-center gap-2 px-4 h-9
                text-sm font-bold rounded-full bg-gradient-to-r from-bitcoin to-orange-500 text-black
                hover:shadow-xl hover:shadow-bitcoin/30 hover:-translate-y-0.5 transition-all duration-200
                overflow-hidden ${focusRing}`}
            >
              <span className="absolute inset-0 bg-white/15 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full" />
              <Wallet className="w-4 h-4 relative z-10" />
              <span className="relative z-10">Começar agora — é grátis</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform relative z-10" />
            </button>

            <button
              onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
              aria-label="Ver como funciona"
              className={`inline-flex items-center justify-center gap-2 px-4 h-9 text-sm font-semibold
                border border-[rgba(214,235,253,0.19)] text-gray-400 rounded-full
                hover:border-bitcoin/50 hover:text-bitcoin hover:bg-bitcoin/5
                transition-all duration-200 ${focusRing}`}
            >
              Como funciona
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[rgba(214,235,253,0.19)] pt-3">
            <TrustBadge icon={Shield} label="Auditado" />
            <TrustBadge icon={Lock} label="Confidential Assets" />
            <TrustBadge icon={Zap} label="Liquid Network" />
            <TrustBadge icon={Globe} label="Sem KYC" />
          </div>
        </div>

        <div className="hidden lg:flex flex-col gap-3 lg:pl-2">
          <div className="bg-gray-900/60 rounded-xl border border-[rgba(214,235,253,0.19)] p-3 backdrop-blur-sm">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-3 text-center">
              Como o pagamento funciona
            </p>
            <PaymentFlowVisual />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <CryptoAssetCard
              icon={Coins}
              name="Depix"
              subtitle="1:1 com Real"
              detail="Stablecoin próprio"
              accentColor="text-bitcoin"
              glowColor="#F7931A"
            />
            <CryptoAssetCard
              icon={Bitcoin}
              name="L-USDT"
              subtitle="Stablecoin USDT"
              detail="Lastro 1:1 com USDT"
              accentColor="text-green-400"
              glowColor="#4ade80"
            />
            <CryptoAssetCard
              icon={Zap}
              name="L-BTC"
              subtitle="Bitcoin Liquid"
              detail="1:1 com Bitcoin"
              accentColor="text-orange-400"
              glowColor="#fb923c"
            />
          </div>

          <div className="relative rounded-xl border border-[rgba(214,235,253,0.19)] bg-gray-900/40 overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[rgba(214,235,253,0.19)] bg-gray-900/80">
              <div className="w-2 h-2 rounded-full bg-red-500/50" />
              <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
              <div className="w-2 h-2 rounded-full bg-green-500/50" />
              <div className="ml-2 text-[10px] text-gray-600 font-mono">pagdepix.com/pagar</div>
            </div>

            <div className="p-4 space-y-2.5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-lg bg-bitcoin/20 flex items-center justify-center">
                  <div className="w-3.5 h-3.5 rounded bg-bitcoin/60" />
                </div>
                <div className="space-y-1">
                  <div className="h-2 w-24 bg-gray-700/60 rounded animate-pulse" />
                  <div className="h-1.5 w-14 bg-gray-800/60 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-8 w-full bg-gray-800/60 rounded-lg border border-[rgba(214,235,253,0.19)] animate-pulse" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-12 bg-bitcoin/10 rounded-lg border border-bitcoin/20 flex items-center justify-center">
                  <div className="text-bitcoin text-xs font-bold">Depix</div>
                </div>
                <div className="h-12 bg-green-500/10 rounded-lg border border-green-500/20 flex items-center justify-center">
                  <div className="text-green-400 text-xs font-bold">L-USDT</div>
                </div>
              </div>
              <div className="h-8 w-full bg-gradient-to-r from-bitcoin/30 to-orange-500/30 rounded-lg border border-bitcoin/20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 md:mt-6 pt-4 border-t border-[rgba(214,235,253,0.19)]">
        <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap md:justify-center md:gap-x-8 md:gap-y-3">
          {[
            { value: '1.000+', label: 'usuários' },
            { value: 'R$ 500k+', label: 'processados' },
            { value: '~2 min', label: 'liquidação' },
            { value: '0 docs', label: 'exigidos' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-sm font-black text-bitcoin">{stat.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-700 text-center mt-3">
        Operações em Depix, L-USDT e L-BTC na Liquid Network.{' '}
        <Link to="/termos" className="text-gray-500 hover:text-bitcoin transition-colors underline underline-offset-2">
          Termos
        </Link>{' '}
        e{' '}
        <Link to="/regras" className="text-gray-500 hover:text-bitcoin transition-colors underline underline-offset-2">
          Regras
        </Link>.
      </p>
    </section>
  );
}
