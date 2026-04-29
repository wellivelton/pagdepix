const express = require("express");
const { Telegraf } = require("telegraf");
const fs = require("fs");
const path = require("path");
const { config, validate } = require("./config");
const { loadTickets, saveTickets, mapFromObject, ensureDataDir } = require("./persistence");
const { registerClienteHandlers, handleClienteMensagem } = require("./handlers/cliente");
const { registerStaffHandlers, handleStaffReply, isStaff } = require("./handlers/staff");
const { registerPaymentHandlers, resumePendingPolls } = require("./handlers/paymentFlow");
const { registerAdminPaymentHandlers } = require("./handlers/adminPayment");
const { registerWebhookRoutes } = require("./handlers/webhookHandler");

validate();

const bot = new Telegraf(config.BOT_TOKEN);

// Garantir diretórios
if (!fs.existsSync(config.LOG_DIR)) fs.mkdirSync(config.LOG_DIR, { recursive: true });
ensureDataDir(config.DATA_DIR);

// Tickets em memória (carregados do JSON)
const ticketsAbertos = mapFromObject(loadTickets(config.TICKETS_FILE));

function persistTickets() {
  saveTickets(config.TICKETS_FILE, ticketsAbertos);
}

// ==========================================
// HORÁRIO DE ATENDIMENTO
// ==========================================
function estaDentroDoHorario() {
  const now = new Date();
  const tz = config.TIMEZONE;
  try {
    const br = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const hora = br.getHours();
    const dia = br.getDay();
    if (!config.DIAS_UTEIS.includes(dia)) return false;
    return hora >= config.HORARIO_INICIO && hora < config.HORARIO_FIM;
  } catch {
    const hora = now.getHours();
    const dia = now.getDay();
    if (!config.DIAS_UTEIS.includes(dia)) return false;
    return hora >= config.HORARIO_INICIO && hora < config.HORARIO_FIM;
  }
}

// ==========================================
// HELPERS
// ==========================================
function salvarConversa(userId, nome, mensagem, tipo = "cliente") {
  const data = new Date().toLocaleString("pt-BR");
  const arquivo = path.join(config.LOG_DIR, `${userId}.txt`);
  const conteudo = `[${data}] ${tipo.toUpperCase()}: ${mensagem}\n`;
  fs.appendFileSync(arquivo, conteudo);
}

function fecharTicket(userId) {
  ticketsAbertos.delete(parseInt(userId, 10));
  persistTickets();
  console.log(`🔒 Ticket fechado para usuário ${userId}`);
}

function verificarTimeouts() {
  const agora = Date.now();
  ticketsAbertos.forEach((ticket, userId) => {
    const horasAberto = (agora - ticket.dataCriacao) / (1000 * 60 * 60);
    if (horasAberto > config.TIMEOUT_HORAS) {
      fecharTicket(userId);
    }
  });
}

// State compartilhado entre handlers
const state = {
  ticketsAbertos,
  persistTickets,
  fecharTicket,
  salvarConversa,
  estaDentroDoHorario,
  config,
};

// Registrar handlers dos módulos
registerPaymentHandlers(bot, state);
registerAdminPaymentHandlers(bot);
registerClienteHandlers(bot, state);
registerStaffHandlers(bot, state);

// ==========================================
// HANDLER MENSAGENS - roteamento
// ==========================================
bot.on("message", async (ctx) => {
  try {
    if (ctx.chat.type === "private") {
      // Mídia já tratada por bot.on("photo") e bot.on("document") em cliente.js
      if (ctx.message.photo || ctx.message.document) return;
      const text = ctx.message.text || ctx.message.caption || "";
      await handleClienteMensagem(ctx, text, null, state);
      return;
    }

    // Atendente (grupo) - reply para cliente
    if (isStaff(ctx, config) && ctx.message.reply_to_message) {
      await handleStaffReply(ctx, state);
    }
  } catch (err) {
    console.error("❌ Erro no bot:", err.message);
  }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
// Servidor HTTP para receber webhooks da Swapverse
const webhookApp = express();
webhookApp.use(express.json());
registerWebhookRoutes(webhookApp, bot);
webhookApp.listen(config.WEBHOOK_PORT, () => {
  console.log(`🌐 Webhook server ouvindo na porta ${config.WEBHOOK_PORT}`);
});

bot.launch({ dropPendingUpdates: true }).then(() => {
  console.log("🤖 PagDepixBot de suporte ONLINE");
  setInterval(verificarTimeouts, 10 * 60 * 1000);
  console.log(`⏰ Timeout: ${config.TIMEOUT_HORAS}h | Alertas: ${config.ALERTA_HORAS}h`);
  console.log(`💾 Persistência: ${config.TICKETS_FILE}`);
  resumePendingPolls(bot);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
