/**
 * Página pública "Seja Afiliado" – explica o programa, regras e CTA para Telegram.
 * Padronizada para mobile (compacto) e desktop.
 */

import { Link } from 'react-router-dom';
import { Users, Gift, Wallet, AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react';
import PublicHeader from '../components/PublicHeader';

const SUPPORT_TELEGRAM = '@PagDepixBot';
const BOT_LINK = `https://t.me/${SUPPORT_TELEGRAM.replace('@', '')}`;

export default function Afiliados() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <PublicHeader currentPage="afiliados" />

      <main className="max-w-4xl mx-auto px-4 py-4 md:px-6 md:py-12">
        <div className="text-center mb-5 md:mb-12">
          <h1 className="text-xl font-bold text-white mb-1.5 md:text-4xl md:mb-4">
            Programa de Afiliados
          </h1>
          <p className="text-gray-400 text-xs md:text-xl">
            Ganhe comissão indicando quem paga boletos com Depix
          </p>
        </div>

        <div className="space-y-4 md:space-y-10 text-gray-300">
          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-2xl md:mb-4 flex items-center gap-1.5 md:gap-2">
              <Users className="w-4 h-4 md:w-7 md:h-7 text-bitcoin flex-shrink-0" />
              Como funciona
            </h2>
            <p className="text-xs md:text-base mb-2 md:mb-4">
              Você recebe um cupom exclusivo para divulgar. Quando alguém paga um boleto usando seu cupom, você ganha <strong className="text-bitcoin">comissão sobre a taxa</strong> paga por essa pessoa. O cadastro como afiliado é <strong className="text-white">manual</strong>, feito apenas pelo admin.
            </p>
            <ul className="list-disc pl-4 md:pl-6 space-y-1 md:space-y-2 text-xs md:text-base">
              <li>Comissão somente sobre as <strong className="text-white">taxas</strong> pagas pelos indicados (não sobre o valor do boleto).</li>
              <li>Pagamento exclusivamente em <strong className="text-bitcoin">DEPIX</strong> (não em real nem outra cripto).</li>
              <li>Saque mínimo: <strong className="text-white">20 DEPIX</strong>.</li>
            </ul>
          </section>

          <section className="bg-gray-800/50 backdrop-blur-xl rounded-lg md:rounded-2xl p-4 md:p-8 border border-gray-700/50">
            <h2 className="text-base font-bold text-white mb-2 md:text-2xl md:mb-4 flex items-center gap-1.5 md:gap-2">
              <Gift className="w-4 h-4 md:w-7 md:h-7 text-bitcoin flex-shrink-0" />
              Regras e boas práticas
            </h2>
            <ul className="space-y-2 md:space-y-3">
              <li className="flex items-start gap-1.5 md:gap-2">
                <AlertCircle className="w-3.5 h-3.5 md:w-5 md:h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs md:text-base"><strong className="text-white">Proibido usar o próprio cupom</strong> em suas transações. Afiliado não pode utilizar o próprio cupom.</span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-xs md:text-base">Limites de boleto para seus indicados: <strong className="text-white">mínimo R$ 20,00</strong>, <strong className="text-white">máximo padrão R$ 1.000,00</strong>. Boletos vencidos não são aceitos.</span>
              </li>
              <li className="flex items-start gap-1.5 md:gap-2">
                <Wallet className="w-3.5 h-3.5 md:w-5 md:h-5 text-bitcoin flex-shrink-0 mt-0.5" />
                <span className="text-xs md:text-base">Saques são processados manualmente pelo admin. Ao solicitar, informe o endereço da carteira <strong className="text-white">Liquid Network</strong> para receber em DEPIX.</span>
              </li>
            </ul>
          </section>

          <section className="bg-gradient-to-r from-bitcoin/20 to-orange-500/20 rounded-lg md:rounded-2xl p-4 md:p-8 border border-bitcoin/30 text-center">
            <h2 className="text-base font-bold text-white mb-2 md:text-2xl md:mb-4">Quero ser afiliado</h2>
            <p className="text-gray-300 text-xs md:text-base mb-4 md:mb-6">
              O cadastro é manual. Entre em contato pelo Telegram informando que deseja ser afiliado. Nossa equipe analisará e habilitará sua conta.
            </p>
            <a
              href={BOT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 md:gap-2 px-5 py-2.5 md:px-8 md:py-4 bg-[#0088cc] text-white text-xs font-bold md:text-base rounded-lg md:rounded-xl hover:bg-[#0077b5] transition-colors"
            >
              <MessageCircle className="w-4 h-4 md:w-6 md:h-6" />
              Abrir Telegram – {SUPPORT_TELEGRAM}
            </a>
          </section>
        </div>

        <div className="mt-6 md:mt-10 text-center">
          <Link to="/" className="text-xs md:text-base text-bitcoin hover:underline">← Voltar ao início</Link>
        </div>
      </main>
    </div>
  );
}
