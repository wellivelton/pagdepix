/**
 * Handlers para comandos do grupo de suporte (atendentes)
 */
function isStaff(ctx, config) {
  return ctx.chat.id.toString() === config.SUPPORT_GROUP_ID;
}

function formatarListaTickets(ticketsAbertos) {
  if (ticketsAbertos.size === 0) return "Nenhum ticket aberto no momento ✅";
  let lista = "📋 *Tickets abertos:*\n\n";
  let i = 1;
  ticketsAbertos.forEach((ticket, userId) => {
    const tempoAberto = ((Date.now() - ticket.dataCriacao) / (1000 * 60)).toFixed(0);
    const username = ticket.username ? ` @${ticket.username}` : "";
    lista += `${i}. ${ticket.nome}${username}\n   🆔 ${userId}\n   ⏱️ ${tempoAberto}min aberto\n\n`;
    i++;
  });
  return lista;
}

async function verificarAlertas(ctx, state) {
  const { ticketsAbertos, config } = state;
  const agora = Date.now();
  const alertaMs = config.ALERTA_HORAS * 60 * 60 * 1000;
  let mensagem = "⏰ *Clientes esperando resposta há mais de 1 hora:*\n\n";
  let temAlertas = false;
  ticketsAbertos.forEach((ticket, userId) => {
    const tempoEspera = (agora - ticket.dataUltimaMsg) / (1000 * 60 * 60);
    if (tempoEspera > config.ALERTA_HORAS) {
      mensagem += `🔴 ${ticket.nome} (ID: ${userId}) - ${tempoEspera.toFixed(1)}h\n`;
      temAlertas = true;
    }
  });
  if (temAlertas) await ctx.reply(mensagem, { parse_mode: "Markdown" });
}

function registerStaffHandlers(bot, state) {
  const {
    ticketsAbertos,
    persistTickets,
    fecharTicket,
    salvarConversa,
    config,
  } = state;

  const checkStaff = (ctx) => isStaff(ctx, config);

  // FECHAR
  bot.command("fechar", async (ctx) => {
    if (!checkStaff(ctx)) return;
    const parts = ctx.message.text.split(" ");
    const userId = parts[1];
    if (!userId || isNaN(userId)) {
      await ctx.reply("❌ Use: /fechar <ID_CLIENTE>\nExemplo: /fechar 123456789");
      return;
    }
    const uid = parseInt(userId, 10);
    if (!ticketsAbertos.has(uid)) {
      await ctx.reply("❌ Ticket não encontrado ou já foi fechado");
      return;
    }
    fecharTicket(uid);
    try {
      await ctx.telegram.sendMessage(
        uid,
        "✅ Seu ticket foi encerrado.\n\nObrigado por usar nosso suporte! 🙏"
      );
    } catch (err) {
      console.error(`Erro ao notificar cliente ${uid}:`, err.message);
    }
    await ctx.reply(`🔒 Ticket do cliente ${userId} foi encerrado com sucesso!`);
  });

  // STATUS
  bot.command("status", async (ctx) => {
    if (!checkStaff(ctx)) return;
    const total = ticketsAbertos.size;
    const alertaMs = config.ALERTA_HORAS * 60 * 60 * 1000;
    const agora = Date.now();
    let emEspera = 0;
    ticketsAbertos.forEach((ticket) => {
      if (agora - ticket.dataUltimaMsg > alertaMs) emEspera++;
    });
    await ctx.reply(
      `📊 *Status do Suporte*\n\n` +
        `📌 Tickets abertos: ${total}\n` +
        `⏰ Aguardando resposta (>${config.ALERTA_HORAS}h): ${emEspera}\n` +
        `👥 Use /listar para ver detalhes`,
      { parse_mode: "Markdown" }
    );
  });

  // LISTAR
  bot.command("listar", async (ctx) => {
    if (!checkStaff(ctx)) return;
    await ctx.reply(formatarListaTickets(ticketsAbertos), { parse_mode: "Markdown" });
  });

  // ALERTAS
  bot.command("alertas", async (ctx) => {
    if (!checkStaff(ctx)) return;
    await verificarAlertas(ctx, state);
  });

  // RESPONDER - alternativa ao reply
  bot.command("responder", async (ctx) => {
    if (!checkStaff(ctx)) return;
    const match = ctx.message.text.match(/^\/responder\s+(\d+)\s+(.+)$/s);
    if (!match) {
      await ctx.reply("❌ Use: /responder <ID_CLIENTE> <mensagem>");
      return;
    }
    const userId = parseInt(match[1], 10);
    const mensagem = match[2].trim();
    const ticket = ticketsAbertos.get(userId);
    if (!ticket) {
      await ctx.reply("❌ Ticket não encontrado ou já foi fechado");
      return;
    }
    try {
      await ctx.telegram.sendMessage(userId, mensagem);
      ticket.dataUltimaMsg = Date.now();
      ticket.mensagens = (ticket.mensagens || 0) + 1;
      persistTickets();
      salvarConversa(userId, ticket.nome, mensagem, "atendente");
      await ctx.reply(`✅ Mensagem enviada para o cliente ${userId}`);
    } catch (err) {
      await ctx.reply(`❌ Erro ao enviar: ${err.message}`);
    }
  });

  // DETALHES
  bot.command("detalhes", async (ctx) => {
    if (!checkStaff(ctx)) return;
    const userId = ctx.message.text.split(" ")[1];
    if (!userId || isNaN(userId)) {
      await ctx.reply("❌ Use: /detalhes <ID_CLIENTE>");
      return;
    }
    const uid = parseInt(userId, 10);
    const ticket = ticketsAbertos.get(uid);
    if (!ticket) {
      await ctx.reply("❌ Ticket não encontrado ou já foi fechado");
      return;
    }
    const tempoAberto = Math.floor((Date.now() - ticket.dataCriacao) / (1000 * 60));
    const ultimaMsg = Math.floor((Date.now() - ticket.dataUltimaMsg) / (1000 * 60));
    const username = ticket.username ? ` @${ticket.username}` : "";
    await ctx.reply(
      `📋 *Detalhes do ticket*\n\n` +
        `👤 ${ticket.nome}${username}\n` +
        `🆔 ${uid}\n` +
        `⏱️ Aberto há: ${tempoAberto} min\n` +
        `💬 Última msg há: ${ultimaMsg} min\n` +
        `📨 Total de msgs: ${ticket.mensagens || 0}`,
      { parse_mode: "Markdown" }
    );
  });

  // REABRIR
  bot.command("reabrir", async (ctx) => {
    if (!checkStaff(ctx)) return;
    const userId = ctx.message.text.split(" ")[1];
    if (!userId || isNaN(userId)) {
      await ctx.reply("❌ Use: /reabrir <ID_CLIENTE>");
      return;
    }
    const uid = parseInt(userId, 10);
    if (ticketsAbertos.has(uid)) {
      await ctx.reply("Este ticket já está aberto.");
      return;
    }
    ticketsAbertos.set(uid, {
      nome: "Cliente (reaberto)",
      dataCriacao: Date.now(),
      dataUltimaMsg: Date.now(),
      mensagens: 0,
    });
    persistTickets();
    await ctx.reply(`✅ Ticket do cliente ${userId} reaberto. Aguardando mensagem do cliente.`);
  });
}

async function handleStaffReply(ctx, state) {
  const {
    ticketsAbertos,
    persistTickets,
    salvarConversa,
    config,
  } = state;

  if (!ctx.message.reply_to_message) return;

  const original = ctx.message.reply_to_message;
  const originalText = original.text || original.caption || "";
  const match =
    originalText.match(/🆔 (\d+)/) ||
    originalText.match(/Cliente (\d+)/i) ||
    originalText.match(/cliente (\d+)/i) ||
    originalText.match(/MENSAGEM DO CLIENTE (\d+)/);
  if (!match) return;

  const userId = parseInt(match[1], 10);
  const ticket = ticketsAbertos.get(userId);
  if (!ticket) {
    await ctx.reply("❌ Ticket não encontrado ou já foi fechado");
    return;
  }

  if (ctx.message.photo) {
    const photo = ctx.message.photo.pop();
    await ctx.telegram.sendPhoto(userId, photo.file_id, {
      caption: ctx.message.caption || "",
    });
  } else if (ctx.message.document) {
    await ctx.telegram.sendDocument(userId, ctx.message.document.file_id, {
      caption: ctx.message.caption || "",
    });
  } else if (ctx.message.text) {
    await ctx.telegram.sendMessage(userId, ctx.message.text);
  } else return;

  ticket.dataUltimaMsg = Date.now();
  ticket.mensagens = (ticket.mensagens || 0) + 1;
  persistTickets();
  salvarConversa(userId, ticket.nome, ctx.message.text || "[mídia]", "atendente");
}

module.exports = {
  registerStaffHandlers,
  handleStaffReply,
  isStaff,
};
