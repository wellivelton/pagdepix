import { Helmet } from 'react-helmet-async';
import PublicHeader from '../components/PublicHeader';
import HeroSection from './landing/HeroSection';
import HowItWorksSection from './landing/HowItWorksSection';
import ProductsSection from './landing/ProductsSection';
import FeesSection from './landing/FeesSection';
import FeaturesSection from './landing/FeaturesSection';
import BoletoTypesSection from './landing/BoletoTypesSection';
import CtaSection from './landing/CtaSection';
import LandingFooter from './landing/LandingFooter';

const PAGE_TITLE =
  'PagDepix - Pague boletos e contas com suas criptos. Sem KYC.';
const PAGE_DESC =
  'Use Depix, L-USDT ou L-BTC na Liquid Network para pagar boletos, recarregar celular e muito mais. Sem burocracia, sem KYC, liquidação em minutos.';
const CANONICAL = 'https://pagdepix.com';

export default function Landing() {
  return (
    <>
      <Helmet>
        <html lang="pt-BR" />
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESC} />
        <meta
          name="keywords"
          content="Depix, Liquid Network, pagar boletos com bitcoin, L-BTC, L-USDT, stablecoin, criptomoedas Brasil, pagamentos crypto, DeFi Brasil, sem KYC"
        />
        <meta name="author" content="PagDepix" />
        <link rel="canonical" href={CANONICAL} />

        <meta property="og:type" content="website" />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:title" content="PagDepix - Criptomoedas no seu dia a dia" />
        <meta property="og:description" content={PAGE_DESC} />
        <meta property="og:image" content="https://pagdepix.com/og-image.jpg" />
        <meta property="og:site_name" content="PagDepix" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="PagDepix - Criptomoedas no seu dia a dia" />
        <meta name="twitter:description" content={PAGE_DESC} />
        <meta name="twitter:image" content="https://pagdepix.com/twitter-image.jpg" />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="robots" content="index, follow" />
        <meta name="theme-color" content="#F7931A" />

        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FinancialService',
            name: 'PagDepix',
            url: CANONICAL,
            logo: 'https://pagdepix.com/logo.png',
            description: PAGE_DESC,
            areaServed: 'BR',
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: 'Serviços',
              itemListElement: [
                {
                  '@type': 'Offer',
                  itemOffered: {
                    '@type': 'Service',
                    name: 'Pagamento de Boletos com Criptomoedas',
                  },
                },
                {
                  '@type': 'Offer',
                  itemOffered: { '@type': 'Service', name: 'Recarga de Celular' },
                },
                {
                  '@type': 'Offer',
                  itemOffered: { '@type': 'Service', name: 'Marketplace Cripto' },
                },
              ],
            },
          })}
        </script>
      </Helmet>

      {/* Background global animado */}
      <div className="min-h-screen bg-gray-950 relative">
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-bitcoin/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/3 left-1/4 w-[400px] h-[400px] bg-orange-500/4 rounded-full blur-[100px]" />
        </div>

        <a
          href="#main-content"
          className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:w-auto focus:h-auto
            focus:py-2 focus:px-4 focus:rounded-lg focus:bg-bitcoin focus:text-black focus:font-semibold"
        >
          Pular para o conteúdo
        </a>

        <PublicHeader />

        <main id="main-content" tabIndex={-1} className="relative">
          <HeroSection />
          <HowItWorksSection />
          <ProductsSection />
          <FeesSection />
          <FeaturesSection />
          <BoletoTypesSection />
          <CtaSection />
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
