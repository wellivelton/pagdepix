import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export default function Privacidade() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao início
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-bitcoin to-orange-600 rounded-2xl flex items-center justify-center">
            <Shield className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Política de Privacidade</h1>
            <p className="text-gray-400 text-sm">Última atualização: Janeiro de 2026</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 space-y-8 text-gray-300">
          <section>
            <p className="mb-4">
              O <strong className="text-white">PagDepix</strong> (“nós”, “nosso” ou “Plataforma”) está comprometido com a proteção da privacidade e dos dados pessoais dos usuários. Esta Política de Privacidade descreve quais dados coletamos, como os utilizamos, armazenamos e protegemos, e quais são os seus direitos, em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018) e boas práticas de privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Responsável pelo tratamento</h2>
            <p>
              O responsável pelo tratamento dos dados pessoais é o PagDepix, operador da plataforma de pagamento de boletos com DEPIX na Liquid Network, disponível no domínio e canais oficiais do serviço (incluindo o bot @PagDepixBot no Telegram).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Dados que coletamos</h2>
            <p className="mb-2 font-medium text-white">Dados fornecidos por você:</p>
            <p className="mb-2">
              <strong>Cadastro:</strong> nome, e-mail, usuário do Telegram (@username) e senha (armazenada de forma criptografada). <strong>Perfil:</strong> alterações de nome e Telegram. <strong>Boletos:</strong> código de barras, valor, data de vencimento, URL do PDF, senha do PDF (quando informada), cupom utilizado e, após o pagamento, TXID da transação na Liquid Network. <strong>Comunicação:</strong> mensagens enviadas ao suporte (ex.: via Telegram).
            </p>
            <p className="mb-2 font-medium text-white mt-4">Dados coletados automaticamente:</p>
            <p className="mb-2">
              <strong>Uso da Plataforma:</strong> endereço IP, tipo de navegador, User-Agent, data e hora de acesso, ações realizadas (login, criação de boleto, registro de TXID). <strong>Segurança e antifraude:</strong> endereço IP, device fingerprint, tentativas de login (sucesso/falha), e, quando utilizamos serviços de terceiros, informações de geolocalização e indicadores de uso de VPN, para fins de limite diário, detecção de fraude e proteção da conta. <strong>Logs de auditoria:</strong> ações administrativas, aprovações/rejeições de boletos e alterações em usuários.
            </p>
            <p>
              <strong>Dados de afiliados:</strong> código de cupom, comissões, saldo, carteira Liquid para saque, histórico de transações e saques, quando você participa do programa de afiliados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Finalidades do tratamento</h2>
            <p className="mb-2">
              Utilizamos os dados para: <strong className="text-white">Prestar o serviço:</strong> cadastro, verificação de e-mail e Telegram, criação e gestão de boletos, exibição de valor em DEPIX e endereço de pagamento, registro de TXID e aprovação/rejeição de pagamentos. <strong className="text-white">Segurança e conformidade:</strong> autenticação, proteção contra fraude, brute force e abuso, limite diário para novos usuários, detecção de VPN quando aplicável, cumprimento de obrigações legais. <strong className="text-white">Comunicação:</strong> envio de e-mails de verificação de conta, recuperação de senha e mensagens pelo bot do Telegram (código de verificação e suporte). <strong className="text-white">Melhoria do serviço:</strong> análise agregada e anônima de uso, quando aplicável. <strong className="text-white">Programa de afiliados:</strong> gestão de cupons, comissões, saques e cumprimento das regras do programa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Base legal (LGPD)</h2>
            <p>
              O tratamento dos dados está fundamentado em: <strong className="text-white">execução de contrato</strong> (prestação do serviço), <strong className="text-white">legítimo interesse</strong> (segurança, antifraude, melhoria do serviço), <strong className="text-white">cumprimento de obrigação legal</strong> e, quando aplicável, <strong className="text-white">consentimento</strong> (ex.: envio de comunicações de marketing, se houver).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Compartilhamento de dados</h2>
            <p className="mb-2">
              Os dados podem ser compartilhados: <strong className="text-white">Com prestadores de serviço</strong> necessários à operação: hospedagem, banco de dados, envio de e-mail (ex.: SendGrid), detecção de VPN/geolocalização (quando utilizados), e plataforma do Telegram para o bot e webhook. Esses prestadores são contratados com obrigações de confidencialidade e segurança. <strong className="text-white">Com autoridades</strong>, quando exigido por lei ou ordem judicial. <strong className="text-white">Com terceiros em operações societárias</strong> (fusão, aquisição), desde que os dados continuem protegidos conforme esta Política.
            </p>
            <p>
              Não vendemos dados pessoais. Não compartilhamos dados com terceiros para fins de marketing sem seu consentimento explícito.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Retenção e armazenamento</h2>
            <p>
              Mantemos os dados pelo tempo necessário para: (a) prestar o serviço e cumprir obrigações legais; (b) resolver disputas e exercer defesa; (c) atender a pedidos de autoridade. Logs de auditoria e segurança podem ser mantidos por período maior conforme política interna e lei. Dados são armazenados em ambiente controlado, com acesso restrito e medidas técnicas e organizacionais para proteger contra acesso não autorizado, perda ou alteração indevida.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Seus direitos (LGPD)</h2>
            <p className="mb-2">
              Você tem direito a: <strong className="text-white">Confirmar</strong> a existência de tratamento dos seus dados. <strong className="text-white">Acessar</strong> os seus dados. <strong className="text-white">Corrigir</strong> dados incompletos, desatualizados ou incorretos. <strong className="text-white">Anonimizar, bloquear ou eliminar</strong> dados desnecessários, excessivos ou tratados em desconformidade com a lei. <strong className="text-white">Portabilidade</strong> dos dados a outro fornecedor de serviço, quando aplicável. <strong className="text-white">Revogar o consentimento</strong>, quando o tratamento tiver sido baseado em consentimento. <strong className="text-white">Informar-se</strong> sobre com quem compartilhamos dados e sobre a possibilidade de não consentir e as consequências.
            </p>
            <p>
              Para exercer esses direitos, entre em contato conosco pelo Telegram @PagDepixBot ou pelo canal de suporte indicado na Plataforma, identificando-se e descrevendo o pedido. Responderemos em prazo razoável, nos termos da LGPD.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Cookies e tecnologias similares</h2>
            <p>
              A Plataforma pode utilizar cookies e tecnologias similares para: funcionamento da sessão (ex.: manter você logado), segurança (ex.: proteção contra CSRF) e análise de uso (quando aplicável). Você pode configurar o navegador para recusar ou limitar cookies; parte das funcionalidades pode deixar de funcionar corretamente.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Menores</h2>
            <p>
              O serviço não é destinado a menores de 18 anos. Não coletamos intencionalmente dados de menores. Se tomarmos conhecimento de que dados de menor foram fornecidos, tomaremos medidas para excluí-los.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Alterações nesta Política</h2>
            <p>
              Podemos alterar esta Política de Privacidade a qualquer momento. A versão atualizada será publicada nesta página, com nova “Última atualização”. O uso continuado da Plataforma após a publicação constitui aceitação das alterações, salvo quando a lei exigir consentimento explícito para alterações que ampliem o uso dos dados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Contato</h2>
            <p>
              Para dúvidas sobre privacidade ou para exercer seus direitos, entre em contato pelo Telegram @PagDepixBot ou pelo canal de suporte indicado na Plataforma.
            </p>
          </section>
        </div>

        <p className="text-center text-gray-500 text-sm mt-8">
          PagDepix – Pagamento de boletos com DEPIX na Liquid Network.
        </p>
      </div>
    </div>
  );
}
