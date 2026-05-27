import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOPRECARGAS_BASE = (process.env.TOPRECARGAS_API_URL || 'http://185.241.151.200:2223').replace(/\/$/, '');
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

interface TopRecargasApiProduct {
  id: number;
  nome: string;
  descricao?: string;
  preco: number;
  categoria: string;
  estoque_total: number;
  estoque_disponivel: number;
  ativo: boolean;
  vendidos: number;
  media_estrelas?: number;
  total_avaliacoes: number;
}

async function runSync(): Promise<void> {
  let synced = 0;
  let hidden = 0;

  try {
    const res = await fetch(`${TOPRECARGAS_BASE}/api/produtos`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.error(`[SyncTopRecargas] API error: HTTP ${res.status}`);
      return;
    }

    const body = await res.json() as { sucesso?: boolean; produtos?: TopRecargasApiProduct[] } | TopRecargasApiProduct[];
    const produtos: TopRecargasApiProduct[] = Array.isArray(body)
      ? body
      : (body as any).produtos ?? [];

    if (!Array.isArray(produtos)) {
      console.error('[SyncTopRecargas] Unexpected API response shape');
      return;
    }

    const activeExternalIds = new Set<number>();

    for (const p of produtos) {
      activeExternalIds.add(p.id);
      const visivel = p.ativo && p.estoque_disponivel > 0;

      await prisma.toprecargasProduct.upsert({
        where: { externalId: p.id },
        create: {
          externalId: p.id,
          nome: p.nome,
          descricao: p.descricao ?? null,
          preco: p.preco,
          categoria: p.categoria,
          estoqueTotal: p.estoque_total,
          estoqueDisponivel: p.estoque_disponivel,
          ativo: p.ativo,
          vendidos: p.vendidos,
          mediaEstrelas: p.media_estrelas ?? null,
          totalAvaliacoes: p.total_avaliacoes,
          visivel,
          rawPayload: p as any,
        },
        update: {
          nome: p.nome,
          descricao: p.descricao ?? null,
          preco: p.preco,
          categoria: p.categoria,
          estoqueTotal: p.estoque_total,
          estoqueDisponivel: p.estoque_disponivel,
          ativo: p.ativo,
          vendidos: p.vendidos,
          mediaEstrelas: p.media_estrelas ?? null,
          totalAvaliacoes: p.total_avaliacoes,
          visivel,
          removedAt: visivel ? null : new Date(),
          rawPayload: p as any,
        },
      });
      synced++;
    }

    if (activeExternalIds.size > 0) {
      const result = await prisma.toprecargasProduct.updateMany({
        where: {
          externalId: { notIn: Array.from(activeExternalIds) },
          visivel: true,
        },
        data: { visivel: false, ativo: false, removedAt: new Date() },
      });
      hidden = result.count;
    }

    console.log(`[SyncTopRecargas] OK — ${synced} synced, ${hidden} hidden`);
  } catch (err) {
    console.error('[SyncTopRecargas] Sync error:', err);
  }
}

export function startSyncToprecargasProducts(): void {
  console.log('[SyncTopRecargas] Starting (15min interval)');
  runSync().catch(e => console.error('[SyncTopRecargas] Initial run error:', e));
  setInterval(() => runSync().catch(e => console.error('[SyncTopRecargas] Interval error:', e)), SYNC_INTERVAL_MS);
}
