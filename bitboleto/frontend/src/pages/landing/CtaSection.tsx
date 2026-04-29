import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowRight, Receipt } from 'lucide-react';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950';

export default function CtaSection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 md:py-28 relative overflow-hidden">
      {/* Glow de fundo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[300px] bg-bitcoin/10 rounded-full blur-[80px]" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 md:px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-bitcoin/10 border border-bitcoin/25
          text-bitcoin text-xs font-semibold px-4 py-2 rounded-full mb-8 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-bitcoin animate-pulse" />
          Gratuito para abrir conta
        </div>

        <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
          Abra agora.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-orange-400">
            Zero burocracia.
          </span>
        </h2>

        <p className="text-lg text-gray-400 mb-10 max-w-xl mx-auto leading-relaxed">
          Mais de 1.000 usuários já usam cripto para pagar contas no Brasil.
          Sem documentos. Sem banco. Em minutos.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/login')}
            className={`group inline-flex items-center justify-center gap-2.5 px-8 py-4
              text-base font-bold bg-gradient-to-r from-bitcoin to-orange-500 text-black rounded-xl
              hover:shadow-2xl hover:shadow-bitcoin/30 hover:-translate-y-0.5 transition-all duration-200 ${focusRing}`}
          >
            <Wallet className="w-5 h-5" />
            Quero começar agora
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <button
            onClick={() =>
              window.open(
                'https://github.com/eulen-repo/DePix/blob/main/whitepaper/depix_whitepaper-en_US.pdf',
                '_blank'
              )
            }
            className={`inline-flex items-center justify-center gap-2 px-8 py-4
              text-base font-semibold border border-gray-700 text-gray-400 rounded-xl
              hover:border-bitcoin/40 hover:text-bitcoin hover:bg-bitcoin/5
              transition-all duration-200 ${focusRing}`}
          >
            <Receipt className="w-4 h-4" />
            Ler whitepaper Depix
          </button>
        </div>
      </div>
    </section>
  );
}
