/**
 * Cache para marketplace - in-memory por padrão.
 * Para produção: configurar REDIS_URL e usar redis client.
 * Cacheia: produtos populares, categorias, busca.
 */

const memory: Map<string, { value: unknown; expiry: number }> = new Map();
const TTL_SEC = 300; // 5 min padrão

export async function get<T>(key: string): Promise<T | null> {
  const entry = memory.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    memory.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function set(key: string, value: unknown, ttlSec = TTL_SEC): Promise<void> {
  memory.set(key, { value, expiry: Date.now() + ttlSec * 1000 });
}

export async function del(key: string): Promise<void> {
  memory.delete(key);
}

export function cacheKey(type: string, id: string): string {
  return `marketplace:${type}:${id}`;
}
