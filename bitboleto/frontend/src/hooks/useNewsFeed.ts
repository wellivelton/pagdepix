import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

export type NewsCategory = 'all' | 'crypto' | 'finance' | 'politics' | 'brasil';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  source: string;
  url: string;
  category: 'crypto' | 'finance' | 'politics' | 'brasil';
  publishedAt: string;
}

interface NewsFeedState {
  items: NewsItem[];
  loading: boolean;
  error: boolean;
  fetchedAt: string | null;
  stale: boolean;
}

interface CacheEntry {
  items: NewsItem[];
  fetchedAt: string | null;
  stale: boolean;
  ts: number;
}

const POLL_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export function useNewsFeed(category: NewsCategory) {
  const [state, setState] = useState<NewsFeedState>({
    items: [],
    loading: true,
    error: false,
    fetchedAt: null,
    stale: false,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Partial<Record<NewsCategory, CacheEntry>>>({});

  const doFetch = useCallback(async (cat: NewsCategory, background = false) => {
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    if (!background) setState(s => ({ ...s, loading: true, error: false }));

    try {
      const { data } = await api.get('/feed', {
        params: { category: cat, limit: 3 },
        signal: ctrl.signal,
      });
      const entry: CacheEntry = {
        items: data.items || [],
        fetchedAt: data.fetchedAt ?? null,
        stale: !!data.stale,
        ts: Date.now(),
      };
      cacheRef.current[cat] = entry;
      setState({
        items: entry.items,
        loading: false,
        error: false,
        fetchedAt: entry.fetchedAt,
        stale: entry.stale,
      });
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      setState(s => ({ ...s, loading: false, error: true }));
    }
  }, []);

  useEffect(() => {
    const cached = cacheRef.current[category];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setState({
        items: cached.items,
        loading: false,
        error: false,
        fetchedAt: cached.fetchedAt,
        stale: cached.stale,
      });
    } else {
      doFetch(category);
    }

    const timer = setInterval(() => doFetch(category, true), POLL_MS);
    return () => {
      clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [category, doFetch]);

  return { ...state, refetch: () => doFetch(category) };
}
