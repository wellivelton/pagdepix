/**
 * Página pública "Modo Comércio" – em construção; explica o programa para donos de negócio.
 * Padronizada para mobile (compacto) e desktop (tamanhos maiores).
 */

import { Link, useNavigate } from 'react-router-dom';
import {
  Store,
  Link2,
  FileText,
  Percent,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  ArrowRight,
  Wallet,
} from 'lucide-react';
import PublicHeader from '../components/PublicHeader';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitcoin/50 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900';

export default function ModoComercio() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:w-auto focus:h-auto focus:py-2 focus:px-4 focus:m-0 focus:overflow-visible focus:[clip:auto] focus:rounded-lg focus:bg-bitcoin focus:text-black focus:font-semibold focus:no-underline"
      >
        Pular para o conteúdo
      </a>

      <PublicHeader currentPage="comercio" />

      <main id="main-content" tabIndex={-1} className="max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-12">
        <div className="text-center mb-5 md:mb-10">
          <h1 className="text-xl font-bold text-white mb-1.5 md:text-4xl md:mb-2">
            Modo Comércio
          </h1>
          <p className="text-gray-400 text-xs md:text-lg">
            Receba pagamentos em Pix e receba em Depix na sua carteira. Do ambulante ao grande empresário.
          </p>
        </div>

        <div className="space-y-4 md:space-y-8">
          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-xl flex items-center gap-1.5 md:gap-2">
              <Store className="w-4 h-4 md:w-6 md:h-6 text-bitcoin flex-shrink-0" />
              O que é o Modo Comércio?
            </h2>
            <p className="text-gray-300 text-xs md:text-base mb-2 md:mb-4">
              O Modo Comércio é voltado para <strong className="text-white">donos de negócio</strong> — do comerciante ambulante ao grande empresário. Você cadastra seu comércio uma vez e passa a criar <strong className="text-bitcoin">links de pagamento rápidos</strong> e <strong className="text-bitcoin">páginas pré-prontas com valores pré-definidos</strong> para seus clientes pagarem via Pix. O valor é convertido em Depix e enviado para sua carteira Liquid.
            </p>
            <p className="text-gray-400 text-xs md:text-sm">
              Cada link ou página gera um <strong className="text-white">QR Code Pix na hora</strong> do pagamento (com o valor que você definiu). Assim seu cliente paga em segundos e você recebe em Depix.
            </p>
          </section>

          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-xl flex items-center gap-1.5 md:gap-2">
              <Link2 className="w-4 h-4 md:w-6 md:h-6 text-bitcoin flex-shrink-0" />
              Como funciona
            </h2>
            <ul className="space-y-1.5 md:space-y-3 text-xs md:text-base text-gray-300">
              <li className="flex items-start gap-1.5 md:gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Links de pagamento rápidos</strong> — crie um link com valor fixo (ex.: R$ 50,00). Compartilhe com o cliente. Ele abre, paga o Pix e você recebe o Depix.</span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Páginas com valores pré-definidos</strong> — exiba vários valores na mesma página (ex.: R$ 10, R$ 25, R$ 50). O cliente escolhe, gera o QR Pix e paga.</span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <QrCode className="w-3.5 h-3.5 md:w-5 md:h-5 text-bitcoin flex-shrink-0 mt-0.5" />
                <span>Cada pagamento gera um <strong className="text-white">QR Code Pix único</strong> na hora (valor definido por você). Não é um único QR estático: cada transação tem seu próprio QR e valor.</span>
              </li>
            </ul>
          </section>

          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-xl flex items-center gap-1.5 md:gap-2">
              <Percent className="w-4 h-4 md:w-6 md:h-6 text-bitcoin flex-shrink-0" />
              Taxas no Modo Comércio
            </h2>
            <p className="text-gray-300 text-xs md:text-base mb-2 md:mb-4">
              As taxas para parceiros do Modo Comércio são <strong className="text-white">diferentes</strong> do uso pessoal:
            </p>
            <div className="inline-flex flex-wrap items-center gap-1.5 md:gap-2 px-3 py-2 md:px-4 md:py-3 rounded-lg md:rounded-xl bg-bitcoin/10 border border-bitcoin/30">
              <span className="text-bitcoin font-bold text-base md:text-xl">0,5% + R$ 0,99 fixo</span>
              <span className="text-gray-400 text-xs md:text-sm">por transação</span>
            </div>
          </section>

          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-xl flex items-center gap-1.5 md:gap-2">
              <ShieldCheck className="w-4 h-4 md:w-6 md:h-6 text-bitcoin flex-shrink-0" />
              Requisitos para ser parceiro
            </h2>
            <p className="text-gray-300 text-xs md:text-base mb-2 md:mb-4">
              Para se cadastrar no Modo Comércio é necessário um <strong className="text-white">cadastro com KYC</strong> (verificação de identidade):
            </p>
            <ul className="space-y-1.5 md:space-y-3 text-xs md:text-base text-gray-300">
              <li className="flex items-start gap-1.5 md:gap-2">
                <FileText className="w-3.5 h-3.5 md:w-5 md:h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Nome e sobrenome</strong> do responsável</span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <FileText className="w-3.5 h-3.5 md:w-5 md:h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">CNPJ do negócio</strong></span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <Store className="w-3.5 h-3.5 md:w-5 md:h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <span><strong className="text-white">Tipo de negócio</strong> — na inscrição você escolhe entre negócios em alta no Brasil ou informa "Outro" e descreve seu modelo de negócio.</span>
              </li>
            </ul>
          </section>

          <section className="bg-gradient-to-r from-bitcoin/20 to-orange-500/20 rounded-lg md:rounded-2xl p-4 md:p-8 border border-bitcoin/30 text-center">
            <h2 className="text-base font-bold text-white mb-1.5 md:text-xl md:mb-2">Quero ser parceiro Modo Comércio</h2>
            <p className="text-gray-300 text-xs md:text-base mb-3 md:mb-6">
              Faça sua inscrição com KYC, nome, CNPJ e tipo de negócio. Após análise, você poderá criar links e páginas de pagamento.
            </p>
            <button
              type="button"
              onClick={() => navigate('/comercio/cadastro')}
              className={`inline-flex items-center justify-center gap-1.5 md:gap-2 px-4 py-2 md:px-8 md:py-4 text-xs md:text-base font-bold rounded-lg md:rounded-xl bg-gradient-to-r from-bitcoin to-orange-500 text-black hover:shadow-lg hover:shadow-bitcoin/50 transition-all ${focusRing}`}
            >
              <Wallet className="w-3.5 h-3.5 md:w-5 md:h-5" />
              Cadastrar como comerciante
              <ArrowRight className="w-3.5 h-3.5 md:w-5 md:h-5" />
            </button>
          </section>
        </div>

        <div className="mt-6 md:mt-10 text-center">
          <Link to="/" className={`text-xs md:text-base text-bitcoin hover:underline ${focusRing} rounded`}>
            ← Voltar ao início
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-800 mt-8 md:mt-16">
        <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 md:gap-4 text-xs md:text-sm text-gray-400">
            <span className="flex items-center gap-1.5">
              <img src="/logo.png" alt="PagDepix" className="h-3.5 w-auto object-contain md:h-5" />
              © 2026. Todos os direitos reservados.
            </span>
            <span className="flex gap-1.5 md:gap-2">
              <Link to="/termos" className={`hover:text-bitcoin transition-colors ${focusRing} rounded`}>Termos</Link>
              <span>|</span>
              <Link to="/privacidade" className={`hover:text-bitcoin transition-colors ${focusRing} rounded`}>Privacidade</Link>
              <span>|</span>
              <Link to="/regras" className={`hover:text-bitcoin transition-colors ${focusRing} rounded`}>Regras</Link>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
