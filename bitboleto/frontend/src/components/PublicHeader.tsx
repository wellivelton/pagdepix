/**
 * Header público com logo, nav (desktop) e menu hamburger (mobile).
 * Usado na Landing, Afiliados e Modo Comércio.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

export type PublicPage = 'landing' | 'afiliados' | 'comercio';

type Props = {
  /** Página atual para destacar o item ativo no desktop */
  currentPage?: PublicPage;
};

export default function PublicHeader({ currentPage }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAfiliados = currentPage === 'afiliados';
  const isComercio = currentPage === 'comercio';

  const btnAfiliados = isAfiliados
    ? 'px-3 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black md:px-5 md:py-2.5 md:rounded-xl'
    : `px-3 py-1.5 text-sm font-semibold border border-gray-600 text-gray-300 rounded-lg hover:border-bitcoin/50 hover:text-bitcoin transition-all duration-200 md:px-5 md:py-2.5 md:rounded-xl ${focusRing}`;
  const btnComercio = isComercio
    ? 'px-3 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black md:px-5 md:py-2.5 md:rounded-xl'
    : `px-3 py-1.5 text-sm font-semibold border border-gray-600 text-gray-300 rounded-lg hover:border-bitcoin/50 hover:text-bitcoin transition-all duration-200 md:px-5 md:py-2.5 md:rounded-xl ${focusRing}`;
  const btnEntrar = `px-4 py-1.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/30 transition-all duration-200 md:px-6 md:py-2.5 md:rounded-xl hover:-translate-y-0.5 ${focusRing}`;

  const go = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-700/50 bg-gray-900/80 backdrop-blur-xl" role="banner">
      <div className="max-w-7xl mx-auto px-4 py-2.5 md:px-6 md:py-4">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-1.5" aria-label="PagDepix - Página inicial">
            <img src="/logo.png" alt="" className="h-8 w-auto rounded-lg object-contain md:h-12 md:rounded-xl" width={120} height={48} loading="eager" />
          </Link>

          {/* Desktop: botões no header */}
          <nav className="hidden md:flex items-center gap-2 md:gap-3" aria-label="Menu principal">
            <button
              type="button"
              onClick={() => navigate('/afiliados')}
              aria-label="Conhecer programa de afiliados"
              className={btnAfiliados}
            >
              Seja Afiliado
            </button>
            <button
              type="button"
              onClick={() => navigate('/comercio')}
              aria-label="Conhecer modo comércio"
              className={btnComercio}
            >
              Tem um comércio?
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              aria-label="Entrar na conta"
              className={btnEntrar}
            >
              Entrar
            </button>
          </nav>

          {/* Mobile: botão hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className={`md:hidden p-2 text-gray-400 hover:text-white rounded-lg ${focusRing}`}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Mobile: menu aberto — overlay opaco + painel opaco sobrepondo tudo */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black z-[60] md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            className="fixed top-0 right-0 bottom-0 w-full max-w-xs z-[70] md:hidden flex flex-col bg-gray-900 border-l border-gray-700 shadow-2xl"
            role="dialog"
            aria-label="Menu de navegação"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Fechar menu"
                className={`p-2 text-gray-400 hover:text-white rounded-lg ${focusRing}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-4 flex flex-col gap-2 bg-gray-900 flex-1" aria-label="Opções do menu">
              <button
                type="button"
                onClick={() => go('/login')}
                className={`w-full text-left px-4 py-3 text-sm font-semibold rounded-lg bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/30 transition-all ${focusRing}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => go('/afiliados')}
                className={`w-full text-left px-4 py-3 text-sm font-semibold border border-gray-600 text-gray-300 rounded-lg hover:border-bitcoin/50 hover:text-bitcoin transition-all ${focusRing}`}
              >
                Seja Afiliado
              </button>
              <button
                type="button"
                onClick={() => go('/comercio')}
                className={`w-full text-left px-4 py-3 text-sm font-semibold border border-gray-600 text-gray-300 rounded-lg hover:border-bitcoin/50 hover:text-bitcoin transition-all ${focusRing}`}
              >
                Tem um comércio?
              </button>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
