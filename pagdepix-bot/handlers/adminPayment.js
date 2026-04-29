/**
 * Comandos administrativos para o sistema de pagamentos do bot.
 * Disponíveis apenas para IDs em PAYMENT_ADMIN_IDS.
 */
const db = require('../db');

function fmt(v) {
  return `R$ ${parseFloat(v).toFixed(2).replace('.', ',')}`;
}

function isAdmin(ctx) {
  const admins = (process.env.PAYMENT_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return admins.includes(String(ctx.from.id));
}

function registerAdminPaymentHandlers(bot) {
  // ── /bloquear <telegram_id>
  bot.command('bloquear', async ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const tid   = parseInt(parts[1], 10);
    if (!tid) return ctx.reply('Uso: /bloquear <telegram_id>');

    const u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    if (!u) return ctx.reply(`❌ Usuário ${tid} não encontrado no sistema de pagamentos.`);
    if (u.status === 'bloqueado') return ctx.reply(`⚠️ Usuário ${tid} já está bloqueado.`);

    db.prepare("UPDATE bot_users SET status = 'bloqueado' WHERE telegram_id = ?").run(tid);

    try {
      await bot.telegram.sendMessage(tid,
        '⛔ Sua conta no sistema de pagamentos foi bloqueada.\n' +
        'Entre em contato com o suporte para mais informações.',
      );
    } catch {}

    ctx.reply(`✅ Usuário ${tid} (${u.nome || u.username || 'sem nome'}) bloqueado.`);
  });

  // ── /desbloquear <telegram_id>
  bot.command('desbloquear', async ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const tid   = parseInt(parts[1], 10);
    if (!tid) return ctx.reply('Uso: /desbloquear <telegram_id>');

    const u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    if (!u) return ctx.reply(`❌ Usuário ${tid} não encontrado.`);

    db.prepare("UPDATE bot_users SET status = 'ativo' WHERE telegram_id = ?").run(tid);

    try {
      await bot.telegram.sendMessage(tid,
        '✅ Sua conta no sistema de pagamentos foi reativada. Você já pode gerar cobranças.',
      );
    } catch {}

    ctx.reply(`✅ Usuário ${tid} (${u.nome || u.username || 'sem nome'}) desbloqueado.`);
  });

  // ── /setlimite <telegram_id> <valor>
  bot.command('setlimite', ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const tid   = parseInt(parts[1], 10);
    const val   = parseFloat(parts[2]);

    if (!tid || isNaN(val) || val < 0) {
      return ctx.reply('Uso: /setlimite <telegram_id> <valor_diario>\nEx: /setlimite 123456789 2000');
    }

    const u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    if (!u) return ctx.reply(`❌ Usuário ${tid} não encontrado.`);

    db.prepare('UPDATE bot_users SET limite_custom = ? WHERE telegram_id = ?').run(val, tid);
    ctx.reply(`✅ Limite de ${u.nome || tid} definido como ${fmt(val)}/dia.`);
  });

  // ── /resetlimite <telegram_id>  (volta ao padrão automático)
  bot.command('resetlimite', ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const tid   = parseInt(parts[1], 10);
    if (!tid) return ctx.reply('Uso: /resetlimite <telegram_id>');

    const u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(tid);
    if (!u) return ctx.reply(`❌ Usuário ${tid} não encontrado.`);

    db.prepare('UPDATE bot_users SET limite_custom = NULL WHERE telegram_id = ?').run(tid);
    ctx.reply(`✅ Limite de ${u.nome || tid} revertido para o padrão automático.`);
  });

  // ── /usuariosbot [page]
  bot.command('usuariosbot', ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const page  = Math.max(0, parseInt(parts[1] || '0', 10));
    const limit = 10;

    const rows = db.prepare(
      `SELECT * FROM bot_users ORDER BY data_criacao DESC LIMIT ? OFFSET ?`
    ).all(limit, page * limit);

    if (!rows.length) return ctx.reply('Nenhum usuário registrado.');

    const STATUS_EMOJI = { ativo: '🟢', bloqueado: '🔴' };
    const lines = rows.map(u => {
      const emoji = STATUS_EMOJI[u.status] || '❓';
      const lim   = u.limite_custom != null ? fmt(u.limite_custom) : 'padrão';
      const hoje  = fmt(u.usado_hoje || 0);
      const nome  = u.nome || u.username || u.telegram_id;
      return `${emoji} *${nome}* (${u.telegram_id})\n   Limite: ${lim} | Hoje: ${hoje}`;
    });

    ctx.reply(
      `👤 *Usuários (página ${page + 1}):*\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /pagamentosbot [telegram_id]
  bot.command('pagamentosbot', ctx => {
    if (!isAdmin(ctx)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    const tid   = parseInt(parts[1], 10);

    const rows = tid
      ? db.prepare(
          `SELECT * FROM bot_payments WHERE telegram_id = ? ORDER BY criado_em DESC LIMIT 10`
        ).all(tid)
      : db.prepare(
          `SELECT * FROM bot_payments ORDER BY criado_em DESC LIMIT 10`
        ).all();

    if (!rows.length) return ctx.reply('Nenhum pagamento encontrado.');

    const STATUS_EMOJI = { pendente: '⏳', pago: '✅', expirado: '⏰', cancelado: '❌' };
    const lines = rows.map(r => {
      const emoji = STATUS_EMOJI[r.status] || '❓';
      const data  = new Date(r.criado_em).toLocaleDateString('pt-BR');
      return `${emoji} ID ${r.id} | ${r.telegram_id} | ${fmt(r.total_pagador)} → ${fmt(r.valor_receber)} | ${data}`;
    });

    ctx.reply(
      `💳 *Últimos pagamentos:*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown' }
    );
  });

  // ── /estatisticasbot
  bot.command('estatisticasbot', ctx => {
    if (!isAdmin(ctx)) return;

    const totalUsuarios  = db.prepare('SELECT COUNT(*) as c FROM bot_users').get().c;
    const bloqueados     = db.prepare("SELECT COUNT(*) as c FROM bot_users WHERE status = 'bloqueado'").get().c;
    const pagamentos     = db.prepare('SELECT COUNT(*) as c FROM bot_payments').get().c;
    const pagos          = db.prepare("SELECT COUNT(*) as c, SUM(total_pagador) as vol FROM bot_payments WHERE status = 'pago'").get();
    const pendentes      = db.prepare("SELECT COUNT(*) as c FROM bot_payments WHERE status = 'pendente'").get().c;
    const hoje           = new Date().toISOString().split('T')[0];
    const hojePagamentos = db.prepare("SELECT COUNT(*) as c, SUM(total_pagador) as vol FROM bot_payments WHERE status = 'pago' AND date(pago_em) = ?").get(hoje);

    ctx.reply(
      `📊 *Estatísticas do sistema de pagamentos*\n\n` +
      `👤 Usuários: ${totalUsuarios} (${bloqueados} bloqueados)\n` +
      `💳 Total cobranças: ${pagamentos}\n` +
      `✅ Pagas: ${pagos.c} — Volume: ${fmt(pagos.vol || 0)}\n` +
      `⏳ Pendentes: ${pendentes}\n\n` +
      `📅 Hoje: ${hojePagamentos.c} pagas — ${fmt(hojePagamentos.vol || 0)}`,
      { parse_mode: 'Markdown' }
    );
  });
}

module.exports = { registerAdminPaymentHandlers };
