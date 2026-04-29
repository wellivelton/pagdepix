import { Request, Response } from 'express';
/**
 * POST /auth/login
 * Body: { email, password }
 * Retorna: { token, user }
 */
export declare function login(req: Request, res: Response): Promise<void>;
/**
 * GET /auth/me
 * Retorna os dados do usuário autenticado (via JWT).
 */
export declare function me(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=authController.d.ts.map