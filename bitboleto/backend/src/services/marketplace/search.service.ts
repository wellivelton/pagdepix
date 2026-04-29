/**
 * Busca de produtos - estrutura para Algolia/Elasticsearch.
 * Por ora usa busca Prisma; quando ALGOLIA_* ou ELASTIC_* configurado, usa índice externo.
 */

import { prisma } from '../../prisma';

export interface SearchParams {
  q: string;
  category?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  products: Array<{
    id: string;
    title: string;
    slug: string;
    priceInDepix: number;
    coverImageUrl: string | null;
    category: string;
    sellerId: string;
    averageRating: number | null;
    reviewCount: number;
  }>;
  total: number;
}

/**
 * Busca produtos (Prisma fallback).
 * Para escala: integrar Algolia (npm i algoliasearch) ou Elasticsearch.
 */
export async function searchProducts(params: SearchParams): Promise<SearchResult> {
  const limit = Math.min(50, params.limit ?? 20);
  const offset = params.offset ?? 0;
  const term = (params.q || '').trim().toLowerCase();

  const where: Record<string, unknown> = {
    status: 'APPROVED',
  };

  if (params.categoryId) {
    where.categoryId = params.categoryId;
  }
  if (params.category && typeof params.category === 'string') {
    where.category = params.category;
  }

  if (term) {
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
      { slug: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (params.minPrice != null || params.maxPrice != null) {
    where.priceInDepix = {};
    if (params.minPrice != null) (where.priceInDepix as Record<string, number>).gte = params.minPrice;
    if (params.maxPrice != null) (where.priceInDepix as Record<string, number>).lte = params.maxPrice;
  }

  let orderBy: object | object[] = { createdAt: 'desc' };
  switch (params.sort) {
    case 'price_asc':
      orderBy = { priceInDepix: 'asc' };
      break;
    case 'price_desc':
      orderBy = { priceInDepix: 'desc' };
      break;
    case 'newest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'rating':
      orderBy = [{ averageRating: 'desc' as const }, { reviewCount: 'desc' as const }];
      break;
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        slug: true,
        priceInDepix: true,
        coverImageUrl: true,
        category: true,
        sellerId: true,
        averageRating: true,
        reviewCount: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      priceInDepix: p.priceInDepix,
      coverImageUrl: p.coverImageUrl,
      category: p.category,
      sellerId: p.sellerId,
      averageRating: p.averageRating,
      reviewCount: p.reviewCount,
    })),
    total,
  };
}
