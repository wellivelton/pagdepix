-- AlterTable
ALTER TABLE "BillPayment" ADD COLUMN "rateProvider" TEXT,
                          ADD COLUMN "rateTimestamp" TIMESTAMP(3);
