/**
 * Landing page exclusiva B2B - Modo Comércio PagDepix
 * Posicionamento: Gateway de pagamento cripto para comerciantes
 * Foco: conversão, SEO, proposta de valor clara
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Zap,
  Shield,
  Wallet,
  Link2,
  Code2,
  CheckCircle2,
  ChevronRight,
  Store,
  Lock,
  ArrowRight,
  MessageCircle,
  Globe,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader';

const SUPPORT_TELEGRAM = '@PagDepixBot';
const BOT_LINK = `https://t.me/${SUPPORT_TELEGRAM.replace('@', '')}`;
const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

const BENEFICIOS = [
  {
    icon: Zap,
    title: 'Confirmação em minutos',
    desc: 'Pagamentos via Pix convertidos em DePix e creditados na sua carteira Liquid automaticamente. Sem aprovação manual.',
  },
  {
    icon: Wallet,
    title: 'Sem custódia',
    desc: 'Você recebe direto na sua carteira. Nenhuma empresa guarda seu dinheiro. Controle total dos seus ativos.',
  },
  {
    icon: Link2,
    title: 'Links e páginas de cobrança',
    desc: 'Crie links de pagamento, páginas personalizadas ou integre via API no seu sistema. Flexibilidade total.',
  },
  {
    icon: Shield,
    title: 'Validação CNPJ e antifraude',
    desc: 'Cadastro verificado por CNPJ ativo. Limites por colateral. Proteção contra chargebacks e inconsistências.',
  },
];

const FAQ = [
  {
    q: 'Preciso ter conta em banco para receber?',
    a: 'Não. Você recebe diretamente na sua carteira Liquid (DePix). O cliente paga via Pix; a conversão é automática. Você controla seus ativos sem passar por instituições financeiras tradicionais.',
  },
  {
    q: 'Qual a taxa por transação?',
    a: '0,5% + R$ 0,99 por pagamento recebido. Sem mensalidade, sem taxas escondidas. Para alto volume, entre em contato para condições especiais.',
  },
  {
    q: 'Posso integrar no meu sistema ou e-commerce?',
    a: 'Sim. Oferecemos API para criar cobranças, consultar status, configurar webhooks e obter relatórios. Integração técnica disponível para desenvolvedores.',
  },
  {
    q: 'Quanto tempo leva para ativar?',
    a: 'Cadastro com CNPJ + depósito inicial de R$ 5,00 para validação. Após confirmação do pagamento, sua conta é ativada em minutos. O valor do depósito vira colateral e aumenta seu limite.',
  },
  {
    q: 'É regulado? Há riscos?',
    a: 'Operamos na Liquid Network, uma sidechain do Bitcoin. Utilizamos validação de CNPJ e práticas antifraude. Para dúvidas regulatórias ou jurídicas, consulte nossa equipe.',
  },
];

export default function CommerceLanding() {
  const navigate = useNavigate();
  const [ctaLoading, setCtaLoading] = useState(false);

  const handleCtaPrincipal = () => {
    setCtaLoading(true);
    navigate('/login', { state: { redirectAfter: '/comercio/ativar' } });
    setCtaLoading(false);
  };

  const handleCtaApi = () => {
    window.open(BOT_LINK, '_blank');
  };

  const pageTitle = 'PagDepix Commerce – Gateway de Pagamento em DePix para Comerciantes';
  const pageDescription = 'Receba pagamentos via Pix com conversão automática em DePix. Confirmação em minutos, sem custódia, direto na sua carteira Liquid. Links, páginas e API para integração.';
  const canonicalUrl = 'https://pagdepix.com/comercio';

  return (
    <>
      <Helmet>
        <html lang="pt-BR" />
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content="gateway de pagamento cripto, receber pagamentos DePix, gateway pagamento comerciante, Liquid Network, PagDepix Commerce, receber Pix como DePix, API pagamentos Brasil" />
        <meta name="author" content="PagDepix" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content="PagDepix Commerce – Receba pagamentos em DePix" />
        <meta property="og:description" content={pageDescription} />
        <meta name="robots" content="index, follow" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'PagDepix Commerce',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Web',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'BRL',
            },
            description: pageDescription,
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <PublicHeader currentPage="comercio" />

        <main id="main-content" className="relative z-10">
          {/* Hero */}
          <section className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center" aria-labelledby="hero-heading">
            <div className="inline-flex items-center gap-2 bg-bitcoin/10 text-bitcoin px-3 py-1.5 rounded-full text-xs font-medium border border-bitcoin/30 mb-6">
              <Store className="w-3.5 h-3.5" />
              Gateway de pagamento para comerciantes
            </div>
            <h1 id="hero-heading" className="text-3xl md:text-5xl font-black text-white mb-4 md:mb-6 leading-tight">
              Receba pagamentos em DePix.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-500">Sem custódia. Confirmação automática.</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-8 md:mb-10">
              Seus clientes pagam via Pix. Você recebe em DePix direto na sua carteira Liquid. Nenhuma empresa guarda seu dinheiro. Links, páginas personalizadas e API para integrar no seu sistema.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="button"
                onClick={handleCtaPrincipal}
                disabled={ctaLoading}
                className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-base hover:shadow-lg hover:shadow-bitcoin/40 transition-all disabled:opacity-70 ${focusRing}`}
              >
                Ativar Modo Comércio
                <ChevronRight className="w-5 h-5" />
              </button>
              <a
                href={BOT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleCtaApi}
                className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-gray-600 text-gray-300 font-semibold hover:border-bitcoin/50 hover:text-bitcoin transition-all ${focusRing}`}
              >
                <Code2 className="w-5 h-5" />
                Integrar via API
              </a>
            </div>
            <p className="text-gray-500 text-sm mt-6">
              0,5% + R$ 0,99 por transação · Sem mensalidade · Ative em minutos
            </p>
          </section>

          {/* Prova de confiança */}
          <section className="max-w-5xl mx-auto px-4 pb-12 md:pb-16">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Sem custódia', icon: Lock },
                { label: 'Liquid Network', icon: Globe },
                { label: 'Confirmação automática', icon: Zap },
                { label: 'API REST', icon: Code2 },
              ].map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <Icon className="w-5 h-5 text-bitcoin flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-300">{label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Benefícios */}
          <section className="max-w-5xl mx-auto px-4 py-16 md:py-24" aria-labelledby="beneficios-heading">
            <h2 id="beneficios-heading" className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
              Por que PagDepix Commerce?
            </h2>
            <div className="grid md:grid-cols-2 gap-6 md:gap-8">
              {BENEFICIOS.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="p-6 rounded-2xl bg-gray-800/50 border border-gray-700/50 hover:border-bitcoin/30 transition-colors">
                  <Icon className="w-10 h-10 text-bitcoin mb-4" />
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-gray-400 text-sm md:text-base">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Como funciona */}
          <section className="max-w-5xl mx-auto px-4 py-16 md:py-24 bg-gray-800/30 rounded-3xl mx-4 md:mx-auto" aria-labelledby="como-funciona-heading">
            <h2 id="como-funciona-heading" className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
              Como funciona
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-bitcoin/20 flex items-center justify-center mx-auto mb-4 text-bitcoin font-bold">1</div>
                <h3 className="text-white font-semibold mb-2">Cadastre seu CNPJ</h3>
                <p className="text-gray-400 text-sm">Validação na Receita Federal + depósito inicial de R$ 5,00 (convertido em colateral).</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-bitcoin/20 flex items-center justify-center mx-auto mb-4 text-bitcoin font-bold">2</div>
                <h3 className="text-white font-semibold mb-2">Configure sua carteira</h3>
                <p className="text-gray-400 text-sm">Informe o endereço Liquid onde deseja receber. Crie links ou integre via API.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-bitcoin/20 flex items-center justify-center mx-auto mb-4 text-bitcoin font-bold">3</div>
                <h3 className="text-white font-semibold mb-2">Receba pagamentos</h3>
                <p className="text-gray-400 text-sm">Cliente paga via Pix. Confirmação automática. DePix cai na sua carteira em minutos.</p>
              </div>
            </div>
          </section>

          {/* API Gateway */}
          <section className="max-w-5xl mx-auto px-4 py-16 md:py-24" aria-labelledby="api-heading">
            <h2 id="api-heading" className="text-2xl md:text-3xl font-bold text-white text-center mb-4">
              API para desenvolvedores
            </h2>
            <p className="text-gray-400 text-center max-w-2xl mx-auto mb-12">
              Integre o PagDepix no seu sistema, e-commerce ou aplicativo. Crie cobranças, consulte status e receba confirmações via webhook.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              {[
                'Criar cobranças e links de pagamento',
                'Consultar status de transações',
                'Webhook para confirmação automática',
                'Relatórios e histórico',
                'Configuração de taxas',
                'Validação na Liquid Network',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 p-4 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-300 text-sm md:text-base">{item}</span>
                </div>
              ))}
            </div>
            <div className="text-center">
              <a
                href={BOT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gray-800 border border-gray-600 text-white font-semibold hover:border-bitcoin/50 hover:text-bitcoin transition-all ${focusRing}`}
              >
                <MessageCircle className="w-5 h-5" />
                Solicitar acesso à API
              </a>
              <p className="text-gray-500 text-xs mt-3">Entre em contato pelo Telegram para documentação e chaves de integração.</p>
            </div>
          </section>

          {/* FAQ */}
          <section className="max-w-3xl mx-auto px-4 py-16 md:py-24" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
              Perguntas frequentes
            </h2>
            <div className="space-y-4">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group p-5 rounded-xl bg-gray-800/50 border border-gray-700/50">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-white font-semibold">
                    {q}
                    <ChevronRight className="w-5 h-5 text-gray-400 group-open:rotate-90 transition-transform" />
                  </summary>
                  <p className="text-gray-400 text-sm mt-4 pl-0">{a}</p>
                </details>
              ))}
            </div>
          </section>

          {/* CTA final */}
          <section className="max-w-4xl mx-auto px-4 py-16 md:py-24" aria-labelledby="cta-final-heading">
            <div className="text-center p-8 md:p-12 rounded-3xl bg-gradient-to-br from-bitcoin/20 to-orange-500/20 border-2 border-bitcoin/40">
              <h2 id="cta-final-heading" className="text-2xl md:text-4xl font-bold text-white mb-4">
                Pronto para receber em DePix?
              </h2>
              <p className="text-gray-300 mb-8 max-w-xl mx-auto">
                Ative sua conta em minutos. Sem mensalidade. Pague apenas quando receber.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  type="button"
                  onClick={handleCtaPrincipal}
                  disabled={ctaLoading}
                  className={`inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black font-bold text-lg hover:shadow-lg hover:shadow-bitcoin/40 transition-all ${focusRing}`}
                >
                  Ativar Modo Comércio
                  <ArrowRight className="w-5 h-5" />
                </button>
                <Link
                  to="/"
                  className={`inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl border-2 border-gray-600 text-gray-300 font-semibold hover:border-gray-500 hover:text-white transition-all ${focusRing}`}
                >
                  Conhecer outros serviços PagDepix
                </Link>
              </div>
            </div>
          </section>

          <div className="max-w-5xl mx-auto px-4 pb-16 text-center">
            <Link to="/" className="text-gray-500 hover:text-bitcoin text-sm transition-colors">
              ← Voltar ao início
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
