/**
 * Persistência de tickets em JSON
 */
const fs = require("fs");
const path = require("path");

function ensureDataDir(dataDir) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadTickets(filePath) {
  ensureDataDir(path.dirname(filePath));
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(data);
      return typeof parsed === "object" ? parsed : {};
    }
  } catch (err) {
    console.warn("[persistence] Erro ao carregar tickets:", err.message);
  }
  return {};
}

function saveTickets(filePath, ticketsMap) {
  ensureDataDir(path.dirname(filePath));
  const obj = {};
  for (const [userId, ticket] of ticketsMap) {
    obj[userId] = {
      nome: ticket.nome,
      username: ticket.username || null,
      dataCriacao: ticket.dataCriacao,
      dataUltimaMsg: ticket.dataUltimaMsg,
      mensagens: ticket.mensagens || 0,
    };
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.error("[persistence] Erro ao salvar tickets:", err.message);
  }
}

function mapFromObject(obj) {
  const map = new Map();
  for (const [userIdStr, data] of Object.entries(obj)) {
    const userId = parseInt(userIdStr, 10);
    if (isNaN(userId)) continue;
    map.set(userId, {
      nome: data.nome || "Usuário",
      username: data.username,
      dataCriacao: data.dataCriacao || Date.now(),
      dataUltimaMsg: data.dataUltimaMsg || Date.now(),
      mensagens: data.mensagens || 0,
    });
  }
  return map;
}

module.exports = { loadTickets, saveTickets, mapFromObject, ensureDataDir };
