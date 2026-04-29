require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

const userId = 5034590980; // ID do cliente
const mensagem = `Boa tarde! 😊

Desculpe a demora. Aqui está seu cupom de indicação: TEXUGO.

Você receberá 20% de comissão sobre as taxas de cada indicado.

Seus indicados receberão 20% de desconto sobre as taxas.

Limites de transação:

Valor mínimo: R$ 20,00
Valor máximo: R$ 1.000,00

Tudo sem KYC (identificação).

Para garantir sustentabilidade da operação, estabelecemos taxas diferenciadas para valores baixos, pois novas transações menores podem ser inviáveis devido aos custos da plataforma. Isso também permite que novos usuários testem o sistema com segurança.

Nossas taxas atuais:

Faixa de Valor | Percentual | Taxa Fixa | Exemplo
De R$ 20,00 até R$ 49,99 | 4% | R$ 1,99 | R$ 30,00 → R$ 33,19
De R$ 50,00 até R$ 99,99 | 3% | R$ 1,99 | R$ 100,00 → R$ 104,99
De R$ 100,00 até R$ 499,99 | 2,5% | R$ 1,99 | R$ 150,00 → R$ 155,74
Acima de R$ 500,00 | 2% | R$ 0,99 | R$ 500,00 → R$ 510,99

Saques para afiliados:

O saque mínimo é de R$ 20,00 de comissão.
Para solicitar, acesse seu painel em Meus Ganhos > Solicitar Saque e informe o endereço da sua carteira LiquidNetwork.

Qualquer dúvida, entre em contato conosco!`;

bot.telegram.sendMessage(userId, mensagem)
  .then(() => {
    console.log("✅ Mensagem enviada com sucesso!");
    process.exit(0);
  })
  .catch(err => {
    console.error("❌ Erro ao enviar mensagem:", err.message);
    process.exit(1);
  });
