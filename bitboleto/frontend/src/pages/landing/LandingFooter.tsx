import { Link } from 'react-router-dom';

export default function LandingFooter() {
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <footer
      className="bg-gray-950 border-t border-gray-800/50 relative z-20"
      role="contentinfo"
    >
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-6 md:py-16">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-6 md:gap-10 mb-8 md:mb-12">
          {/* Brand */}
          <div className="col-span-3 md:col-span-2 space-y-2 md:space-y-4">
            <h3 className="font-black text-white text-base md:text-xl">PagDepix</h3>
            <p className="text-gray-500 text-xs md:text-sm leading-relaxed max-w-xs hidden md:block">
              A primeira plataforma brasileira que conecta a Liquid Network ao seu dia a dia.
              Pague boletos, recarregue celular e muito mais com Depix, L-USDT e L-BTC.
            </p>
            <p className="text-gray-500 text-xs leading-relaxed md:hidden">
              Liquid Network · Boletos · Recargas · Marketplace
            </p>
          </div>

          {/* Navegação */}
          <div>
            <h4 className="font-bold text-gray-300 text-xs uppercase tracking-widest mb-3 md:mb-5">
              Plataforma
            </h4>
            <ul className="space-y-2 md:space-y-3 text-xs md:text-sm text-gray-500">
              <li>
                <a
                  href="#servicos"
                  onClick={(e) => { e.preventDefault(); scrollTo('servicos'); }}
                  className="hover:text-bitcoin transition-colors"
                >
                  Serviços
                </a>
              </li>
              <li>
                <a
                  href="#taxas-inteligentes"
                  onClick={(e) => { e.preventDefault(); scrollTo('taxas-inteligentes'); }}
                  className="hover:text-bitcoin transition-colors"
                >
                  Taxas
                </a>
              </li>
              <li>
                <a
                  href="#como-funciona"
                  onClick={(e) => { e.preventDefault(); scrollTo('como-funciona'); }}
                  className="hover:text-bitcoin transition-colors"
                >
                  Como funciona
                </a>
              </li>
              <li>
                <Link to="/afiliados" className="hover:text-bitcoin transition-colors">
                  Afiliados
                </Link>
              </li>
              <li>
                <Link to="/comercio" className="hover:text-bitcoin transition-colors">
                  Para comerciantes
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold text-gray-300 text-xs uppercase tracking-widest mb-3 md:mb-5">
              Legal
            </h4>
            <ul className="space-y-2 md:space-y-3 text-xs md:text-sm text-gray-500">
              <li>
                <Link to="/termos" className="hover:text-bitcoin transition-colors">
                  Termos de uso
                </Link>
              </li>
              <li>
                <Link to="/privacidade" className="hover:text-bitcoin transition-colors">
                  Privacidade
                </Link>
              </li>
              <li>
                <Link to="/regras" className="hover:text-bitcoin transition-colors">
                  Regras de operação
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800/50 pt-5 md:pt-8 flex flex-col md:flex-row justify-between items-center gap-2 md:gap-4">
          <span className="text-xs text-gray-600">
            © {new Date().getFullYear()} PagDepix. Todos os direitos reservados.
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Sistema online · Liquid Network
          </div>
        </div>
      </div>
    </footer>
  );
}
