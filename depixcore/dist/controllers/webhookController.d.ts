import { Request, Response } from 'express';
/**
 * POST /depixcore/webhook
 *
 * Recebe eventos do PagDepix, valida (HMAC já validado pelo middleware),
 * armazena e processa.
 */
export declare function receiveWebhook(req: Request, res: Response): Promise<void>;
/**
 * GET /depixcore/webhook/status
 * Endpoint de saúde para o PagDepix verificar conectividade.
 */
export declare function webhookStatus(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=webhookController.d.ts.map