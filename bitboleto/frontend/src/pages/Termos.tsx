import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';

export default function Termos() {
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
            <FileText className="w-7 h-7 text-black" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Termos de Uso</h1>
            <p className="text-gray-400 text-sm">Última atualização: Janeiro de 2026</p>
          </div>
        </div>

        <div className="bg-gray-800/50 backdrop-blur-xl rounded-2xl p-8 border border-gray-700/50 space-y-8 text-gray-300">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Objeto e descrição do serviço</h2>
            <p className="mb-2">
              Ao acessar ou utilizar o site e os serviços do <strong className="text-white">PagDepix</strong> (“Plataforma”), você declara ter lido, compreendido e aceito integralmente estes Termos de Uso. Caso não concorde, não utilize a Plataforma.
            </p>
            <p className="mb-2">
              O PagDepix é uma plataforma web que permite aos usuários <strong className="text-white">pagar boletos bancários</strong> utilizando ativos digitais (DEPIX) na <strong className="text-white">Liquid Network</strong>, mediante conversão do valor em reais para o equivalente em DEPIX e envio ao endereço indicado pela Plataforma.
            </p>
            <p className="mb-2">
              O serviço inclui: cadastro e verificação de usuários (e-mail e Telegram); criação e gestão de ordens de pagamento de boleto; exibição de valor em DEPIX, endereço da carteira e orientações para pagamento; registro de comprovante de transação (TXID) pelo usuário; análise e aprovação/rejeição de pagamentos pela equipe do PagDepix; programa de afiliados com cupons e comissões, quando aplicável.
            </p>
            <p>
              O PagDepix <strong className="text-white">não é</strong> uma instituição financeira, não emite boletos e não garante a liquidação do boleto junto ao beneficiário; a liquidação depende da confirmação do pagamento e do processamento interno da Plataforma e de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Cadastro e verificação</h2>
            <p className="mb-2">
              Para utilizar o serviço, o usuário deve se cadastrar fornecendo dados verdadeiros (nome, e-mail, usuário Telegram e senha) e aceitar estes Termos e a Política de Privacidade.
            </p>
            <p className="mb-2">
              O usuário deve <strong className="text-white">confirmar o e-mail</strong> e <strong className="text-white">verificar a conta no Telegram</strong> (@PagDepixBot) conforme instruções da Plataforma. O acesso pleno ao pagamento de boletos pode estar condicionado à conclusão dessas verificações e ao cumprimento de limites e políticas internas.
            </p>
            <p>
              O usuário é responsável por manter o sigilo da senha e por todas as atividades realizadas em sua conta. Deve informar imediatamente o PagDepix em caso de uso não autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. Uso da Plataforma e obrigações do usuário</h2>
            <p className="mb-2">
              O usuário obriga-se a: fornecer informações corretas e atualizadas; utilizar o serviço apenas para pagamento de boletos válidos e em conformidade com a lei; enviar o valor exato em DEPIX indicado pela Plataforma no endereço e rede corretos (Liquid Network); não utilizar a Plataforma para fins ilícitos, fraudulentos ou que violem direitos de terceiros.
            </p>
            <p className="mb-2">
              É vedado ao usuário: criar múltiplas contas para burlar limites ou regras; usar VPN ou meios para ocultar identidade ou localização quando isso violar as políticas do PagDepix; reutilizar o mesmo TXID em mais de um boleto; praticar lavagem de dinheiro, fraude ou qualquer conduta ilegal.
            </p>
            <p>
              O PagDepix pode recusar, limitar ou encerrar o acesso ao serviço, sem aviso prévio, em caso de violação destes Termos, suspeita de fraude ou por razões operacionais ou legais.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Taxas, valores e pagamento</h2>
            <p className="mb-2">
              O valor do boleto em reais é convertido em DEPIX conforme regras e taxas da Plataforma (incluindo taxa de serviço). O valor final em DEPIX e o endereço de destino são exibidos antes da confirmação. O usuário é responsável por enviar <strong className="text-white">exatamente</strong> o valor indicado na <strong className="text-white">Liquid Network</strong>; valores incorretos podem atrasar ou impedir a aprovação.
            </p>
            <p>
              Taxas e regras de conversão podem ser alteradas. Alterações relevantes serão comunicadas quando aplicável, mas o uso continuado da Plataforma após a divulgação pode ser considerado aceitação.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Programa de afiliados</h2>
            <p className="mb-2">
              Usuários que forem habilitados como afiliados poderão criar cupons e receber comissão sobre boletos pagos com seu cupom, conforme regras internas do PagDepix. O afiliado não pode utilizar o próprio cupom em suas transações. Comissões podem ficar pendentes até a confirmação do pagamento do boleto. Saques estão sujeitos a valor mínimo, aprovação e políticas de segurança.
            </p>
            <p>
              O PagDepix reserva-se o direito de alterar ou encerrar o programa de afiliados e de desconsiderar comissões em caso de fraude ou violação das regras.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Suporte e comunicação</h2>
            <p className="mb-2">
              O suporte ao usuário é realizado prioritariamente pelo Telegram (@PagDepixBot). O usuário pode utilizar esse canal para dúvidas, problemas técnicos e envio do código de verificação de conta, quando aplicável.
            </p>
            <p>
              Comunicações oficiais do PagDepix podem ser enviadas por e-mail ou pela Plataforma. É responsabilidade do usuário manter e-mail e Telegram acessíveis.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Propriedade intelectual e marca</h2>
            <p>
              O nome “PagDepix”, o site, o software, textos, layouts e demais elementos da Plataforma são de propriedade do PagDepix ou de seus licenciadores. É proibida a cópia, reprodução ou uso não autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Limitação de responsabilidade</h2>
            <p className="mb-2">
              O PagDepix não se responsabiliza por: atrasos ou falhas na rede blockchain (Liquid Network) ou em serviços de terceiros; erros do usuário ao informar valor, endereço ou TXID; perda de ativos por envio a endereço errado ou rede incorreta; atos de terceiros ou caso fortuito e força maior.
            </p>
            <p>
              Na máxima extensão permitida pela lei, a responsabilidade do PagDepix em relação ao uso da Plataforma limita-se ao valor da taxa cobrada na transação em questão, salvo dolo ou má-fé comprovados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Privacidade e dados</h2>
            <p>
              O tratamento de dados pessoais é regido pela <Link to="/privacidade" className="text-bitcoin hover:underline">Política de Privacidade</Link> do PagDepix, que integra estes Termos. Ao aceitar estes Termos, o usuário também aceita a coleta e o uso de dados conforme descrito na Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Alterações e vigência</h2>
            <p className="mb-2">
              O PagDepix pode alterar estes Termos a qualquer momento. A versão atualizada será publicada nesta página, com nova “Última atualização”. O uso continuado da Plataforma após a publicação constitui aceitação das alterações, salvo quando a lei exigir consentimento explícito.
            </p>
            <p>
              Estes Termos vigoram a partir da data de publicação. Disputas serão regidas pelas leis da República Federativa do Brasil, com foro na comarca do domicílio do PagDepix, salvo disposição legal em contrário.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Contato</h2>
            <p>
              Para dúvidas sobre estes Termos, entre em contato pelo Telegram @PagDepixBot ou pelo canal de suporte indicado na Plataforma.
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
