/**
 * Serviço para buscar o PDF do comprovante na GeraDePix e salvar localmente.
 * Evita depender da autenticação da GeraDePix no momento do download pelo usuário.
 */
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../prisma';

const RECEIPTS_DIR = path.resolve(__dirname, '..', '..', 'data', 'send-pix-receipts');

function ensureReceiptsDir(): string {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
  return RECEIPTS_DIR;
}

/**
 * Tenta buscar o PDF da URL da GeraDePix com diferentes estratégias de autenticação.
 * Retorna o Buffer do PDF se sucesso, null se falhar.
 */
async function fetchReceiptPdf(externalUrl: string): Promise<Buffer | null> {
  const apiKey = process.env.GERADEPIX_API_KEY?.trim();
  if (!apiKey) return null;

  const urlWithApiKey = (() => {
    try {
      const u = new URL(externalUrl);
      u.searchParams.set('api_key', apiKey);
      return u.toString();
    } catch {
      return externalUrl + (externalUrl.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(apiKey);
    }
  })();

  const attempts: { url: string; headers?: Record<string, string> }[] = [
    { url: urlWithApiKey, headers: { Authorization: `Bearer ${apiKey}` } },
    { url: urlWithApiKey },
    { url: externalUrl, headers: { Authorization: `Bearer ${apiKey}` } },
  ];

  for (const { url, headers } of attempts) {
    try {
      const res = await fetch(url, { headers: headers || {} });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 100 && buf.byteLength < 10 * 1024 * 1024) {
          return Buffer.from(buf);
        }
      }
    } catch {
      // Tenta próxima estratégia
    }
  }
  return null;
}

/**
 * Busca o PDF na GeraDePix e salva localmente. Atualiza receiptStoredPath no banco.
 * Retorna true se salvou com sucesso.
 */
export async function fetchAndStoreSendPixReceipt(
  orderId: string,
  externalReceiptUrl: string
): Promise<boolean> {
  if (!externalReceiptUrl || externalReceiptUrl.startsWith('/')) return false;

  const pdfBuffer = await fetchReceiptPdf(externalReceiptUrl);
  if (!pdfBuffer) return false;

  const dir = ensureReceiptsDir();
  const filename = `${orderId}.pdf`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, pdfBuffer, { flag: 'w' });

  await prisma.sendPixOrder.update({
    where: { id: orderId },
    data: { receiptStoredPath: `send-pix-receipts/${filename}` },
  });
  return true;
}

/**
 * Retorna o caminho absoluto do arquivo de comprovante armazenado, ou null.
 */
export function getStoredReceiptPath(relativePath: string): string | null {
  if (!relativePath || !relativePath.startsWith('send-pix-receipts/')) return null;
  const fullPath = path.resolve(__dirname, '..', '..', 'data', relativePath);
  if (fs.existsSync(fullPath)) return fullPath;
  return null;
}
