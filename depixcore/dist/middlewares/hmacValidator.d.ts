import { Request, Response, NextFunction } from 'express';
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
export declare function hmacValidator(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=hmacValidator.d.ts.map