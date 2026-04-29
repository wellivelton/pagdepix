"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtMiddleware = jwtMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Middleware de autenticação JWT.
 * Aceita token via: Authorization: Bearer <token>
 * Fallback: X-DepixCore-Key ou ?apiKey= (para acesso programático)
 */
function jwtMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    // --- Tentativa 1: JWT via Authorization: Bearer ---
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            res.status(500).json({ error: 'Servidor mal configurado (JWT_SECRET ausente)' });
            return;
        }
        try {
            const payload = jsonwebtoken_1.default.verify(token, secret);
            req.user = payload;
            next();
            return;
        }
        catch {
            res.status(401).json({ error: 'Token inválido ou expirado' });
            return;
        }
    }
    // --- Tentativa 2: API Key (fallback para acesso programático) ---
    const expectedKey = process.env.DEPIXCORE_API_KEY;
    const providedKey = req.headers['x-depixcore-key'] ||
        req.query.apiKey;
    if (expectedKey && providedKey && providedKey.trim() === expectedKey.trim()) {
        req.user = { sub: 'api-key', email: 'api@depixcore', name: 'API Key', role: 'admin' };
        next();
        return;
    }
    res.status(401).json({ error: 'Não autorizado' });
}
//# sourceMappingURL=jwtMiddleware.js.map