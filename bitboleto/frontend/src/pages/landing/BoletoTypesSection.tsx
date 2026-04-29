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
    <section id="tipos-de-boletos" className="bg-gray-900/40 border-y border-gray-800/40 py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="text-center mb-14">
          <SectionLabel>Cobertura</SectionLabel>
          <h2 className="text-3xl md:text-5xl font-black text-white">
            Todos os boletos são aceitos
          </h2>
          <p className="text-gray-400 text-base mt-4">
            Se tem código de barras, a gente paga.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TYPES.map((t) => (
            <div
              key={t.title}
              className={`group bg-gray-900/60 border rounded-2xl p-5 hover:scale-[1.02]
                transition-all duration-300 hover:shadow-lg ${t.bg}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4
                bg-current/10 group-hover:scale-110 transition-transform duration-300 ${t.color}`}>
                <t.icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-sm mb-1">{t.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
