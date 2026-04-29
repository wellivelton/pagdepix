/**
 * Cache simples em memória com TTL.
 * Use para dados lidos com frequência e baixa volatilidade (ex: listagem de produtos).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Obtém um valor do cache. Retorna null se expirado ou não encontrado.
 */
export function cacheGet<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Armazena um valor no cache com TTL em segundos.
 */
export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Remove entradas cujo prefixo bate com o padrão dado.
 */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/** Limpa todo o cache. */
export function cacheClear(): void {
  cache.clear();
}
