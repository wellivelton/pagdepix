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
    <section id="taxas-inteligentes" className="bg-gray-900/40 border-y border-[rgba(214,235,253,0.19)] py-8 md:py-12">
      <div className="max-w-4xl mx-auto px-4 md:px-6">
        <div className="text-center mb-5 md:mb-8">
          <SectionLabel>Transparência</SectionLabel>
          <h2 className="text-xl md:text-2xl font-black text-white">
            Taxas{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
              sem surpresa
            </span>
          </h2>
          <p className="text-gray-400 text-sm mt-2">
            Quanto maior o boleto, menor o percentual. Simples assim.
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-[rgba(214,235,253,0.19)] overflow-hidden shadow-[rgba(176,199,217,0.145)_0px_0px_0px_1px]">

          <div className="md:hidden divide-y divide-[rgba(214,235,253,0.19)]">
            {FEE_ROWS.map((row, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-bitcoin/5 transition-colors">
                <div>
                  <div className="text-xs font-medium text-gray-300">{row.range}</div>
                  <div className="text-xs text-gray-600 mt-0.5">+ {row.fixed} fixo</div>
                </div>
                <span className="text-bitcoin font-black text-lg">{row.percent}</span>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Tabela de taxas por faixa">
              <thead>
                <tr className="border-b border-[rgba(214,235,253,0.19)] bg-gray-900/80">
                  <th scope="col" className="text-left py-3 px-5 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Faixa de valor
                  </th>
                  <th scope="col" className="text-center py-3 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Taxa %
                  </th>
                  <th scope="col" className="text-center py-3 px-4 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Taxa fixa
                  </th>
                  <th scope="col" className="text-right py-3 px-5 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                    Exemplo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(214,235,253,0.19)]">
                {FEE_ROWS.map((row, i) => (
                  <tr key={i} className="hover:bg-bitcoin/5 transition-colors">
                    <td className="py-3 px-5 text-gray-300 font-medium text-sm">{row.range}</td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-bitcoin font-black text-sm">{row.percent}</span>
                    </td>
                    <td className="py-3 px-4 text-center text-gray-400 text-sm">{row.fixed}</td>
                    <td className="py-3 px-5 text-right text-gray-500 font-mono text-xs">{row.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[rgba(214,235,253,0.19)] p-3 md:p-4 flex items-start gap-2.5 bg-bitcoin/5">
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
