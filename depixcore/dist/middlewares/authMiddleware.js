"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
/**
 * Autenticação simples para endpoints do dashboard DepixCore.
 * Usa API Key estática via header X-DepixCore-Key ou query ?apiKey=...
 *
 * Para produção, evoluir para JWT ou OAuth2.
 */
function authMiddleware(req, res, next) {
    const expectedKey = process.env.DEPIXCORE_API_KEY;
    // Sem chave configurada: bloquear em produção, liberar em dev
    if (!expectedKey || !expectedKey.trim()) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[Auth] ⚠️  DEPIXCORE_API_KEY não configurada. Acesso liberado em dev.');
            next();
            return;
        }
        res.status(500).json({ error: 'Servidor mal configurado' });
        return;
    }
    // Aceitar via header ou query param
    const providedKey = req.headers['x-depixcore-key'] ||
        req.query.apiKey;
    if (!providedKey || providedKey.trim() !== expectedKey.trim()) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }
    next();
}
//# sourceMappingURL=authMiddleware.js.map