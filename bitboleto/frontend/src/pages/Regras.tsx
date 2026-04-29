/**
 * Página "Regras" – taxas, Recarga, boletos, cupom e afiliados.
 */

import { Link } from 'react-router-dom';

export default function Regras() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-2">Regras do sistema</h1>
      <p className="text-gray-400 mb-8">
        Taxas, Recarga de Celular, Pagamento de Boletos, cupom de desconto e programa de afiliados.
      </p>

      <div className="space-y-8 text-gray-300">
        <section>
          <h2 className="text-xl font-bold text-white mb-3">1. Regras gerais</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>O PagDepix oferece dois serviços: <strong className="text-white">Pagar Boleto</strong> e <strong className="text-white">Recarga de Celular</strong>. Cupom de desconto está disponível em ambos.</li>
            <li>Valor mínimo de boleto: <strong className="text-white">R$ 20,00</strong>. Sem limite máximo por boleto.</li>
            <li>O sistema <strong className="text-white">não aceita boletos vencidos</strong>.</li>
            <li>O faturamento do sistema são apenas as <strong className="text-white">taxas cobradas</strong>; o valor do boleto/recarga nunca entra em faturamento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">2. Pagamento de Boleto — taxas</h2>
          <p className="mb-3">Taxas cobradas do usuário:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>R$ 20,00 a R$ 49,99 → <strong className="text-bitcoin">4% + R$ 1,99</strong></li>
            <li>R$ 50,00 a R$ 99,99 → <strong className="text-bitcoin">3% + R$ 1,99</strong></li>
            <li>R$ 100,00 a R$ 499,99 → <strong className="text-bitcoin">2,5% + R$ 1,99</strong></li>
            <li>Acima de R$ 500,00 → <strong className="text-bitcoin">2% + R$ 0,99</strong></li>
          </ul>
          <p className="mt-3 text-sm text-gray-500">
            A taxa fixa não pode ser alterada. Desconto (cupom) e comissão de afiliado incidem apenas sobre a <strong className="text-white">parte percentual</strong> (margem), nunca sobre o valor do boleto.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">3. Recarga de Celular</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Valor mínimo da recarga: <strong className="text-white">R$ 20,00</strong>.</li>
            <li>Taxa: <strong className="text-bitcoin">2% + R$ 0,99</strong> sobre o valor da recarga. Cupom de desconto aplicável.</li>
            <li>Operadoras disponíveis conforme oferta (Vivo, Claro, TIM, etc.). O pagamento é em Depix, USDT ou Bitcoin (Liquid Network); após confirmação e aprovação, a recarga é processada.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">4. Cupom de desconto</h2>
          <p className="mb-2">
            O cupom está disponível em <strong className="text-white">Pagar Boleto</strong> e <strong className="text-white">Recarga de Celular</strong>. Regras de segurança:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Afiliados <strong className="text-white">não podem usar o próprio cupom</strong>.</li>
            <li>Validação por e-mail, Telegram, IP e device para evitar fraude. Valor mínimo para usar cupom varia por serviço (ex.: R$ 40 em boleto, R$ 20 em recarga).</li>
            <li>Limite de usos do mesmo cupom por e-mail/telegram por dia (ex.: máx. 2 por dia). Desconto máximo permitido sobre a margem é respeitado em todos os serviços.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">5. Boletos vencidos</h2>
          <p>
            Boletos vencidos não são aceitos. Corrija a data de vencimento antes de prosseguir. Se um boleto vencido for identificado após o pagamento, o suporte entrará em contato e o valor será devolvido, descontando <strong className="text-white">R$ 5,00</strong> como taxa administrativa.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">6. Programa de afiliados</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Afiliados ganham comissão sobre as <strong className="text-white">taxas</strong> pagas pelos indicados (margem das taxas), em boletos e recarga.</li>
            <li>Afiliados <strong className="text-white">não podem usar o próprio cupom</strong>.</li>
            <li>Comissão paga em <strong className="text-bitcoin">DEPIX</strong>. Saque mínimo: <strong className="text-white">20 DEPIX</strong>.</li>
            <li>Cadastro de afiliados é feito pelo suporte. Interessados: contato pelo Telegram.</li>
          </ul>
          <p className="mt-3">
            <Link to="/afiliados" className="text-bitcoin hover:underline">Saiba mais e quero ser afiliado</Link>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-white mb-3">7. Boas práticas</h2>
          <p>
            O PagDepix é transparente, sustentável e seguro. As regras visam evitar prejuízo e garantir clareza para usuários e afiliados.
          </p>
        </section>
      </div>

      <div className="mt-10 pt-6 border-t border-gray-700">
        <Link to="/config" className="text-bitcoin hover:underline">← Voltar</Link>
      </div>
    </div>
  );
}
