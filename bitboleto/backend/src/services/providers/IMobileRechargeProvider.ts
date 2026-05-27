export interface RechargeProduct {
  productId: string;
  amount: number;
}

export interface RechargeOperator {
  id: string;
  name: string;
  products: RechargeProduct[];
}

export interface RechargeResult {
  externalId: string;
  status: string;
  authorizationCode?: string;
}

export interface IMobileRechargeProvider {
  listOperators(): Promise<RechargeOperator[]>;
  createRecharge(phone: string, productId: string, amount: number): Promise<RechargeResult>;
  getRechargeStatus(externalId: string): Promise<{ status: string }>;
}
