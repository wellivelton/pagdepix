/**
 * Handlers para comandos e mensagens do cliente (chat privado)
 */
const { Markup } = require("telegraf");
const { FAQ, getFaqById, findFaqByKeyword } = require("../faq");

function getMenuKeyboard() {
  return Markup.keyboard([
    ["💰 Receber pagamento", "💬 Falar com atendente"],
    ["❓ Ver FAQ", "📊 Meu status"],
    ["🕐 Horário", "💸 Envio Pix com atendente"],
  ])
    .resize()
    .persistent();
}

function registerClienteHandlers(bot, state) {
  const {
    ticketsAbertos,
    persistTickets,
    fecharTicket,
    salvarConversa,
    estaDentroDoHorario,
    config,
  } = state;

  // START - Menu principal (cancela fluxo de envio manual se houver)
  bot.start((ctx) => {
    const paymentFlow  = require("./paymentFlow");
    const manualPixFlow = require("./manualPixFlow");
    paymentFlow.clearFlow(ctx.from.id);
    manualPixFlow.clearFlow(ctx.from.id);
    ctx.reply(
      "👋 Bem-vindo ao *PagDepix*\n\n" +
        "Este é o canal oficial de suporte.\n\n" +
        "Escolha uma opção abaixo ou envie sua mensagem para falar com um atendente humano 🔐",
      {
        parse_mode: "Markdown",
        ...getMenuKeyboard(),
      }
    );
  });

  // AJUDA / COMANDOS
  const comandosTexto =
    "📋 *Comandos disponíveis:*\n\n" +
    "/start - Menu principal\n" +
    "/suporte - Falar com atendente\n" +
    "/faq - Perguntas frequentes\n" +
    "/meustatus - Status do seu atendimento\n" +
    "/fechar - Encerrar seu atendimento\n" +
    "/horario - Horário de atendimento\n" +
    "/cancelar - Cancelar operação em andamento";

  bot.command("ajuda", (ctx) => {
    ctx.reply(comandosTexto, { parse_mode: "Markdown" });
  });
  bot.command("comandos", (ctx) => ctx.reply(comandosTexto, { parse_mode: "Markdown" }));

  bot.command("cancelar", (ctx) => {
    if (ctx.chat.type !== "private") return;
    const paymentFlow  = require("./paymentFlow");
    const manualPixFlow = require("./manualPixFlow");
    if (paymentFlow.getFlow(ctx.from.id)) {
      paymentFlow.clearFlow(ctx.from.id);
      ctx.reply("Operação cancelada.", getMenuKeyboard());
    } else if (manualPixFlow.getFlow(ctx.from.id)) {
      manualPixFlow.clearFlow(ctx.from.id);
      ctx.reply("Operação cancelada.", getMenuKeyboard());
    } else {
      ctx.reply("Não há nenhuma operação em andamento para cancelar.");
    }
  });

  // FAQ
  bot.command("faq", (ctx) => {
    const buttons = FAQ.map((f) => [Markup.button.callback(f.pergunta, `faq_${f.id}`)]);
    ctx.reply("❓ *Perguntas Frequentes:*\n\nEscolha uma pergunta:", {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard(buttons),
    });
  });

  bot.action(/^faq_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    if (id === "ok" || id === "nao") return;
    const faq = getFaqById(id);
    if (faq) {
      await ctx.answerCbQuery();
      await ctx.reply(`*${faq.pergunta}*\n\n${faq.resposta}`, {
        parse_mode: "Markdown",
      });
    }
  });

  bot.action("faq_ok", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Ótimo! Qualquer outra dúvida, estamos à disposição.");
  });

  bot.action("faq_nao", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("Envie sua mensagem que um atendente irá responder.");
  });

  // Fluxo de envio manual de Pix
  const manualPixFlow = require("./manualPixFlow");
  bot.action(/^mpix_/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const handled = await manualPixFlow.handleFlowCallback(ctx, data, state);
    if (!handled) await ctx.answerCbQuery();
  });

  // MEUSTATUS
  bot.command("meustatus", (ctx) => {
    if (ctx.chat.type !== "private") return;
    const userId = ctx.from.id;
    const ticket = ticketsAbertos.get(userId);
    if (ticket) {
      const mins = Math.floor((Date.now() - ticket.dataUltimaMsg) / (1000 * 60));
      ctx.reply(
        `📊 Você tem um atendimento em andamento.\n` +
          `Aguardando resposta há aproximadamente ${mins} minuto(s).\n\n` +
          `Um atendente responderá em breve.`,
        { parse_mode: "Markdown" }
      );
    } else {
      ctx.reply(
        "📊 Nenhum atendimento aberto no momento.\n\n" +
          "Envie uma mensagem para iniciar um atendimento.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // FECHAR (cliente - encerrar próprio ticket)
  bot.command("fechar", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const userId = ctx.from.id;
    const ticket = ticketsAbertos.get(userId);
    if (ticket) {
      fecharTicket(userId);
      try {
        await ctx.telegram.sendMessage(
          config.SUPPORT_GROUP_ID,
          `🔒 O cliente ${userId} (${ticket.nome}) encerrou o atendimento.`,
          { parse_mode: "Markdown" }
        );
      } catch (e) {}
      await ctx.reply("✅ Seu atendimento foi encerrado. Obrigado! 🙏");
    } else {
      await ctx.reply("Você não tem nenhum atendimento aberto.");
    }
  });

  // HORARIO
  bot.command("horario", (ctx) => {
    ctx.reply(
      "🕐 *Horário de atendimento:*\n\n" +
        "Segunda a Sexta: 9h às 17h (UTC-3)\n" +
        "Sábados, Domingos e Feriados: Fechado",
      { parse_mode: "Markdown" }
    );
  });

  // SUPORTE - força criar ticket
  bot.command("suporte", (ctx) => {
    if (ctx.chat.type !== "private") return;
    const userId = ctx.from.id;
    if (ticketsAbertos.has(userId)) {
      ctx.reply("Você já tem um atendimento em andamento. Envie sua mensagem para continuar.");
    } else {
      ctx.reply(
        "Envie sua mensagem para iniciar um atendimento. Um atendente humano responderá em breve.",
        getMenuKeyboard()
      );
    }
  });

  // PHOTO
  bot.on("photo", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const caption = ctx.message.caption || "";
    const photo = ctx.message.photo.pop();
    await handleClienteMidia(ctx, "Foto", photo.file_id, caption, async (text) => {
      await ctx.telegram.sendPhoto(state.config.SUPPORT_GROUP_ID, photo.file_id, {
        caption: text,
        parse_mode: "Markdown",
      });
    }, state);
  });

  // DOCUMENT
  bot.on("document", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    const caption = ctx.message.caption || "";
    const fileId = ctx.message.document.file_id;
    await handleClienteMidia(ctx, "Documento", fileId, caption, async (text) => {
      await ctx.telegram.sendDocument(state.config.SUPPORT_GROUP_ID, fileId, {
        caption: text,
        parse_mode: "Markdown",
      });
    }, state);
  });
}

async function handleClienteMensagem(ctx, text, tipoMidia = null, state) {
  const {
    ticketsAbertos,
    persistTickets,
    salvarConversa,
    estaDentroDoHorario,
    config,
  } = state;

  const user = ctx.from;
  const userId = user.id;
  const username = user.username ? user.username : null;
  const nome = user.first_name || "Usuário";

  // Fluxo de pagamento DePix - prioridade máxima
  const paymentFlow = require("./paymentFlow");
  if (paymentFlow.getFlow(userId)) {
    const handled = await paymentFlow.handleFlowMessage(ctx, text, state);
    if (handled) return;
  }

  // Botão Receber pagamento
  if (paymentFlow.isPaymentButton(text)) {
    await paymentFlow.startPaymentFlow(ctx);
    return;
  }

  // Fluxo de envio manual de Pix
  const manualPixFlow = require("./manualPixFlow");
  if (manualPixFlow.getFlow(userId)) {
    const handled = await manualPixFlow.handleFlowMessage(ctx, text, state);
    if (handled) return;
  }

  // Botão Envio Pix com atendente
  if (manualPixFlow.isManualPixButton(text)) {
    manualPixFlow.startFlow(ctx, state);
    return;
  }

  // Botões do menu - tratar como ações
  if (text === "💬 Falar com atendente") {
    if (ticketsAbertos.has(userId)) {
      return ctx.reply("Você já tem um atendimento aberto. Envie sua mensagem para continuar.");
    }
    return ctx.reply("Envie sua mensagem para iniciar um atendimento.");
  }
  if (text === "📊 Meu status") {
    const ticket = ticketsAbertos.get(userId);
    if (ticket) {
      const mins = Math.floor((Date.now() - ticket.dataUltimaMsg) / (1000 * 60));
      return ctx.reply(`Você tem atendimento em andamento. Aguardando há ~${mins} min.`);
    }
    return ctx.reply("Nenhum atendimento aberto.");
  }
  if (text === "🕐 Horário") {
    return ctx.reply(
      "🕐 Segunda a Sexta: 9h às 17h (UTC-3)\nSábados e Domingos: Fechado"
    );
  }
  if (text === "❓ Ver FAQ") {
    const buttons = FAQ.map((f) => [Markup.button.callback(f.pergunta, `faq_${f.id}`)]);
    return ctx.reply("❓ Escolha uma pergunta:", Markup.inlineKeyboard(buttons));
  }

  // Sugestão FAQ por palavra-chave (apenas se ainda não tem ticket)
  if (!ticketsAbertos.has(userId) && text && text.length > 3) {
    const faq = findFaqByKeyword(text);
    if (faq) {
      await ctx.reply(`*${faq.pergunta}*\n\n${faq.resposta}`, { parse_mode: "Markdown" });
      return ctx.reply(
        "Isso respondeu sua dúvida?",
        Markup.inlineKeyboard([
          [Markup.button.callback("Sim", "faq_ok")],
          [Markup.button.callback("Não, quero falar com atendente", "faq_nao")],
        ])
      );
    }
  }

  const msgParaGrupo = tipoMidia
    ? `[${tipoMidia}] Cliente ${userId}\n\n${text || "(sem texto)"}`
    : text || "[mensagem não textual]";

  const foraHorario = !estaDentroDoHorario();
  const avisoForaHorario = foraHorario
    ? "\n\n⚠️ _Recebemos sua mensagem. Nosso horário é Seg-Sex 9h-17h. Responderemos no próximo dia útil._"
    : "";

  if (!ticketsAbertos.has(userId)) {
    ticketsAbertos.set(userId, {
      nome,
      username,
      dataCriacao: Date.now(),
      dataUltimaMsg: Date.now(),
      mensagens: 1,
    });
    persistTickets();

    const usernameStr = username ? ` @${username}` : "";
    await ctx.telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📩 *=== NOVO ATENDIMENTO ===*\n\n` +
        `👤 ${nome}${usernameStr}\n` +
        `🆔 ${userId}\n\n` +
        `💬 ${msgParaGrupo}`,
      { parse_mode: "Markdown" }
    );

    await ctx.reply(
      "✅ Mensagem recebida! Um atendente humano vai responder por aqui." + avisoForaHorario,
      { parse_mode: "Markdown" }
    );
    salvarConversa(userId, nome, msgParaGrupo, "cliente");
  } else {
    const ticket = ticketsAbertos.get(userId);
    ticket.dataUltimaMsg = Date.now();
    ticket.mensagens = (ticket.mensagens || 0) + 1;
    if (username) ticket.username = username;
    persistTickets();

    await ctx.telegram.sendMessage(
      config.SUPPORT_GROUP_ID,
      `📩 *=== MENSAGEM DO CLIENTE ${userId} ===*\n\n💬 ${msgParaGrupo}`,
      { parse_mode: "Markdown" }
    );

    await ctx.reply("✅ Mensagem recebida!" + avisoForaHorario, {
      parse_mode: "Markdown",
    });
    salvarConversa(userId, nome, msgParaGrupo, "cliente");
  }
}

async function handleClienteMidia(ctx, tipoMidia, fileId, caption, sendToGroup, state) {
  const {
    ticketsAbertos,
    persistTickets,
    salvarConversa,
    estaDentroDoHorario,
  } = state;

  const user = ctx.from;
  const userId = user.id;
  const username = user.username || null;
  const nome = user.first_name || "Usuário";
  const foraHorario = !estaDentroDoHorario();
  const avisoForaHorario = foraHorario
    ? "\n\n⚠️ _Recebemos sua mídia. Nosso horário é Seg-Sex 9h-17h. Responderemos no próximo dia útil._"
    : "";

  const usernameStr = username ? ` @${username}` : "";
  const captionGroup = caption ? `\n\n💬 Legenda: ${caption}` : "";

  if (!ticketsAbertos.has(userId)) {
    ticketsAbertos.set(userId, {
      nome,
      username,
      dataCriacao: Date.now(),
      dataUltimaMsg: Date.now(),
      mensagens: 1,
    });
    persistTickets();
    await sendToGroup(
      `📩 *=== NOVO ATENDIMENTO ===*\n\n👤 ${nome}${usernameStr}\n🆔 ${userId}\n\n📎 ${tipoMidia}${captionGroup}`
    );
    await ctx.reply(
      "✅ Recebido! Um atendente vai responder em breve." + avisoForaHorario,
      { parse_mode: "Markdown" }
    );
  } else {
    const ticket = ticketsAbertos.get(userId);
    ticket.dataUltimaMsg = Date.now();
    ticket.mensagens = (ticket.mensagens || 0) + 1;
    if (username) ticket.username = username;
    persistTickets();
    await sendToGroup(
      `📩 *=== MENSAGEM DO CLIENTE ${userId} ===*\n\n📎 ${tipoMidia}${captionGroup}`
    );
    await ctx.reply("✅ Recebido!" + avisoForaHorario, { parse_mode: "Markdown" });
  }
  salvarConversa(userId, nome, `[${tipoMidia}] ${caption || "(sem legenda)"}`, "cliente");
}

module.exports = {
  registerClienteHandlers,
  handleClienteMensagem,
  handleClienteMidia,
  getMenuKeyboard,
};
