/**
 * Conexão read-write com o banco SQLite do bot Telegram.
 * O backend acessa o mesmo arquivo que o bot usa.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const BOT_DB_PATH = process.env.BOT_DB_PATH
  || path.join(__dirname, '../../../../pagdepix-bot/data/bot.db');

let botDb: InstanceType<typeof Database> | null = null;

export function getBotDb(): InstanceType<typeof Database> {
  if (botDb) return botDb;
  if (!fs.existsSync(BOT_DB_PATH)) {
    throw new Error(`Bot DB não encontrado em: ${BOT_DB_PATH}`);
  }
  botDb = new Database(BOT_DB_PATH, { readonly: false });
  botDb.pragma('journal_mode = WAL');
  return botDb;
}

export function isBotDbAvailable(): boolean {
  return fs.existsSync(BOT_DB_PATH);
}
