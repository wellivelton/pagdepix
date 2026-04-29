import { Shield, Zap, Lock, Globe, Coins, TrendingUp } from 'lucide-react';
import SectionLabel from '../../components/landing/SectionLabel';
import FeatureCard from '../../components/landing/FeatureCard';

const FEATURES = [
  {
    icon: Shield,
    stat: '0',
    title: 'Documentos exigidos',
    desc: 'Sem KYC, sem selfie, sem comprovante de renda. Sua identidade é sua carteira Liquid.',
  },
  {
    icon: Zap,
    stat: '~2min',
    title: 'Tempo de liquidação',
    desc: 'Da confirmação do pagamento cripto ao boleto pago. Em dias úteis, em minutos.',
  },
  {
    icon: Lock,
    stat: '100%',
    title: 'Transações privadas',
    desc: 'Confidential Assets na Liquid Network. Nem o valor nem o destinatário são públicos.',
  },
  {
    icon: Coins,
    stat: '3',
    title: 'Ativos aceitos',
    desc: 'Depix (stablecoin 1:1 BRL), L-USDT e L-BTC. Todos na mesma plataforma.',
  },
  {
    icon: Globe,
    stat: '∞',
    title: 'Sem limite de valor',
    desc: 'Não existe teto por boleto. Quanto maior o valor, menor o percentual cobrado.',
  },
  {
    icon: TrendingUp,
    stat: 'R$0',
    title: 'Para abrir conta',
    desc: 'Cadastro gratuito, sem mensalidade. Você só paga quando usa.',
  },
];

export default function FeaturesSection() {
  return (
    <section className="py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-14">
          <SectionLabel>Por que PagDepix</SectionLabel>
          <h2 className="text-3xl md:text-5xl font-black text-white">
            Feito para quem usa{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
              cripto de verdade
            </span>
          </h2>
          <p className="text-gray-400 text-base mt-4 max-w-xl mx-auto">
            Sem burocracia bancária. Sem centralização. Sem surpresas.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {FEATURES.map((f) => (
            <FeatureCard
              key={f.title}
              icon={f.icon}
              stat={f.stat}
              title={f.title}
              desc={f.desc}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
