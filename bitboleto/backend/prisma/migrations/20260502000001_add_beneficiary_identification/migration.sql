-- AlterTable: identificação do beneficiário obrigatória pela GeraDePix (AML/CFT) a partir de 01/05/2026
ALTER TABLE "send_pix_orders" ADD COLUMN "beneficiaryTaxId" TEXT;
ALTER TABLE "send_pix_orders" ADD COLUMN "beneficiaryName" TEXT;
