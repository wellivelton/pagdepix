-- AddColumn paymentProvider, rvhubPaymentId, rvhubStatus, digitableLine to Boleto
ALTER TABLE "Boleto"
  ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'ASAAS',
  ADD COLUMN "rvhubPaymentId"  TEXT,
  ADD COLUMN "rvhubStatus"     TEXT,
  ADD COLUMN "digitableLine"   TEXT;

CREATE UNIQUE INDEX "Boleto_rvhubPaymentId_key" ON "Boleto"("rvhubPaymentId");
