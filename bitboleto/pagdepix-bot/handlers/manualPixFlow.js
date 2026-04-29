/**
 * Fluxo de saque manual de Pix (Depix→Pix) com atendente humano.
 * O usuário preenche os dados e o admin recebe a notificação para processar manualmente.
 */
const { Markup } = require("telegraf");

const PIX_KEY_OPTIONS = [
  { id: "cpf", label: "CPF" },
  { id: "cnpj", label: "CNPJ" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Telefone" },
  { id: "random", label: "Chave aleatória" },
];

const TAXA_PERCENT = 1;
const MIN_VALOR = 100;
const MAX_VALOR = 6000;

/** Estado do fluxo por userId */
const flowState = new Map();

function getFlow(userId) {
  return flowState.get(userId);
}

function setFlow(userId, data) {
  if (data === null) {
    flowState.delete(userId);
  } else {
    flowState.set(userId, { ...data, updatedAt: Date.now() });
  }
}

function clearFlow(userId) {
  flowState.delete(userId);
}

/** Inicia o fluxo de envio manual */
function startFlow(ctx, state) {
  const userId = ctx.from.id;
  setFlow(userId, { step: 1 });
  ctx.reply(
    "💸 *Envio de Pix com atendente humano*\n\n" +
      "Qual valor em *reais (R$)* você deseja enviar?\n\n" +
      `_Mínimo: R$ ${MIN_VALOR.toFixed(2)} | Máximo: R$ ${MAX_VALOR.toFixed(2)}_`,
    { parse_mode: "Markdown" }
  );
}

/** Processa mensagem do usuário quando está no fluxo */
async function handleFlowMessage(ctx, text, state) {
  const userId = ctx.from.id;
  const flow = getFlow(userId);
  if (!flow) return false;

  const config = state.config;
  const nome = ctx.from.first_name || "Usuário";
  const username = ctx.from.username ? `@${ctx.from.username}` : "";

  // Cancelar com /cancelar ou "cancelar"
  if (/^\/?(cancelar|cancel)$/i.test(text)) {
    clearFlow(userId);
    ctx.reply("Operação cancelada. Voltando ao menu.", getMenuKeyboard(state));
    return true;
  }

  switch (flow.step) {
    case 1: {
      // Esperando valor em R$
      const valorStr = text.replace(/[^\d,.]/g, "").replace(",", ".");
      const valor = parseFloat(valorStr);
      if (isNaN(valor) || valor < MIN_VALOR || valor > MAX_VALOR) {
        await ctx.reply(
          `❌ Valor inválido. Informe um valor entre R$ ${MIN_VALOR.toFixed(2)} e R$ ${MAX_VALOR.toFixed(2)}.`
        );
        return true;
      }
      const taxa = valor * (TAXA_PERCENT / 100);
      const totalBrl = valor + taxa;
      setFlow(userId, { ...flow, step: 2, amountBrl: valor, taxaBrl: taxa, totalBrl });

      await ctx.reply(
        `📊 *Resumo:*\n\n` +
          `Valor solicitado: R$ ${valor.toFixed(2)}\n` +
          `Taxa ${TAXA_PERCENT}%: R$ ${taxa.toFixed(2)}\n` +
          `Total: R$ ${totalBrl.toFixed(2)}\n\n` +
          `O valor exato em DePix será informado pelo atendente ao confirmar sua solicitação.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Continuar com o envio", "mpix_continue")],
            [Markup.button.callback("❌ Cancelar", "mpix_cancel")],
          ]),
        }
      );
      return true;
    }

    case 2:
      // Aguardando callback (Continuar/Cancelar)
      return true;

    case 3:
      // Aguardando callback (tipo de chave) - se enviou texto, pedir para clicar
      await ctx.reply("Clique em uma das opções acima para escolher o tipo de chave PIX.");
      return true;

    case 4: {
      // Esperando chave PIX (após escolher tipo)
      const pixKey = text.trim();
      if (pixKey.length < 5) {
        await ctx.reply("❌ Chave PIX muito curta. Envie a chave completa.");
        return true;
      }
      setFlow(userId, { ...flow, step: 5, pixKey });

      await ctx.reply(
        "👤 *Qual o nome do destinatário do Pix?*\n\n" +
          "_Pessoa física: nome e sobrenome\nEmpresa: nome da empresa_",
        { parse_mode: "Markdown" }
      );
      return true;
    }

    case 5: {
      // Esperando nome do destinatário
      const recipientName = text.trim();
      if (recipientName.length < 3) {
        await ctx.reply("❌ Nome muito curto. Informe o nome completo do destinatário.");
        return true;
      }
      setFlow(userId, { ...flow, step: 6, recipientName });

      const resumo =
        `📋 *Confirme os dados:*\n\n` +
        `💰 Valor solicitado: R$ ${flow.amountBrl.toFixed(2)}\n` +
        `💵 Total com taxa: R$ ${flow.totalBrl.toFixed(2)} (DePix a informar pelo atendente)\n` +
        `🔑 Tipo de chave: ${PIX_KEY_OPTIONS.find((o) => o.id === flow.pixKeyType)?.label || flow.pixKeyType}\n` +
        `📱 Chave PIX: ${flow.pixKey}\n` +
        `👤 Destinatário: ${recipientName}`;

      await ctx.reply(resumo, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Confirmar envio", "mpix_confirm")],
          [Markup.button.callback("❌ Cancelar", "mpix_cancel")],
        ]),
      });
      return true;
    }

    case 6:
      // Aguardando callback (Confirmar/Cancelar)
      return true;

    default:
      clearFlow(userId);
      return true;
  }
}

/** Processa callbacks do fluxo (Continuar, Cancelar, Confirmar, tipo de chave) */
async function handleFlowCallback(ctx, data, state) {
  const userId = ctx.from.id;
  const flow = getFlow(userId);
  if (!flow) return false;

  const config = state.config;
  const nome = ctx.from.first_name || "Usuário";
  const username = ctx.from.username ? `@${ctx.from.username}` : "";

  if (data === "mpix_cancel") {
    await ctx.answerCbQuery();
    clearFlow(userId);
    await ctx.reply("Operação cancelada. Voltando ao menu.", getMenuKeyboard(state));
    return true;
  }

  if (data === "mpix_continue" && flow.step === 2) {
    await ctx.answerCbQuery();
    setFlow(userId, { ...flow, step: 3 });

    const buttons = PIX_KEY_OPTIONS.map((o) => [Markup.button.callback(o.label, `mpix_type_${o.id}`)]);
    await ctx.reply("🔑 *Qual tipo de chave Pix você deseja usar?*", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
    return true;
  }

  if (data.startsWith("mpix_type_") && flow.step === 3) {
    const pixKeyType = data.replace("mpix_type_", "");
    await ctx.answerCbQuery();
    setFlow(userId, { ...flow, step: 4, pixKeyType });
    await ctx.reply(
      `📱 Envie a chave PIX (${PIX_KEY_OPTIONS.find((o) => o.id === pixKeyType)?.label}):`
    );
    return true;
  }

  if (data === "mpix_confirm" && flow.step === 6) {
    await ctx.answerCbQuery();
    clearFlow(userId);

    // Cria ticket para o atendente poder responder ao usuário
    const { ticketsAbertos, persistTickets } = state;
    ticketsAbertos.set(userId, {
      nome,
      username: ctx.from.username || null,
      dataCriacao: Date.now(),
      dataUltimaMsg: Date.now(),
      mensagens: 0,
      tipo: "pix_manual",
    });
    persistTickets();

    const msgAdmin =
      `💸 *ENVIO MANUAL DE PIX - SOLICITAÇÃO*\n\n` +
      `O cliente solicitou um envio manual de Pix.\n` +
      `Seguem os dados fornecidos para atendimento.\n\n` +
      `🆔 ${userId}\n` +
      `👤 *Nome:* ${nome} ${username}\n\n` +
      `💰 *Valor solicitado:* R$ ${flow.amountBrl.toFixed(2)}\n` +
      `💵 *Total com taxa 1%:* R$ ${flow.totalBrl.toFixed(2)}\n` +
      `🔑 *Tipo de chave:* ${PIX_KEY_OPTIONS.find((o) => o.id === flow.pixKeyType)?.label || flow.pixKeyType}\n` +
      `📱 *Chave PIX:* \`${flow.pixKey}\`\n` +
      `👤 *Nome destinatário:* ${flow.recipientName}\n\n` +
      `_Responda esta mensagem para falar com o cliente, ou use /responder ${userId} <mensagem>_`;

    try {
      await ctx.telegram.sendMessage(config.SUPPORT_GROUP_ID, msgAdmin, {
        parse_mode: "Markdown",
      });
    } catch (e) {
      console.error("[manualPixFlow] Erro ao notificar admin:", e.message);
    }

    await ctx.reply(
      "✅ *Sua solicitação foi encaminhada para um atendente humano.*\n\n" +
        "Aguarde enquanto verificamos e realizamos o envio.\n\n" +
        "Depois que o Pix for realizado, você receberá o comprovante da transação.",
      { parse_mode: "Markdown", ...getMenuKeyboard(state) }
    );
    return true;
  }

  return false;
}

function getMenuKeyboard(state) {
  const { getMenuKeyboard: getKb } = require("./cliente");
  return getKb();
}

module.exports = {
  flowState,
  getFlow,
  setFlow,
  clearFlow,
  startFlow,
  handleFlowMessage,
  handleFlowCallback,
  isManualPixButton,
};

function isManualPixButton(text) {
  const t = (text || "").trim();
  return (
    t === "💸 Envio Pix com atendente" ||
    t === "💸 Realizar envio de Pix com atendente humano" ||
    t.toLowerCase().includes("envio pix com atendente")
  );
}
