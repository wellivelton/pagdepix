import { Request, Response, NextFunction } from 'express';
export interface JwtPayload {
    sub: string;
    email: string;
    name: string;
    role: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}
/**
 * Middleware de autenticação JWT.
 * Aceita token via: Authorization: Bearer <token>
 * Fallback: X-DepixCore-Key ou ?apiKey= (para acesso programático)
 */
export declare function jwtMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=jwtMiddleware.d.ts.map