/**
 * Fluxo completo de geração de cobranças DePix via Swapverse.
 */
const { Markup } = require('telegraf');
const db = require('../db');
const { generateDepixQr, getDepixOrderStatus } = require('../swapverse');

// ─── Constantes ───────────────────────────────────────────────────────────────
const BOT_FEE_PERCENT       = parseFloat(process.env.BOT_FEE_PERCENT || '2');
const BOT_FEE_FIXED         = parseFloat(process.env.BOT_FEE_FIXED   || '0.99');
const SWAPVERSE_WEBHOOK_URL = process.env.SWAPVERSE_WEBHOOK_URL || '';
const DEFAULT_DELAY_HOURS   = parseInt(process.env.BOT_DELAY_HOURS || '24', 10);
const SYNC_INTERVAL_MS      = 60000; // 1 minuto — igual ao job do Modo Comércio
const BOT_FEE_THRESHOLD  = 100;   // R$ — aplica taxa fixa abaixo desse valor
const BOT_MIN_AMOUNT     = 10;
const BOT_MAX_AMOUNT     = 5000;
const LIMITE_NOVO        = parseFloat(process.env.LIMITE_NOVO_USUARIO || '100');
const LIMITE_PADRAO      = parseFloat(process.env.LIMITE_APOS_7_DIAS  || '500');
const DIAS_NOVO          = parseInt(process.env.DIAS_LIMITE_NOVO       || '7');
const RATE_MAX           = 3;     // max inicializações por minuto por usuário
const POLL_MS            = 30000; // 30s

const QUICK_AMOUNTS = [20, 50, 100, 200, 500, 1000];

// ─── Estado em memória ────────────────────────────────────────────────────────
const flows      = new Map(); // telegramId → { step, data }
const polling    = new Map(); // swapverseId → intervalId
const rateLimits = new Map(); // telegramId → [timestamp...]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v) {
  return `R$ ${parseFloat(v).toFixed(2).replace('.', ',')}`;
}

function getFlow(id)          { return flows.get(id); }
function clearFlow(id)        { flows.delete(id); }
function setFlow(id, f)       { flows.set(id, f); }
function isPaymentButton(txt) { return txt === '💰 Receber pagamento'; }

function checkRateLimit(id) {
  const now  = Date.now();
  const times = (rateLimits.get(id) || []).filter(t => now - t < 60000);
  if (times.length >= RATE_MAX) return false;
  times.push(now);
  rateLimits.set(id, times);
  return true;
}

function getOrCreateUser(telegramId, username, nome) {
  let u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(telegramId);
  if (!u) {
    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      `INSERT INTO bot_users (telegram_id, username, nome, limite_diario, usado_hoje, data_reset)
       VALUES (?, ?, ?, ?, 0, ?)`
    ).run(telegramId, username || null, nome || 'Usuário', LIMITE_NOVO, today);
    u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(telegramId);
  } else {
    db.prepare('UPDATE bot_users SET username = ?, nome = ? WHERE telegram_id = ?')
      .run(username || u.username, nome || u.nome, telegramId);
    u = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(telegramId);
  }
  return u;
}

function getLimit(user) {
  if (user.limite_custom != null) return user.limite_custom;
  const dias = (Date.now() - new Date(user.data_criacao).getTime()) / 86400000;
  return dias < DIAS_NOVO ? LIMITE_NOVO : LIMITE_PADRAO;
}

function getTodayUsage(user) {
  const today = new Date().toISOString().split('T')[0];
  if (user.data_reset !== today) {
    db.prepare('UPDATE bot_users SET usado_hoje = 0, data_reset = ? WHERE telegram_id = ?')
      .run(today, user.telegram_id);
    return 0;
  }
  return user.usado_hoje || 0;
}

function calcularCobranca(valor, tipoTaxa) {
  const fixo    = valor <= BOT_FEE_THRESHOLD ? BOT_FEE_FIXED : 0;
  const percent = Math.round(valor * (BOT_FEE_PERCENT / 100) * 100) / 100;
  const total   = Math.round((percent + fixo) * 100) / 100;

  if (tipoTaxa === 'payer') {
    return {
      valorReceber: valor,
      taxaPercent: percent,
      taxaFixa: fixo,
      taxaTotal: total,
      totalPagador: Math.round((valor + total) * 100) / 100,
    };
  }
  return {
    valorReceber: Math.max(0, Math.round((valor - total) * 100) / 100),
    taxaPercent: percent,
    taxaFixa: fixo,
    taxaTotal: total,
    totalPagador: valor,
  };
}

const PAID_STATUSES = new Set(['depix_sent', 'completed', 'paid', 'confirmed']);

// ─── Notificação de PIX recebido (fase 1) ────────────────────────────────────
async function notifyPixRecebido(pay, bankTxHash, bot) {
  const current = db.prepare('SELECT notificado_pix, status FROM bot_payments WHERE id = ?').get(pay.id);
  if (!current || current.notificado_pix || current.status === 'pago') return;

  db.prepare(`
    UPDATE bot_payments
    SET bank_tx_hash = ?, pix_recebido_em = datetime('now'), notificado_pix = 1
    WHERE id = ?
  `).run(bankTxHash, pay.id);

  const user = db.prepare('SELECT delay_hours FROM bot_users WHERE telegram_id = ?').get(pay.telegram_id);
  const delayH = user?.delay_hours ?? DEFAULT_DELAY_HOURS;

  await bot.telegram.sendMessage(
    pay.telegram_id,
    `✅ *PIX recebido com sucesso!*\n\n` +
    `💰 Valor recebido: *${fmt(pay.total_pagador)}*\n\n` +
    `🔐 *Para sua segurança e da plataforma, o DePix será liberado em sua carteira Liquid em até ${delayH}h.*\n\n` +
    `_Você receberá uma notificação assim que o depósito for concluído._`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
}

// ─── Confirmação de DePix enviado (fase 2 — usado por polling, webhook e sync) ─
async function confirmPayment(pay, bot) {
  const current = db.prepare('SELECT status FROM bot_payments WHERE id = ?').get(pay.id);
  if (!current || current.status === 'pago') return;

  db.prepare("UPDATE bot_payments SET status = 'pago', pago_em = datetime('now') WHERE id = ?")
    .run(pay.id);

  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    UPDATE bot_users SET
      usado_hoje = CASE WHEN data_reset = ? THEN usado_hoje + ? ELSE ? END,
      data_reset = ?
    WHERE telegram_id = ?`
  ).run(today, pay.total_pagador, pay.total_pagador, today, pay.telegram_id);

  if (pay.swapverse_id && polling.has(pay.swapverse_id)) {
    clearInterval(polling.get(pay.swapverse_id));
    polling.delete(pay.swapverse_id);
  }

  await bot.telegram.sendMessage(
    pay.telegram_id,
    `🎉 *DePix depositado na sua carteira!*\n\n` +
    `📦 Valor depositado: *${fmt(pay.valor_receber)} DePix*\n` +
    `💰 Pago pelo pagador: ${fmt(pay.total_pagador)}\n\n` +
    `_Verifique sua carteira Liquid para confirmar o recebimento._`,
    { parse_mode: 'Markdown' }
  ).catch(() => {});
}

// ─── Processa uma ordem: detecta fase 1 e fase 2 ─────────────────────────────
async function processOrderStatus(pay, bot) {
  const r = await getDepixOrderStatus(pay.swapverse_id);
  if (!r.success || !r.order) return;

  const order = r.order;
  const status = (order.status || '').toLowerCase();

  // Fase 1: PIX recebido (bank_tx_hash apareceu)
  if (order.bank_tx_hash && !pay.notificado_pix) {
    await notifyPixRecebido(pay, order.bank_tx_hash, bot);
    // Re-ler o pay atualizado para a fase 2 abaixo
    pay = db.prepare('SELECT * FROM bot_payments WHERE id = ?').get(pay.id) || pay;
  }

  // Fase 2: DePix enviado
  if (PAID_STATUSES.has(status)) {
    await confirmPayment(pay, bot);
    return 'paid';
  }

  return status;
}

// ─── Polling de curto prazo (dentro da janela de 30min do QR) ────────────────
function startPolling(paymentId, swapverseId, telegramId, bot) {
  if (polling.has(swapverseId)) return;

  const iid = setInterval(async () => {
    try {
      let pay = db.prepare('SELECT * FROM bot_payments WHERE id = ?').get(paymentId);
      if (!pay || pay.status === 'pago') {
        clearInterval(iid);
        polling.delete(swapverseId);
        return;
      }

      // Consulta a Swapverse ANTES de verificar expiração local (evita race condition).
      const result = await processOrderStatus(pay, bot);
      if (result === 'paid') {
        clearInterval(iid);
        polling.delete(swapverseId);
        return;
      }

      // Re-ler após possível atualização de notificado_pix
      pay = db.prepare('SELECT * FROM bot_payments WHERE id = ?').get(paymentId);
      if (!pay || pay.status === 'pago') {
        clearInterval(iid);
        polling.delete(swapverseId);
        return;
      }

      // Só expira se Swapverse também não tem bank_tx_hash (PIX realmente não foi recebido)
      if (pay.status === 'pendente' && pay.expires_at && new Date(pay.expires_at) < new Date()) {
        const check = await getDepixOrderStatus(swapverseId);
        if (check.success && check.order?.bank_tx_hash) return; // PIX chegou no último segundo, sync job pega
        db.prepare("UPDATE bot_payments SET status = 'expirado' WHERE id = ?").run(paymentId);
        clearInterval(iid);
        polling.delete(swapverseId);
        await bot.telegram.sendMessage(telegramId,
          '⏰ A cobrança expirou sem pagamento.\n\nUse *💰 Receber pagamento* para gerar uma nova.',
          { parse_mode: 'Markdown' }).catch(() => {});
      }
    } catch (e) {
      console.error('[PaymentFlow] polling error:', e.message);
    }
  }, POLL_MS);

  polling.set(swapverseId, iid);
}

// ─── Job de sincronização de longo prazo (cobre o delay de 24h) ──────────────
// Funciona igual ao syncCommercePayments do backend: roda a cada 1 minuto,
// verifica os últimos 7 dias, independente de expiração do QR.
let syncJobRunning = false;
async function runSyncJob(bot) {
  if (syncJobRunning) return;
  syncJobRunning = true;
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    const orders = db.prepare(`
      SELECT * FROM bot_payments
      WHERE status IN ('pendente', 'pix_recebido')
        AND swapverse_id IS NOT NULL
        AND criado_em > ?
    `).all(cutoff);

    for (const pay of orders) {
      try {
        await processOrderStatus(pay, bot);
        await new Promise(r => setTimeout(r, 150)); // throttle entre chamadas
      } catch (e) {
        console.error('[SyncBot] erro ao processar payment id=' + pay.id + ':', e.message);
      }
    }
  } catch (e) {
    console.error('[SyncBot] erro fatal:', e.message);
  } finally {
    syncJobRunning = false;
  }
}

// ─── Retoma polls e inicia job de sync ao reiniciar o bot ────────────────────
function resumePendingPolls(bot) {
  // Polling de curto prazo: só para ordens ainda dentro da janela do QR
  const now = new Date().toISOString();
  const active = db.prepare(
    "SELECT * FROM bot_payments WHERE status = 'pendente' AND swapverse_id IS NOT NULL AND (expires_at IS NULL OR expires_at > ?)"
  ).all(now);
  if (active.length) {
    console.log(`[PaymentFlow] Retomando ${active.length} poll(s) ativo(s) após reinício.`);
    for (const pay of active) {
      startPolling(pay.id, pay.swapverse_id, pay.telegram_id, bot);
    }
  }

  // Job de sync de longo prazo: detecta pagamentos confirmados com delay de 24h
  console.log('[SyncBot] Iniciando job de sincronização (intervalo: 1 min).');
  runSyncJob(bot).catch(() => {});
  setInterval(() => runSyncJob(bot).catch(() => {}), SYNC_INTERVAL_MS);
}

// ─── Telas ────────────────────────────────────────────────────────────────────
async function showAmountSelect(ctx, remaining) {
  const avail = QUICK_AMOUNTS.filter(a => a <= remaining && a >= BOT_MIN_AMOUNT);
  const rows  = [];
  let   row   = [];
  for (const a of avail) {
    row.push(Markup.button.callback(`R$ ${a}`, `p_a${a}`));
    if (row.length === 3) { rows.push([...row]); row = []; }
  }
  if (row.length) rows.push(row);
  rows.push([Markup.button.callback('✏️ Digitar valor', 'p_ac')]);
  rows.push([Markup.button.callback('❌ Cancelar', 'p_x')]);

  await ctx.reply(
    `💰 *Receber Pagamento via PIX → DePix*\n\n` +
    `Escolha o valor que deseja receber:\n` +
    `_Limite disponível hoje: ${fmt(remaining)}_`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

async function showFeeSelect(ctx, valor) {
  const fixo    = valor <= BOT_FEE_THRESHOLD ? BOT_FEE_FIXED : 0;
  const percent = Math.round(valor * (BOT_FEE_PERCENT / 100) * 100) / 100;
  const total   = Math.round((percent + fixo) * 100) / 100;
  const comFixo = fixo > 0 ? `\nTaxa fixa: ${fmt(fixo)}` : '';

  const lines = [
    `💸 *Cálculo de taxa para ${fmt(valor)}*\n`,
    `Taxa ${BOT_FEE_PERCENT}%: ${fmt(percent)}${comFixo}`,
    `Taxa total: *${fmt(total)}*\n`,
    `Como deseja cobrar?`,
  ].join('\n');

  await ctx.reply(lines, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback(`🧾 Pagador paga a taxa (+${fmt(total)})`, 'p_fp')],
      [Markup.button.callback(`💼 Eu absorvo a taxa (recebo ${fmt(valor - total)})`, 'p_fm')],
      [Markup.button.callback('❌ Cancelar', 'p_x')],
    ]),
  });
}

async function showWalletSelect(ctx, telegramId) {
  const wallets = db.prepare(
    'SELECT * FROM bot_wallets WHERE telegram_id = ? ORDER BY criado_em DESC LIMIT 5'
  ).all(telegramId);

  const rows = wallets.map(w => [
    Markup.button.callback(`💼 ${w.nome} — ${w.endereco.slice(0, 12)}…`, `p_wr${w.id}`)
  ]);
  rows.push([Markup.button.callback('➕ Informar nova carteira', 'p_wn')]);
  rows.push([Markup.button.callback('❌ Cancelar', 'p_x')]);

  const texto = wallets.length
    ? `🏦 *Carteira Liquid (DePix)*\n\nSelecione uma carteira salva ou informe uma nova:`
    : `🏦 *Carteira Liquid (DePix)*\n\nInforme o endereço Liquid onde deseja receber o DePix:`;

  await ctx.reply(texto, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) });
}

async function showReview(ctx, flow) {
  const { calc, carteira, carteiraLabel } = flow.data;
  const carteiraExib = carteiraLabel || `${carteira.slice(0, 18)}…`;
  const tipoTaxa = flow.data.tipoTaxa === 'payer' ? 'Pagador paga a taxa' : 'Você absorve a taxa';

  await ctx.reply(
    `📋 *Resumo da cobrança*\n\n` +
    `💰 Pagador enviará: *${fmt(calc.totalPagador)}*\n` +
    `📦 Você receberá: *${fmt(calc.valorReceber)} em DePix*\n` +
    `💸 Taxa: ${fmt(calc.taxaTotal)} (${tipoTaxa})\n` +
    `🏦 Carteira: \`${carteiraExib}\`\n\n` +
    `Confirmar geração da cobrança?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar', 'p_ok')],
        [Markup.button.callback('❌ Cancelar', 'p_x')],
      ]),
    }
  );
}

async function showAntifraude(ctx) {
  await ctx.reply(
    `⚠️ *Termo de uso — leia antes de confirmar*\n\n` +
    `❗ *Não aceitamos pedidos de estorno.* Todas as transações são finais e irreversíveis.\n\n` +
    `🚫 Uso indevido deste sistema (fraude, lavagem de dinheiro, golpes) resultará em *bloqueio permanente* e poderá ser denunciado às autoridades competentes.\n\n` +
    `Ao confirmar, você declara estar ciente e de acordo.`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Entendi — Gerar cobrança', 'p_af')],
        [Markup.button.callback('❌ Cancelar', 'p_x')],
      ]),
    }
  );
}

// Mensagem de "use os botões" por etapa
const STEP_HINT = {
  amount_select:    '👆 Escolha um dos valores acima ou clique em *✏️ Digitar valor*.',
  fee_select:       '👆 Escolha quem paga a taxa usando os botões acima.',
  wallet_select:    '👆 Selecione uma carteira salva ou clique em *➕ Nova carteira*.',
  wallet_save_ask:  '👆 Escolha uma opção nos botões acima.',
  review:           '👆 Confirme ou cancele usando os botões acima.',
  antifraude:       '👆 Leia o aviso e use os botões para continuar.',
  generating:       '⏳ Gerando sua cobrança, aguarde…',
};

// ─── Handlers de mensagem de texto ───────────────────────────────────────────
async function handleFlowMessage(ctx, text, _state) {
  const id   = ctx.from.id;
  const flow = flows.get(id);
  if (!flow) return false;

  // Cancelar via texto — SEMPRE aceito em qualquer etapa
  const lower = (text || '').toLowerCase().trim();
  if (lower === '/cancelar' || lower === 'cancelar') {
    clearFlow(id);
    await ctx.reply('Operação cancelada.', { parse_mode: 'Markdown' });
    return true;
  }

  // Etapas que aguardam texto do usuário
  if (flow.step === 'amount_type') {
    const raw   = text.replace(/[^0-9.,]/g, '').replace(',', '.');
    const valor = parseFloat(raw);

    const user    = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(id);
    const limit   = getLimit(user);
    const used    = getTodayUsage(user);
    const remain  = Math.max(0, limit - used);

    if (isNaN(valor) || valor < BOT_MIN_AMOUNT) {
      return ctx.reply(`❌ Valor mínimo: ${fmt(BOT_MIN_AMOUNT)}. Tente novamente:`);
    }
    if (valor > BOT_MAX_AMOUNT) {
      return ctx.reply(`❌ Valor máximo por transação: ${fmt(BOT_MAX_AMOUNT)}. Tente novamente:`);
    }
    if (valor > remain) {
      return ctx.reply(
        `❌ Valor acima do limite disponível hoje: ${fmt(remain)}.\n\n` +
        `Tente um valor menor ou aguarde a renovação do limite.`
      );
    }

    flow.data.valor = valor;
    flow.step = 'fee_select';
    setFlow(id, flow);
    return showFeeSelect(ctx, valor);
  }

  if (flow.step === 'wallet_type') {
    const addr = text.trim();
    if (addr.length < 20) {
      return ctx.reply('❌ Endereço Liquid inválido. Deve ter pelo menos 20 caracteres. Tente novamente:');
    }
    flow.data.tempAddr = addr;
    flow.step = 'wallet_save_ask';
    setFlow(id, flow);
    return ctx.reply(
      `✅ Endereço registrado: \`${addr.slice(0, 20)}…\`\n\nDeseja salvar este endereço para uso futuro?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('💾 Sim, salvar', 'p_ws')],
          [Markup.button.callback('Não, usar uma vez', 'p_wns')],
        ]),
      }
    );
  }

  if (flow.step === 'wallet_name_type') {
    const nome = text.trim();
    if (!nome || nome.length < 2) {
      return ctx.reply('❌ Nome muito curto. Tente novamente:');
    }
    const addr = flow.data.tempAddr;
    db.prepare(
      'INSERT INTO bot_wallets (telegram_id, nome, endereco) VALUES (?, ?, ?)'
    ).run(id, nome, addr);

    flow.data.carteira     = addr;
    flow.data.carteiraLabel = nome;
    flow.step = 'review';
    setFlow(id, flow);
    await ctx.reply(`✅ Carteira *${nome}* salva!`, { parse_mode: 'Markdown' });
    return showReview(ctx, flow);
  }

  // Etapas que aguardam botões (callback) — bloquear texto e orientar o usuário
  const hint = STEP_HINT[flow.step] || '👆 Use os botões para avançar ou /cancelar para sair.';
  await ctx.reply(hint, { parse_mode: 'Markdown' });
  return true; // interceptado — nunca passa para o sistema de tickets
}

// ─── Handlers de callback query ──────────────────────────────────────────────
async function handleFlowCallback(ctx, data, _state, bot) {
  const id   = ctx.from.id;
  const flow = flows.get(id);
  await ctx.answerCbQuery().catch(() => {});

  // ── Cancelar (qualquer etapa)
  if (data === 'p_x') {
    clearFlow(id);
    return ctx.reply('Operação cancelada.', { parse_mode: 'Markdown' });
  }

  // ── Seleção de valor rápido
  if (/^p_a(\d+)$/.test(data) && flow?.step === 'amount_select') {
    const valor = parseInt(data.replace('p_a', ''), 10);

    const user   = db.prepare('SELECT * FROM bot_users WHERE telegram_id = ?').get(id);
    const remain = Math.max(0, getLimit(user) - getTodayUsage(user));

    if (valor > remain) {
      return ctx.reply(`❌ Valor acima do limite disponível (${fmt(remain)}). Escolha um menor.`);
    }

    flow.data.valor = valor;
    flow.step = 'fee_select';
    setFlow(id, flow);
    return showFeeSelect(ctx, valor);
  }

  // ── Digitar valor customizado
  if (data === 'p_ac' && flow?.step === 'amount_select') {
    flow.step = 'amount_type';
    setFlow(id, flow);
    return ctx.reply(
      `✏️ Digite o valor que deseja receber (ex: 150 ou 350,00):\n` +
      `_Mínimo: ${fmt(BOT_MIN_AMOUNT)} — Máximo: ${fmt(BOT_MAX_AMOUNT)}_`,
      { parse_mode: 'Markdown' }
    );
  }

  // ── Seleção de tipo de taxa
  if ((data === 'p_fp' || data === 'p_fm') && flow?.step === 'fee_select') {
    flow.data.tipoTaxa = data === 'p_fp' ? 'payer' : 'me';
    flow.data.calc     = calcularCobranca(flow.data.valor, flow.data.tipoTaxa);
    flow.step = 'wallet_select';
    setFlow(id, flow);
    return showWalletSelect(ctx, id);
  }

  // ── Selecionar carteira salva
  if (/^p_wr(\d+)$/.test(data) && flow?.step === 'wallet_select') {
    const wid    = parseInt(data.replace('p_wr', ''), 10);
    const wallet = db.prepare(
      'SELECT * FROM bot_wallets WHERE id = ? AND telegram_id = ?'
    ).get(wid, id);

    if (!wallet) return ctx.reply('❌ Carteira não encontrada.');

    flow.data.carteira      = wallet.endereco;
    flow.data.carteiraLabel = wallet.nome;
    flow.step = 'review';
    setFlow(id, flow);
    return showReview(ctx, flow);
  }

  // ── Nova carteira (digitar)
  if (data === 'p_wn' && flow?.step === 'wallet_select') {
    flow.step = 'wallet_type';
    setFlow(id, flow);
    return ctx.reply(
      '🏦 Digite o endereço da sua carteira Liquid (onde receberá o DePix):',
      { parse_mode: 'Markdown' }
    );
  }

  // ── Salvar carteira (pedir nome)
  if (data === 'p_ws' && flow?.step === 'wallet_save_ask') {
    flow.step = 'wallet_name_type';
    setFlow(id, flow);
    return ctx.reply('💾 Dê um nome a esta carteira (ex: *Carteira principal*):',
      { parse_mode: 'Markdown' });
  }

  // ── Não salvar carteira
  if (data === 'p_wns' && flow?.step === 'wallet_save_ask') {
    flow.data.carteira = flow.data.tempAddr;
    flow.step = 'review';
    setFlow(id, flow);
    return showReview(ctx, flow);
  }

  // ── Confirmar cobrança → mostrar aviso antifraude
  if (data === 'p_ok' && flow?.step === 'review') {
    flow.step = 'antifraude';
    setFlow(id, flow);
    return showAntifraude(ctx);
  }

  // ── Aceitar antifraude → gerar QR
  if (data === 'p_af' && flow?.step === 'antifraude') {
    flow.step = 'generating';
    setFlow(id, flow);

    await ctx.reply('⏳ Gerando sua cobrança… aguarde.');

    const { calc, carteira } = flow.data;

    const result = await generateDepixQr({
      amount:             calc.totalPagador,
      depixWalletAddress: carteira,
      feePercent:         String(BOT_FEE_PERCENT),
      delayHours:         24,
      webhookUrl:         SWAPVERSE_WEBHOOK_URL || undefined,
    });

    if (!result.success) {
      clearFlow(id);
      return ctx.reply(
        `❌ *Erro ao gerar cobrança:*\n\n${result.error}\n\nTente novamente ou fale com o suporte.`,
        { parse_mode: 'Markdown' }
      );
    }

    const order = result.order;

    // Salvar no banco
    const row = db.prepare(`
      INSERT INTO bot_payments
        (telegram_id, valor_solicit, valor_receber, taxa_total, total_pagador, taxa_tipo, carteira,
         swapverse_id, qr_image_url, copy_paste, status, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)
    `).run(
      id,
      flow.data.valor,
      calc.valorReceber,
      calc.taxaTotal,
      calc.totalPagador,
      flow.data.tipoTaxa,
      carteira,
      order.id   || null,
      order.qr_image_url  || null,
      order.qr_copy_paste || null,
      order.expires_at    || null,
    );

    clearFlow(id);

    const expiresMsg = order.expires_at
      ? `\n⏰ Expira: ${new Date(order.expires_at).toLocaleString('pt-BR')}`
      : '';

    // Enviar QR Code como imagem
    if (order.qr_image_url) {
      try {
        await ctx.replyWithPhoto(order.qr_image_url, {
          caption:
            `✅ *Cobrança gerada!*\n\n` +
            `💰 Valor a pagar: *${fmt(calc.totalPagador)}*\n` +
            `📦 Você receberá: *${fmt(calc.valorReceber)} em DePix*${expiresMsg}\n\n` +
            `Envie o QR Code ou o código Pix abaixo ao pagador.`,
          parse_mode: 'Markdown',
        });
      } catch {
        await ctx.reply(
          `✅ *Cobrança gerada!*\n\n💰 Valor a pagar: *${fmt(calc.totalPagador)}*\n📦 Você receberá: *${fmt(calc.valorReceber)} em DePix*${expiresMsg}`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await ctx.reply(
        `✅ *Cobrança gerada!*\n\n💰 Valor a pagar: *${fmt(calc.totalPagador)}*\n📦 Você receberá: *${fmt(calc.valorReceber)} em DePix*${expiresMsg}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Enviar código copia e cola
    if (order.qr_copy_paste) {
      await ctx.reply(
        `📋 *Código PIX Copia e Cola:*\n\n` +
        `\`${order.qr_copy_paste}\`\n\n` +
        `_Aguardando pagamento… você será notificado automaticamente._`,
        { parse_mode: 'Markdown' }
      );
    }

    // Iniciar polling
    if (order.id) {
      startPolling(row.lastInsertRowid, order.id, id, bot);
    }
  }
}

// ─── Entrada do fluxo ─────────────────────────────────────────────────────────
async function startPaymentFlow(ctx) {
  const id       = ctx.from.id;
  const username = ctx.from.username || null;
  const nome     = ctx.from.first_name || 'Usuário';

  if (!checkRateLimit(id)) {
    return ctx.reply('⚠️ Muitas solicitações em seguida. Aguarde um minuto e tente novamente.');
  }

  const user = getOrCreateUser(id, username, nome);

  if (user.status === 'bloqueado') {
    return ctx.reply(
      '⛔ *Conta bloqueada.*\n\nEntre em contato com o suporte via *💬 Falar com atendente*.',
      { parse_mode: 'Markdown' }
    );
  }

  const limit   = getLimit(user);
  const used    = getTodayUsage(user);
  const remain  = Math.max(0, limit - used);

  if (remain < BOT_MIN_AMOUNT) {
    return ctx.reply(
      `📊 *Limite diário atingido.*\n\n` +
      `Seu limite: ${fmt(limit)}/dia\n` +
      `Utilizado hoje: ${fmt(used)}\n\n` +
      `O limite renova automaticamente à meia-noite. ` +
      `Para aumentar seu limite, fale com o suporte.`,
      { parse_mode: 'Markdown' }
    );
  }

  setFlow(id, { step: 'amount_select', data: {} });
  await showAmountSelect(ctx, remain);
}

// ─── Comandos adicionais ──────────────────────────────────────────────────────
async function handleHistorico(ctx) {
  const id  = ctx.from.id;
  const rows = db.prepare(
    `SELECT * FROM bot_payments WHERE telegram_id = ? ORDER BY criado_em DESC LIMIT 5`
  ).all(id);

  if (!rows.length) {
    return ctx.reply('Nenhuma cobrança gerada ainda.\n\nUse *💰 Receber pagamento* para começar.',
      { parse_mode: 'Markdown' });
  }

  const STATUS_EMOJI = { pendente: '⏳', pago: '✅', expirado: '⏰', cancelado: '❌' };

  const lines = rows.map((r, i) => {
    const emoji  = STATUS_EMOJI[r.status] || '❓';
    const data   = new Date(r.criado_em).toLocaleDateString('pt-BR');
    return `${i + 1}. ${emoji} ${fmt(r.total_pagador)} → ${fmt(r.valor_receber)} DePix — ${data}`;
  });

  return ctx.reply(
    `📜 *Últimas cobranças:*\n\n${lines.join('\n')}`,
    { parse_mode: 'Markdown' }
  );
}

async function handleCarteiras(ctx) {
  const id      = ctx.from.id;
  const wallets = db.prepare(
    'SELECT * FROM bot_wallets WHERE telegram_id = ? ORDER BY criado_em DESC'
  ).all(id);

  if (!wallets.length) {
    return ctx.reply(
      'Nenhuma carteira salva.\n\nAo gerar uma cobrança, você poderá salvar seu endereço Liquid.',
      { parse_mode: 'Markdown' }
    );
  }

  const rows = wallets.map(w => [
    Markup.button.callback(`🗑 Remover "${w.nome}"`, `p_dw${w.id}`)
  ]);

  const lista = wallets.map((w, i) =>
    `${i + 1}. *${w.nome}*\n   \`${w.endereco.slice(0, 24)}…\``
  ).join('\n\n');

  return ctx.reply(
    `🏦 *Suas carteiras salvas:*\n\n${lista}`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard(rows) }
  );
}

// ─── Registrar todos os handlers no bot ──────────────────────────────────────
function registerPaymentHandlers(bot, _state) {
  // Comando /receber
  bot.command('receber', ctx => {
    if (ctx.chat.type !== 'private') return;
    startPaymentFlow(ctx);
  });

  // Histórico de cobranças
  bot.command('historico', ctx => {
    if (ctx.chat.type !== 'private') return;
    handleHistorico(ctx);
  });

  // Gerenciar carteiras
  bot.command('carteiras', ctx => {
    if (ctx.chat.type !== 'private') return;
    handleCarteiras(ctx);
  });

  // Callbacks do fluxo de pagamento
  bot.action(/^p_/, async ctx => {
    if (ctx.chat.type !== 'private') return;
    const data = ctx.callbackQuery?.data || '';

    // Remover carteira salva
    if (/^p_dw(\d+)$/.test(data)) {
      const wid = parseInt(data.replace('p_dw', ''), 10);
      const w   = db.prepare(
        'SELECT * FROM bot_wallets WHERE id = ? AND telegram_id = ?'
      ).get(wid, ctx.from.id);

      await ctx.answerCbQuery().catch(() => {});
      if (!w) return ctx.reply('❌ Carteira não encontrada.');

      db.prepare('DELETE FROM bot_wallets WHERE id = ?').run(wid);
      return ctx.reply(`✅ Carteira *${w.nome}* removida.`, { parse_mode: 'Markdown' });
    }

    // Demais callbacks do fluxo
    await handleFlowCallback(ctx, data, _state, bot);
  });
}

module.exports = {
  registerPaymentHandlers,
  startPaymentFlow,
  handleFlowMessage,
  isPaymentButton,
  getFlow,
  clearFlow,
  handleHistorico,
  handleCarteiras,
  confirmPayment,
  resumePendingPolls,
};
