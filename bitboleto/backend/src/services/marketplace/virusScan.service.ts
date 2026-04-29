/**
 * Serviço de varredura de vírus em arquivos de produtos.
 * Sem ClamAV configurado, marca como "clean" (desenvolvimento).
 * Em produção, integrar com ClamAV (daemon ou clamscan).
 */

export type VirusScanResult = 'pending' | 'clean' | 'infected';

export async function scanFile(filePath: string): Promise<{ status: VirusScanResult; result?: string }> {
  // TODO: Integrar ClamAV quando disponível
  // const clamav = await getClamavClient();
  // const result = await clamav.scan(filePath);
  return { status: 'clean' };
}
