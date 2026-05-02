-- CreateTable
CREATE TABLE "config" (
    "id" TEXT NOT NULL DEFAULT 'config',
    "walletAddress" TEXT NOT NULL DEFAULT 'lq1qqgskhge4cunhw32799ky9wlaavt83xu0klvvz78yg4ugzr3dmq2t0gm4gyfdr59yhaq7anhkg52ha666d0nkys56jh979wyp7',
    "qrCodeUrl" TEXT NOT NULL DEFAULT '/qr-code.png',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);
