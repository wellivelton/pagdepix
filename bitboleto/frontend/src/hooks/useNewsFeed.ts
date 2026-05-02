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

export function useNewsFeed(category: NewsCategory) {
  const [state, setState] = useState<NewsFeedState>({
    items: [],
    loading: true,
    error: false,
    fetchedAt: null,
    stale: false,
  });

  const controllerRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    controllerRef.current?.abort();
    const ctrl = new AbortController();
    controllerRef.current = ctrl;

    setState(s => ({ ...s, loading: true, error: false }));

    try {
      const { data } = await api.get('/feed', {
        params: { category, limit: 3 },
        signal: ctrl.signal,
      });
      setState({
        items: data.items || [],
        loading: false,
        error: false,
        fetchedAt: data.fetchedAt ?? null,
        stale: !!data.stale,
      });
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      setState(s => ({ ...s, loading: false, error: true }));
    }
  }, [category]);

  useEffect(() => {
    doFetch();
    const timer = setInterval(doFetch, 10 * 60 * 1000);
    return () => {
      clearInterval(timer);
      controllerRef.current?.abort();
    };
  }, [doFetch]);

  return { ...state, refetch: doFetch };
}
