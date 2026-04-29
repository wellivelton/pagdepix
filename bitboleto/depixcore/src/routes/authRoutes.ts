import { Router } from 'express';
import { login, me } from '../controllers/authController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';

const router = Router();

/**
 * POST /auth/login
 * Autentica com email + senha, retorna JWT.
 */
router.post('/login', login);

/**
 * GET /auth/me
 * Retorna dados do usuário autenticado.
 */
router.get('/me', jwtMiddleware, me);

export default router;
