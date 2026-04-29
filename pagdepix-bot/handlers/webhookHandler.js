/**
 * Recebe notificações push da Swapverse quando o status de uma ordem muda.
 * A Swapverse envia um POST para a webhook_url registrada no generate-qr.
 */
const db = require('../db');
const { confirmPayment } = require('./paymentFlow');

const PAID_STATUSES = new Set(['depix_sent', 'completed', 'paid', 'confirmed']);

function registerWebhookRoutes(app, bot) {
  app.post('/bot/webhook/swapverse', async (req, res) => {
    // Responde imediatamente para a Swapverse não considerar timeout
    res.status(200).json({ ok: true });

    const order = req.body;
    if (!order?.id) return;

    const status = (order.status || '').toLowerCase();
    if (!PAID_STATUSES.has(status)) return;

    const pay = db
      .prepare("SELECT * FROM bot_payments WHERE swapverse_id = ? AND status = 'pendente'")
      .get(order.id);

    if (!pay) return;

    console.log(`[Webhook] Pagamento confirmado via webhook: swapverse_id=${order.id} payment_id=${pay.id}`);

    try {
      await confirmPayment(pay, bot);
    } catch (e) {
      console.error('[Webhook] Erro ao confirmar pagamento:', e.message);
    }
  });
}

module.exports = { registerWebhookRoutes };
