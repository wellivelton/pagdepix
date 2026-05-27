import { QrCode, Coins, Zap, CheckCircle2 } from 'lucide-react';
import SectionLabel from '../../components/landing/SectionLabel';
import StepItem from '../../components/landing/StepItem';
import SimulatorCard from '../../components/landing/SimulatorCard';

const STEPS = [
  {
    num: '1',
    icon: QrCode,
    title: 'Informe o boleto ou serviço',
    desc: 'Cole o código de barras do boleto, o número do celular para recarga ou escolha um produto no marketplace.',
  },
  {
    num: '2',
    icon: Coins,
    title: 'Escolha sua cripto',
    desc: 'Selecione Depix, L-USDT ou L-BTC na Liquid Network. O valor é convertido automaticamente.',
  },
  {
    num: '3',
    icon: Zap,
    title: 'Envie o pagamento',
    desc: 'Transfira o valor pelo endereço gerado na Liquid. Rápido, privado e sem intermediários.',
  },
  {
    num: '4',
    icon: CheckCircle2,
    title: 'Pronto — conta paga',
    desc: 'Liquidação em minutos em dias úteis. Comprovante disponível no seu histórico.',
    isLast: true,
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="como-funciona"
      className="bg-gray-900/40 border-y border-[rgba(214,235,253,0.19)] py-8 md:py-12"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-5 md:mb-8">
          <SectionLabel>Processo</SectionLabel>
          <h2 className="text-xl md:text-2xl font-black text-white">
            Como funciona em{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
              4 passos
            </span>
          </h2>
          <p className="text-gray-400 text-sm mt-2 max-w-xl mx-auto">
            Da sua carteira Liquid ao boleto pago, tudo acontece em minutos.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-start">
          <div>
            {STEPS.map((step) => (
              <StepItem
                key={step.num}
                num={step.num}
                title={step.title}
                desc={step.desc}
                isLast={'isLast' in step && step.isLast}
              />
            ))}
          </div>

          <div className="sticky top-20">
            <SimulatorCard />
          </div>
        </div>
      </div>
    </section>
  );
}
