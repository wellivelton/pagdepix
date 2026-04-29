import { Request, Response, NextFunction } from 'express';
/**
 * Autenticação simples para endpoints do dashboard DepixCore.
 * Usa API Key estática via header X-DepixCore-Key ou query ?apiKey=...
 *
 * Para produção, evoluir para JWT ou OAuth2.
 */
export declare function authMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=authMiddleware.d.ts.map