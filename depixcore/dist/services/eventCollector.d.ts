export type PagDepixEventType = 'payment.received' | 'payment.approved' | 'payment.refused' | 'recharge.completed' | 'recharge.refused' | 'charge.paid';
export interface PagDepixWebhookPayload {
    event: PagDepixEventType;
    transactionId: string;
    type: 'boleto' | 'recharge' | 'charge';
    data: Record<string, unknown>;
    timestamp: string;
    isSandbox: boolean;
}
export declare function storeRawEvent(payload: PagDepixWebhookPayload, deliveryId: string | undefined, rawBody: string): Promise<{
    id: string;
    alreadyExists: boolean;
}>;
export declare function processEvent(rawEventId: string, payload: PagDepixWebhookPayload): Promise<void>;
export declare function handleIncomingWebhook(payload: PagDepixWebhookPayload, deliveryId: string | undefined, rawBody: string): Promise<{
    success: boolean;
    alreadyExists: boolean;
    rawEventId: string;
}>;
//# sourceMappingURL=eventCollector.d.ts.map