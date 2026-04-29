/**
 * Configurações do bot de suporte PagDepix
 */
require("dotenv").config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  BOT_USERNAME: process.env.BOT_USERNAME || "PagDepixBot",
  SUPPORT_GROUP_ID: process.env.SUPPORT_GROUP_ID,
  TIMEOUT_HORAS: parseInt(process.env.TIMEOUT_HORAS || "24", 10),
  ALERTA_HORAS: parseInt(process.env.ALERTA_HORAS || "1", 10),
  HORARIO_INICIO: parseInt(process.env.HORARIO_INICIO || "9", 10),
  HORARIO_FIM: parseInt(process.env.HORARIO_FIM || "17", 10),
  TIMEZONE: process.env.TIMEZONE || "America/Sao_Paulo",
  LOG_DIR: "./logs",
  DATA_DIR: "./data",
  TICKETS_FILE: "./data/tickets.json",
  DIAS_UTEIS: [1, 2, 3, 4, 5], // 0=Dom, 1=Seg, ..., 6=Sab
};

function validate() {
  if (!config.BOT_TOKEN || !config.BOT_TOKEN.trim()) {
    console.error("❌ BOT_TOKEN não definido no .env");
    process.exit(1);
  }
  if (!config.SUPPORT_GROUP_ID || !config.SUPPORT_GROUP_ID.trim()) {
    console.error("❌ SUPPORT_GROUP_ID não definido no .env");
    process.exit(1);
  }
}

module.exports = { config, validate };
