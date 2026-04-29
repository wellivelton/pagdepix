import { Request, Response } from 'express';
import * as searchService from '../../services/marketplace/search.service';

export const searchProducts = async (req: Request, res: Response) => {
  const { q, category, categoryId, minPrice, maxPrice, sort, limit, offset } = req.query;
  try {
    const result = await searchService.searchProducts({
      q: typeof q === 'string' ? q : '',
      category: typeof category === 'string' ? category : undefined,
      categoryId: typeof categoryId === 'string' ? categoryId : undefined,
      minPrice: typeof minPrice === 'string' ? parseFloat(minPrice) : undefined,
      maxPrice: typeof maxPrice === 'string' ? parseFloat(maxPrice) : undefined,
      sort: ['relevance', 'price_asc', 'price_desc', 'newest', 'rating'].includes(String(sort))
        ? (sort as 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'rating')
        : undefined,
      limit: typeof limit === 'string' ? parseInt(limit, 10) : undefined,
      offset: typeof offset === 'string' ? parseInt(offset, 10) : undefined,
    });
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Erro na busca' });
  }
};
