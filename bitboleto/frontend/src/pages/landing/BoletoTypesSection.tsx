import { FileText, CreditCard, Users, Globe } from 'lucide-react';
import SectionLabel from '../../components/landing/SectionLabel';

const TYPES = [
  { icon: FileText, title: 'Contas de consumo', desc: 'Água, luz, gás, telefone, internet', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  { icon: CreditCard, title: 'Impostos e tributos', desc: 'IPVA, IPTU, multas, DAS, DARF', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  { icon: Users, title: 'Boletos bancários', desc: 'Todos os bancos e financeiras', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  { icon: Globe, title: 'Governo federal/estadual', desc: 'Guias e taxas públicas', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
];

export default function BoletoTypesSection() {
  return (
    <section id="tipos-de-boletos" className="bg-gray-900/40 border-y border-[rgba(214,235,253,0.19)] py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-5 md:mb-8">
          <SectionLabel>Cobertura</SectionLabel>
          <h2 className="text-xl md:text-2xl font-black text-white">
            Todos os boletos são aceitos
          </h2>
          <p className="text-gray-400 text-sm mt-2">
            Se tem código de barras, a gente paga.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TYPES.map((t) => (
            <div
              key={t.title}
              className={`group bg-gray-900/60 border rounded-xl p-3 hover:scale-[1.02]
                transition-all duration-300 hover:shadow-lg ${t.bg}`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5
                bg-current/10 group-hover:scale-110 transition-transform duration-300 ${t.color}`}>
                <t.icon className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-white text-xs mb-0.5">{t.title}</h3>
              <p className="text-[10px] text-gray-500 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
