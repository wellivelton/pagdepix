import { useNavigate } from 'react-router-dom';
import { CreditCard, Smartphone, ShoppingBag, Users } from 'lucide-react';
import SectionLabel from '../../components/landing/SectionLabel';
import ProductCard from '../../components/landing/ProductCard';

export default function ProductsSection() {
  const navigate = useNavigate();
  const go = (path: string) => navigate(path);

  const products = [
    {
      icon: CreditCard,
      badge: 'Mais rápido',
      title: 'Pagar Boletos',
      desc: 'Todos os boletos aceitos: contas de consumo, impostos, tributos federais e estaduais, boletos bancários. Liquidação em minutos em dias úteis.',
      fee: '2% + R$ 0,99',
      min: 'Mín. R$ 20',
      path: '/login',
    },
    {
      icon: Smartphone,
      badge: 'Crédito na hora',
      title: 'Recarregar Celular',
      desc: 'Vivo, Claro, TIM, Oi e outras operadoras. O crédito cai em segundos no número informado.',
      fee: 'Preço competitivo',
      min: 'Mín. R$ 20',
      path: '/login',
    },
    {
      icon: ShoppingBag,
      badge: 'Compre com cripto',
      title: 'Marketplace',
      desc: 'Compre e venda produtos digitais e físicos usando Depix, L-USDT ou L-BTC. Pagamento crypto → entrega real.',
      fee: 'Por produto',
      min: 'Sem mínimo',
      path: '/loja',
    },
    {
      icon: Users,
      badge: 'Ganhe comissão',
      title: 'Programa de Afiliados',
      desc: 'Indique usuários e ganhe comissão em cada transação deles. Saque em Depix direto para sua carteira Liquid.',
      fee: '% por transação',
      min: 'Sem mínimo',
      path: '/afiliados',
    },
  ];

  return (
    <section id="servicos" className="py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-5 md:mb-8">
          <SectionLabel>Produtos</SectionLabel>
          <h2 className="text-xl md:text-2xl font-black text-white">
            Tudo que você precisa{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
              em um só lugar
            </span>
          </h2>
          <p className="text-gray-400 text-sm mt-2 max-w-2xl mx-auto">
            Boletos, recargas, marketplace e programa de afiliados — todos pagos com Depix, L-USDT ou L-BTC.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {products.map((p) => (
            <ProductCard
              key={p.title}
              icon={p.icon}
              badge={p.badge}
              title={p.title}
              desc={p.desc}
              fee={p.fee}
              min={p.min}
              onClick={() => go(p.path)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
