"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hmacValidator = hmacValidator;
const crypto_1 = require("crypto");
const prisma_1 = require("../prisma");
/**
 * Valida a assinatura HMAC-SHA256 do webhook enviado pelo PagDepix.
 *
 * O PagDepix envia o header:
 *   X-PagDepix-Signature: <hmac-sha256-hex>
 *
 * O DepixCore valida usando o secret configurado em PAGDEPIX_WEBHOOK_SECRET.
 * Se a assinatura for inválida, retorna 401 e registra no AuditLog.
 *
 * Se PAGDEPIX_WEBHOOK_SECRET não estiver configurado, aceita sem validação
 * (útil para desenvolvimento local), mas loga um aviso.
 */
async function hmacValidator(req, res, next) {
    const secret = process.env.PAGDEPIX_WEBHOOK_SECRET;
    const signature = req.headers['x-pagdepix-signature'];
    const deliveryId = req.headers['x-pagdepix-delivery-id'];
    const eventType = req.headers['x-pagdepix-event'];
    // Sem secret configurado: aceitar mas avisar (apenas em dev)
    if (!secret || !secret.trim()) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[HMAC] ⚠️  PAGDEPIX_WEBHOOK_SECRET não configurado. Aceitando sem validação.');
            return next();
        }
        // Em produção, rejeita se não houver secret
        await logAudit(req, 500, 'PAGDEPIX_WEBHOOK_SECRET não configurado em produção', eventType, deliveryId);
        res.status(500).json({ error: 'Servidor mal configurado' });
        return;
    }
    // Sem signature no header
    if (!signature) {
        console.warn('[HMAC] ⚠️  Requisição sem X-PagDepix-Signature rejeitada');
        await logAudit(req, 401, 'Assinatura ausente', eventType, deliveryId);
        res.status(401).json({ error: 'Assinatura ausente' });
        return;
    }
    // Precisa do rawBody preservado pelo express.json({ verify })
    const rawBody = req.rawBody;
    if (!rawBody) {
        await logAudit(req, 400, 'rawBody não disponível', eventType, deliveryId);
        res.status(400).json({ error: 'Corpo da requisição inválido' });
        return;
    }
    // Calcular HMAC esperado
    const expectedSignature = (0, crypto_1.createHmac)('sha256', secret)
        .update(rawBody)
        .digest('hex');
    // Comparação segura (evita timing attacks)
    try {
        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        if (sigBuffer.length !== expectedBuffer.length || !(0, crypto_1.timingSafeEqual)(sigBuffer, expectedBuffer)) {
            console.warn(`[HMAC] ❌ Assinatura inválida para delivery ${deliveryId || 'desconhecido'}`);
            await logAudit(req, 401, 'Assinatura inválida', eventType, deliveryId);
            res.status(401).json({ error: 'Assinatura inválida' });
            return;
        }
    }
    catch {
        await logAudit(req, 401, 'Erro ao comparar assinatura', eventType, deliveryId);
        res.status(401).json({ error: 'Assinatura malformada' });
        return;
    }
    next();
}
async function logAudit(req, statusCode, error, eventType, deliveryId) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                method: req.method,
                path: req.path,
                ip: req.ip || req.socket?.remoteAddress || null,
                userAgent: req.headers['user-agent'] || null,
                statusCode,
                error,
                eventType: eventType || null,
                deliveryId: deliveryId || null,
            },
        });
    }
    catch (err) {
        console.error('[HMAC] Erro ao registrar AuditLog:', err);
    }
}
//# sourceMappingURL=hmacValidator.js.map