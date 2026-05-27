import type { IBillPaymentProvider, BillPaymentValidation, BillPaymentRequest, BillPaymentResult } from './IBillPaymentProvider';
import type { IMobileRechargeProvider, RechargeOperator, RechargeResult } from './IMobileRechargeProvider';

export class AsaasBillPaymentProvider implements IBillPaymentProvider {
  async validateBarcode(_barcode: string): Promise<BillPaymentValidation> {
    throw new Error('Asaas bill payment not yet implemented');
  }
  async createPayment(_req: BillPaymentRequest): Promise<BillPaymentResult> {
    throw new Error('Asaas bill payment not yet implemented');
  }
  async getPaymentStatus(_externalId: string): Promise<{ status: string }> {
    throw new Error('Asaas bill payment not yet implemented');
  }
}

export class AsaasMobileRechargeProvider implements IMobileRechargeProvider {
  async listOperators(): Promise<RechargeOperator[]> {
    throw new Error('Asaas mobile recharge not yet implemented');
  }
  async createRecharge(_phone: string, _productId: string, _amount: number): Promise<RechargeResult> {
    throw new Error('Asaas mobile recharge not yet implemented');
  }
  async getRechargeStatus(_externalId: string): Promise<{ status: string }> {
    throw new Error('Asaas mobile recharge not yet implemented');
  }
}
