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
      className="max-w-7xl mx-auto px-4 pt-8 pb-10 md:px-6 md:pt-16 md:pb-28 relative overflow-x-hidden"
      aria-labelledby="hero-heading"
    >
      {/* Ticker de cotações */}
      {tickerItems.length > 0 && (
        <div className="hidden md:block mb-12 py-2.5 border-y border-gray-800/60 backdrop-blur-sm">
          <div className="ticker-wrap overflow-hidden">
            <div className="ticker-content inline-flex">
              {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
                <span
                  key={`ticker-${i}`}
                  className="inline-flex items-center gap-2.5 mx-8 text-xs text-gray-500 whitespace-nowrap"
                >
                  <span className="font-medium text-gray-400">{item.name}</span>
                  <span className="font-bold text-bitcoin">{formatBrl(item.brl)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Layout: texto à esquerda, visual à direita */}
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* Coluna esquerda — Copy */}
        <div className="flex flex-col items-start">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-bitcoin/10 text-bitcoin px-3 py-1.5 md:px-4 md:py-2
            rounded-full border border-bitcoin/25 text-xs font-semibold mb-5 md:mb-8 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-bitcoin animate-pulse" />
            Liquid Network · Sem KYC · Liquidação em minutos
          </div>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] mb-4 md:mb-6"
          >
            Pague boletos e contas{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin via-orange-400 to-yellow-400 animate-gradient-x bg-[length:200%_auto]">
              com suas criptos.
            </span>
          </h1>

          {/* Sub-headline */}
          <p className="text-base md:text-lg text-gray-400 leading-relaxed mb-5 md:mb-8 max-w-lg">
            Depix, L-USDT ou L-BTC{' '}
            <span className="text-white font-medium">→ boleto pago</span>. Em minutos.
            Sem banco, sem exchange, sem burocracia.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mb-6 md:mb-10">
            <button
              onClick={() => navigate('/login')}
              aria-label="Abrir conta — ir para login"
              className={`group relative inline-flex items-center justify-center gap-2.5 px-7 py-4
                text-base font-bold rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black
                hover:shadow-2xl hover:shadow-bitcoin/30 hover:-translate-y-0.5 transition-all duration-200
                overflow-hidden ${focusRing}`}
            >
              <span className="absolute inset-0 bg-white/15 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl" />
              <Wallet className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Começar agora — é grátis</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform relative z-10" />
            </button>

            <button
              onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
              aria-label="Ver como funciona"
              className={`inline-flex items-center justify-center gap-2 px-7 py-4 text-base font-semibold
                border border-gray-700 text-gray-400 rounded-xl hover:border-bitcoin/50 hover:text-bitcoin
                hover:bg-bitcoin/5 transition-all duration-200 ${focusRing}`}
            >
              Como funciona
            </button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-800/60 pt-4 md:pt-6">
            <TrustBadge icon={Shield} label="Auditado" />
            <TrustBadge icon={Lock} label="Confidential Assets" />
            <TrustBadge icon={Zap} label="Liquid Network" />
            <TrustBadge icon={Globe} label="Sem KYC" />
          </div>
        </div>

        {/* Coluna direita — Visual (escondida no mobile) */}
        <div className="hidden lg:flex flex-col gap-8 lg:pl-4">
          {/* Fluxo de pagamento */}
          <div className="bg-gray-900/60 rounded-2xl border border-gray-800/60 p-6 backdrop-blur-sm">
            <p className="text-xs text-gray-600 uppercase tracking-widest font-semibold mb-5 text-center">
              Como o pagamento funciona
            </p>
            <PaymentFlowVisual />
          </div>

          {/* Assets aceitos */}
          <div className="grid grid-cols-3 gap-3">
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

          {/* Mockup placeholder */}
          <div className="relative rounded-2xl border border-gray-800/60 bg-gray-900/40 overflow-hidden shadow-2xl">
            {/* Barra de título simulada */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-800/60 bg-gray-900/80">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <div className="ml-3 text-[10px] text-gray-600 font-mono">pagdepix.com/pagar</div>
            </div>

            {/* Conteúdo simulado */}
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-bitcoin/20 flex items-center justify-center">
                  <div className="w-4 h-4 rounded bg-bitcoin/60" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-2.5 w-28 bg-gray-700/60 rounded animate-pulse" />
                  <div className="h-2 w-16 bg-gray-800/60 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-10 w-full bg-gray-800/60 rounded-xl border border-gray-700/40 animate-pulse" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 bg-bitcoin/10 rounded-xl border border-bitcoin/20 flex items-center justify-center">
                  <div className="text-bitcoin text-xs font-bold">Depix</div>
                </div>
                <div className="h-16 bg-green-500/10 rounded-xl border border-green-500/20 flex items-center justify-center">
                  <div className="text-green-400 text-xs font-bold">L-USDT</div>
                </div>
              </div>
              <div className="h-10 w-full bg-gradient-to-r from-bitcoin/30 to-orange-500/30 rounded-xl border border-bitcoin/20 animate-pulse" />
            </div>

            {/* Label do placeholder */}
            <div className="absolute bottom-2 right-3 text-[10px] text-gray-700 font-mono">
              {/* TODO: substituir por screenshot real do dashboard */}
            </div>
          </div>
        </div>
      </div>

      {/* Social proof */}
      <div className="mt-8 md:mt-16 pt-6 md:pt-8 border-t border-gray-800/50">
        <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap md:justify-center md:gap-x-10 md:gap-y-4">
          {[
            { value: '1.000+', label: 'usuários' },
            { value: 'R$ 500k+', label: 'processados' },
            { value: '~2 min', label: 'liquidação' },
            { value: '0 docs', label: 'exigidos' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-base md:text-xl font-black text-bitcoin">{stat.value}</div>
              <div className="text-[10px] md:text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-700 text-center mt-6">
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
