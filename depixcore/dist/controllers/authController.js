"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.me = me;
const authService_1 = require("../services/authService");
/**
 * POST /auth/login
 * Body: { email, password }
 * Retorna: { token, user }
 */
async function login(req, res) {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'E-mail é obrigatório' });
        return;
    }
    if (!password || typeof password !== 'string') {
        res.status(400).json({ error: 'Senha é obrigatória' });
        return;
    }
    try {
        const result = await (0, authService_1.loginUser)(email, password);
        if (!result) {
            // Mensagem genérica para não revelar qual campo está errado
            res.status(401).json({ error: 'E-mail ou senha incorretos' });
            return;
        }
        res.json(result);
    }
    catch (err) {
        console.error('[Auth] Erro ao fazer login:', err);
        res.status(500).json({ error: 'Erro interno' });
    }
}
/**
 * GET /auth/me
 * Retorna os dados do usuário autenticado (via JWT).
 */
async function me(req, res) {
    res.json({ user: req.user });
}
//# sourceMappingURL=authController.js.map