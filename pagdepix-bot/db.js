/**
 * Banco de dados SQLite para o sistema de pagamentos do bot.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'bot.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS bot_users (
    telegram_id   INTEGER PRIMARY KEY,
    username      TEXT,
    nome          TEXT,
    limite_diario REAL    NOT NULL DEFAULT 100,
    limite_custom REAL,
    usado_hoje    REAL    NOT NULL DEFAULT 0,
    data_reset    TEXT    NOT NULL DEFAULT (date('now')),
    data_criacao  TEXT    NOT NULL DEFAULT (datetime('now')),
    status        TEXT    NOT NULL DEFAULT 'ativo'
  );

  CREATE TABLE IF NOT EXISTS bot_wallets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id  INTEGER NOT NULL REFERENCES bot_users(telegram_id) ON DELETE CASCADE,
    nome         TEXT    NOT NULL,
    endereco     TEXT    NOT NULL,
    criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bot_payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER NOT NULL REFERENCES bot_users(telegram_id),
    valor_solicit  REAL    NOT NULL,
    valor_receber  REAL    NOT NULL,
    taxa_total     REAL    NOT NULL,
    total_pagador  REAL    NOT NULL,
    taxa_tipo      TEXT    NOT NULL,
    carteira       TEXT    NOT NULL,
    swapverse_id   TEXT,
    qr_image_url   TEXT,
    copy_paste     TEXT,
    status         TEXT    NOT NULL DEFAULT 'pendente',
    expires_at     TEXT,
    pago_em        TEXT,
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bot_payments_telegram ON bot_payments(telegram_id);
  CREATE INDEX IF NOT EXISTS idx_bot_payments_swapverse ON bot_payments(swapverse_id);
  CREATE INDEX IF NOT EXISTS idx_bot_wallets_telegram ON bot_wallets(telegram_id);
`);

// Migrações incrementais (ignoram erro se coluna já existe)
const migrations = [
  `ALTER TABLE bot_users    ADD COLUMN trusted      INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE bot_users    ADD COLUMN delay_hours  INTEGER NOT NULL DEFAULT 24`,
  `ALTER TABLE bot_payments ADD COLUMN bank_tx_hash    TEXT`,
  `ALTER TABLE bot_payments ADD COLUMN pix_recebido_em TEXT`,
  `ALTER TABLE bot_payments ADD COLUMN notificado_pix  INTEGER NOT NULL DEFAULT 0`,
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (_) { /* coluna já existe */ }
}

module.exports = db;
