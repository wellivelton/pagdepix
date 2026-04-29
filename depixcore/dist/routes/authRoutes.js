"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const jwtMiddleware_1 = require("../middlewares/jwtMiddleware");
const router = (0, express_1.Router)();
/**
 * POST /auth/login
 * Autentica com email + senha, retorna JWT.
 */
router.post('/login', authController_1.login);
/**
 * GET /auth/me
 * Retorna dados do usuário autenticado.
 */
router.get('/me', jwtMiddleware_1.jwtMiddleware, authController_1.me);
exports.default = router;
//# sourceMappingURL=authRoutes.js.map