-- Add UNIQUE constraint to Boleto.liquidAddressIndex (was missing unlike MobileRecharge/BoletoBatch/PixCopiaCola)
ALTER TABLE "Boleto" ADD CONSTRAINT "Boleto_liquidAddressIndex_key" UNIQUE ("liquidAddressIndex");

-- Add Asaas tracking fields and adminNotes to Boleto
ALTER TABLE "Boleto" ADD COLUMN "adminNotes" TEXT;
ALTER TABLE "Boleto" ADD COLUMN "paidViaAsaas" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Boleto" ADD COLUMN "asaasPaymentId" TEXT;
