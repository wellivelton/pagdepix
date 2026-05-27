export interface BillPaymentValidation {
  valid: boolean;
  amount?: number;
  dueDate?: Date;
  payeeName?: string;
  payeeDocument?: string;
}

export interface BillPaymentRequest {
  barcode: string;
  amount: number;
  description?: string;
}

export interface BillPaymentResult {
  externalId: string;
  status: string;
  dueDate?: Date;
  payeeName?: string;
}

export interface IBillPaymentProvider {
  validateBarcode(barcode: string): Promise<BillPaymentValidation>;
  createPayment(req: BillPaymentRequest): Promise<BillPaymentResult>;
  getPaymentStatus(externalId: string): Promise<{ status: string }>;
}
