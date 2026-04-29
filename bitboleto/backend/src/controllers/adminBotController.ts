/**
 * Admin API — Gestão do bot Telegram via painel web.
 * Lê e grava diretamente no SQLite do bot.
 * Envia mensagens via Telegram Bot API usando o mesmo token do bot.
 */
import { Request, Response } from 'express';
import { getBotDb, isBotDbAvailable } from '../lib/botDb';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const API_URL   = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Helper ──────────────────────────────────────────────────────────────────
function db() { return getBotDb(); }

function dbAvailable(res: Response): boolean {
  if (!isBotDbAvailable()) {
    res.status(503).json({ error: 'Bot DB indisponível. O bot precisa ter sido iniciado ao menos uma vez.' });
    return false;
  }
  return true;
}

async function sendTelegramMessage(chatId: number | string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const r = await fetch(`${API_URL}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    return r.ok;
  } catch { return false; }
}

// ─── Usuários ─────────────────────────────────────────────────────────────────
export const listBotUsers = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const { page = '1', limit = '20', status, search } = req.query as Record<string, string>;
    const pageN   = Math.max(1, parseInt(page, 10));
    const limitN  = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset  = (pageN - 1) * limitN;

    let where = '1=1';
    const params: any[] = [];
    if (status && status !== 'all') { where += ' AND status = ?'; params.push(status); }
    if (search) {
      where += ' AND (nome LIKE ? OR username LIKE ? OR CAST(telegram_id AS TEXT) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const users = db().prepare(
      `SELECT u.*,
        (SELECT COUNT(*) FROM bot_payments p WHERE p.telegram_id = u.telegram_id) AS total_cobranças,
        (SELECT COUNT(*) FROM bot_payments p WHERE p.telegram_id = u.telegram_id AND p.status = 'pago') AS cobranças_pagas,
        (SELECT COALESCE(SUM(total_pagador),0) FROM bot_payments p WHERE p.telegram_id = u.telegram_id AND p.status = 'pago') AS volume_pago
       FROM bot_users u WHERE ${where}
       ORDER BY u.data_criacao DESC LIMIT ? OFFSET ?`
    ).all(...params, limitN, offset);

    const total = (db().prepare(`SELECT COUNT(*) as c FROM bot_users WHERE ${where}`).get(...params) as any).c;

    return res.json({ users, pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) } });
  } catch (e: any) {
    console.error('listBotUsers:', e.message);
    return res.status(500).json({ error: 'Erro ao listar usuários do bot' });
  }
};

export const getBotUser = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const tid     = parseInt(String(req.params.id), 10);
    const user    = db().prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const wallets = db().prepare('SELECT * FROM bot_wallets WHERE telegram_id = ?').all(tid);
    const payments = db().prepare(
      'SELECT * FROM bot_payments WHERE telegram_id = ? ORDER BY criado_em DESC LIMIT 20'
    ).all(tid);
    return res.json({ user, wallets, payments });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
};

export const updateBotUser = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const tid = parseInt(String(req.params.id), 10);
    const { status, limite_custom, trusted, delay_hours } = req.body;

    const user = db().prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid) as any;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (status !== undefined) {
      if (!['ativo', 'bloqueado'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Use: ativo | bloqueado' });
      }
      db().prepare('UPDATE bot_users SET status = ? WHERE telegram_id = ?').run(status, tid);

      const msg = status === 'bloqueado'
        ? '⛔ Sua conta no sistema de pagamentos foi *bloqueada* pelo administrador.\n\nEntre em contato com o suporte para mais informações.'
        : '✅ Sua conta no sistema de pagamentos foi *reativada*. Você já pode gerar cobranças normalmente.';
      await sendTelegramMessage(tid, msg);
    }

    if (limite_custom !== undefined) {
      const val = limite_custom === null ? null : parseFloat(limite_custom);
      if (val !== null && (isNaN(val) || val < 0)) {
        return res.status(400).json({ error: 'Limite inválido' });
      }
      db().prepare('UPDATE bot_users SET limite_custom = ? WHERE telegram_id = ?').run(val, tid);
    }

    if (trusted !== undefined) {
      db().prepare('UPDATE bot_users SET trusted = ? WHERE telegram_id = ?').run(trusted ? 1 : 0, tid);
    }

    if (delay_hours !== undefined) {
      const val = parseInt(String(delay_hours), 10);
      if (isNaN(val) || val < 0 || val > 720) {
        return res.status(400).json({ error: 'delay_hours deve ser entre 0 e 720' });
      }
      db().prepare('UPDATE bot_users SET delay_hours = ? WHERE telegram_id = ?').run(val, tid);
    }

    const updated = db().prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    return res.json({ user: updated });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
};

// ─── Pagamentos ───────────────────────────────────────────────────────────────
export const listBotPayments = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const { page = '1', limit = '20', status, telegram_id } = req.query as Record<string, string>;
    const pageN  = Math.max(1, parseInt(page, 10));
    const limitN = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageN - 1) * limitN;

    let where = '1=1';
    const params: any[] = [];
    if (status && status !== 'all') { where += ' AND p.status = ?'; params.push(status); }
    if (telegram_id) { where += ' AND p.telegram_id = ?'; params.push(parseInt(telegram_id, 10)); }

    const payments = db().prepare(
      `SELECT p.*, u.nome, u.username
       FROM bot_payments p
       LEFT JOIN bot_users u ON u.telegram_id = p.telegram_id
       WHERE ${where}
       ORDER BY p.criado_em DESC LIMIT ? OFFSET ?`
    ).all(...params, limitN, offset);

    const total = (db().prepare(
      `SELECT COUNT(*) as c FROM bot_payments p WHERE ${where}`
    ).get(...params) as any).c;

    return res.json({ payments, pagination: { page: pageN, limit: limitN, total, pages: Math.ceil(total / limitN) } });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao listar pagamentos' });
  }
};

// ─── Métricas ─────────────────────────────────────────────────────────────────
export const getBotMetrics = async (_req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const d = db();
    const totalUsers    = (d.prepare("SELECT COUNT(*) as c FROM bot_users").get() as any).c;
    const activeUsers   = (d.prepare("SELECT COUNT(*) as c FROM bot_users WHERE status = 'ativo'").get() as any).c;
    const blockedUsers  = (d.prepare("SELECT COUNT(*) as c FROM bot_users WHERE status = 'bloqueado'").get() as any).c;
    const totalPayments = (d.prepare("SELECT COUNT(*) as c FROM bot_payments").get() as any).c;
    const paidRow       = d.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total_pagador),0) as vol FROM bot_payments WHERE status = 'pago'").get() as any;
    const pendente      = (d.prepare("SELECT COUNT(*) as c FROM bot_payments WHERE status = 'pendente'").get() as any).c;
    const expirado      = (d.prepare("SELECT COUNT(*) as c FROM bot_payments WHERE status = 'expirado'").get() as any).c;
    const today         = new Date().toISOString().split('T')[0];
    const hojePaid      = d.prepare("SELECT COUNT(*) as c, COALESCE(SUM(total_pagador),0) as vol FROM bot_payments WHERE status = 'pago' AND date(pago_em) = ?").get(today) as any;
    const convRate      = totalPayments > 0 ? ((paidRow.c / totalPayments) * 100).toFixed(1) : '0.0';

    return res.json({
      users:    { total: totalUsers, active: activeUsers, blocked: blockedUsers },
      payments: { total: totalPayments, paid: paidRow.c, pending: pendente, expired: expirado, volume: paidRow.vol, conversionRate: convRate },
      today:    { paid: hojePaid.c, volume: hojePaid.vol },
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao buscar métricas' });
  }
};

// ─── Mensagens / Broadcast ────────────────────────────────────────────────────
export const sendBotMessage = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const { telegram_id, text } = req.body;
    if (!telegram_id || !text?.trim()) {
      return res.status(400).json({ error: 'telegram_id e text são obrigatórios' });
    }
    const ok = await sendTelegramMessage(parseInt(telegram_id, 10), text.trim());
    return res.json({ ok, telegram_id });
  } catch (e: any) {
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

export const broadcastBotMessage = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  const { text, status_filter = 'ativo' } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text é obrigatório' });

  // Responde imediatamente, envia em background
  res.json({ ok: true, message: 'Broadcast iniciado em background' });

  const users = db().prepare(
    'SELECT telegram_id FROM bot_users WHERE status = ?'
  ).all(status_filter) as any[];

  let sent = 0, failed = 0;
  for (const u of users) {
    const ok = await sendTelegramMessage(u.telegram_id, text.trim());
    if (ok) sent++; else failed++;
    await new Promise(r => setTimeout(r, 100)); // 100ms throttle
  }
  console.log(`[BotBroadcast] Enviado: ${sent} | Falhou: ${failed}`);
};

// ─── Liberação manual de pagamento ────────────────────────────────────────────
export const releaseBotPayment = async (req: Request, res: Response) => {
  if (!dbAvailable(res)) return;
  try {
    const id  = parseInt(String(req.params.id), 10);
    const pay = db().prepare('SELECT * FROM bot_payments WHERE id = ?').get(id) as any;
    if (!pay) return res.status(404).json({ error: 'Pagamento não encontrado' });
    if (pay.status === 'pago') return res.status(400).json({ error: 'Pagamento já concluído' });

    // Tentar endpoint de release na Swapverse (best-effort)
    const SWAPVERSE_BASE  = (process.env.SWAPVERSE_BASE_URL || 'https://api.swapverse.exchange').replace(/\/$/, '');
    const SWAPVERSE_TOKEN = process.env.SWAPVERSE_ACCESS_TOKEN || '';
    if (pay.swapverse_id && SWAPVERSE_TOKEN) {
      try {
        await fetch(`${SWAPVERSE_BASE}/api/v1/depix/${pay.swapverse_id}/release`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SWAPVERSE_TOKEN}`, 'Content-Type': 'application/json' },
        });
      } catch { /* best-effort */ }
    }

    const today = new Date().toISOString().split('T')[0];
    db().prepare("UPDATE bot_payments SET status = 'pago', pago_em = datetime('now') WHERE id = ?").run(id);
    db().prepare(
      `UPDATE bot_users SET
         usado_hoje = CASE WHEN data_reset = ? THEN usado_hoje + ? ELSE ? END,
         data_reset = ?
       WHERE telegram_id = ?`
    ).run(today, pay.total_pagador, pay.total_pagador, today, pay.telegram_id);

    const fmt = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
    await sendTelegramMessage(
      pay.telegram_id,
      `🎉 *DePix depositado na sua carteira!*\n\n` +
      `📦 Valor depositado: *${fmt(pay.valor_receber)} DePix*\n` +
      `💰 Pago pelo pagador: ${fmt(pay.total_pagador)}\n\n` +
      `_Liberado manualmente pelo administrador._`
    );

    const updated = db().prepare('SELECT * FROM bot_payments WHERE id = ?').get(id);
    return res.json({ ok: true, payment: updated });
  } catch (e: any) {
    console.error('releaseBotPayment:', e.message);
    return res.status(500).json({ error: 'Erro ao liberar pagamento' });
  }
};

// ─── Configurações ────────────────────────────────────────────────────────────
export const getBotConfig = async (_req: Request, res: Response) => {
  return res.json({
    LIMITE_NOVO_USUARIO:  parseFloat(process.env.LIMITE_NOVO_USUARIO || '100'),
    LIMITE_APOS_7_DIAS:   parseFloat(process.env.LIMITE_APOS_7_DIAS  || '500'),
    DIAS_LIMITE_NOVO:     parseInt(process.env.DIAS_LIMITE_NOVO       || '7', 10),
    BOT_FEE_PERCENT:      parseFloat(process.env.BOT_FEE_PERCENT     || '2'),
    BOT_FEE_FIXED:        parseFloat(process.env.BOT_FEE_FIXED       || '0.99'),
    swapverseConfigured:  Boolean(process.env.SWAPVERSE_ACCESS_TOKEN),
    botConfigured:        Boolean(BOT_TOKEN),
  });
};
