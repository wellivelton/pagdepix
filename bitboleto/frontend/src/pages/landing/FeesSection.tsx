import { Info } from 'lucide-react';
import SectionLabel from '../../components/landing/SectionLabel';

const FEE_ROWS = [
  { range: 'R$ 20 – R$ 49,99', percent: '4%', fixed: 'R$ 1,99', example: 'R$ 33,19' },
  { range: 'R$ 50 – R$ 99,99', percent: '3%', fixed: 'R$ 1,99', example: 'R$ 104,99' },
  { range: 'R$ 100 – R$ 499,99', percent: '2,5%', fixed: 'R$ 1,99', example: 'R$ 155,74' },
  { range: 'Acima de R$ 500', percent: '2%', fixed: 'R$ 0,99', example: 'R$ 510,99' },
];

export default function FeesSection() {
  return (
    <section id="taxas-inteligentes" className="bg-gray-900/40 border-y border-gray-800/40 py-20 md:py-28">
      <div className="max-w-4xl mx-auto px-4 md:px-6">
        <div className="text-center mb-14">
          <SectionLabel>Transparência</SectionLabel>
          <h2 className="text-3xl md:text-5xl font-black text-white">
            Taxas{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
              sem surpresa
            </span>
          </h2>
          <p className="text-gray-400 text-base mt-4">
            Quanto maior o boleto, menor o percentual. Simples assim.
          </p>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Tabela de taxas por faixa">
              <thead>
                <tr className="border-b border-gray-800/60 bg-gray-900/80">
                  <th scope="col" className="text-left py-4 px-6 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Faixa de valor
                  </th>
                  <th scope="col" className="text-center py-4 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Taxa %
                  </th>
                  <th scope="col" className="text-center py-4 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Taxa fixa
                  </th>
                  <th scope="col" className="text-right py-4 px-6 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Exemplo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40">
                {FEE_ROWS.map((row, i) => (
                  <tr
                    key={i}
                    className="hover:bg-bitcoin/5 transition-colors group"
                  >
                    <td className="py-4 px-6 text-gray-300 font-medium">{row.range}</td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-bitcoin font-black text-base">{row.percent}</span>
                    </td>
                    <td className="py-4 px-4 text-center text-gray-400">{row.fixed}</td>
                    <td className="py-4 px-6 text-right text-gray-500 font-mono text-xs">{row.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-800/60 p-5 flex items-start gap-3 bg-bitcoin/5">
            <Info className="w-4 h-4 text-bitcoin flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 leading-relaxed">
              <span className="font-semibold text-white">Sem limite máximo por boleto.</span>{' '}
              Boletos vencidos não são aceitos. Recarga de celular possui tabela própria de preços.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
