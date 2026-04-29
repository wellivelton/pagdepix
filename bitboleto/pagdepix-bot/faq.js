/**
 * Perguntas Frequentes - textos baseados no Support.tsx do frontend
 */
const FAQ = [
  {
    id: "boleto",
    pergunta: "Como pagar um boleto?",
    resposta:
      "Vá em *Pagar Boleto*, preencha os dados, gere o QR Code e envie o valor exato em Depix para o endereço fornecido. Depois adicione o TXID no histórico.",
  },
  {
    id: "aprovar",
    pergunta: "Quanto tempo demora para aprovar?",
    resposta:
      "Em dias úteis das 9h às 17h, a aprovação é feita em até 1 hora após você enviar o TXID. Após 17h ou em finais de semana, fica para o próximo dia útil.",
  },
  {
    id: "txid",
    pergunta: "Esqueci de adicionar o TXID, e agora?",
    resposta:
      'Vá em *Histórico*, encontre o boleto pendente e clique em *Editar*. Lá você pode adicionar o TXID mesmo depois de sair do sistema.',
  },
  {
    id: "valor_errado",
    pergunta: "Enviei o valor errado, o que fazer?",
    resposta:
      "Entre em contato conosco pelo chat ou pelo Telegram imediatamente informando o TXID da transação. Nossa equipe verificará e ajudará a resolver.",
  },
  {
    id: "comprovante",
    pergunta: "Como recebo o comprovante?",
    resposta:
      "Após a aprovação do pagamento pelo admin, o comprovante ficará disponível para download no histórico do boleto.",
  },
];

// Palavras-chave para sugerir FAQ antes de criar ticket
const KEYWORDS_FAQ = {
  txid: "txid",
  "tx id": "txid",
  comprovante: "comprovante",
  "valor errado": "valor_errado",
  "valor incorreto": "valor_errado",
  demora: "aprovar",
  aprovar: "aprovar",
  aprovação: "aprovar",
  "quanto tempo": "aprovar",
  boleto: "boleto",
  pagar: "boleto",
};

function getFaqById(id) {
  return FAQ.find((f) => f.id === id);
}

function findFaqByKeyword(text) {
  const lower = (text || "").toLowerCase().trim();
  for (const [keyword, id] of Object.entries(KEYWORDS_FAQ)) {
    if (lower.includes(keyword)) {
      return getFaqById(id);
    }
  }
  return null;
}

module.exports = { FAQ, KEYWORDS_FAQ, getFaqById, findFaqByKeyword };
