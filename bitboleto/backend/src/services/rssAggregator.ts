import Parser from 'rss-parser';
import { createHash } from 'node:crypto';

export interface RssNewsItem {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  source: string;
  url: string;
  category: 'brasil';
  publishedAt: string;
}

const parser = new Parser({
  headers: {
    'User-Agent': 'PagDePix-NewsAggregator/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
  timeout: 8000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
    ],
  },
});

const JOVEM_PAN_FEEDS = [
  { url: 'https://jovempan.com.br/feed', editoria: 'geral' },
  { url: 'https://jovempan.com.br/noticias/economia/feed', editoria: 'economia' },
  { url: 'https://jovempan.com.br/noticias/politica/feed', editoria: 'politica' },
  { url: 'https://jovempan.com.br/noticias/brasil/feed', editoria: 'brasil' },
];

function hashUrl(url: string): string {
  return 'jp_' + createHash('sha1').update(url).digest('hex').slice(0, 16);
}

function cleanText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDescription(item: any): string {
  const raw = item.contentSnippet || item.description || item.contentEncoded || '';
  return cleanText(raw).slice(0, 280);
}

function extractThumbnail(item: any): string | null {
  // 1. media:content
  if (Array.isArray(item.mediaContent)) {
    const img = item.mediaContent.find(
      (m: any) => m?.$ && (m.$.medium === 'image' || m.$.type?.startsWith('image/')),
    );
    if (img?.$?.url) return img.$.url;
  }

  // 2. media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;

  // 3. enclosure
  if (item.enclosure?.url && item.enclosure?.type?.startsWith('image/')) return item.enclosure.url;

  // 4. first <img> in HTML content
  const html = item.contentEncoded || item.content || item.description || '';
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  if (match) return match[1];

  return null;
}

function normalizeItem(rawItem: any): RssNewsItem | null {
  const url = rawItem.link || '';
  if (!url) return null;

  return {
    id: hashUrl(url),
    title: cleanText(rawItem.title || ''),
    description: extractDescription(rawItem),
    thumbnail: extractThumbnail(rawItem),
    source: 'Jovem Pan',
    url,
    category: 'brasil',
    publishedAt: rawItem.isoDate || rawItem.pubDate || new Date().toISOString(),
  };
}

async function fetchSingleFeed(url: string): Promise<RssNewsItem[]> {
  const start = Date.now();
  const feed = await parser.parseURL(url);
  const items = (feed.items || [])
    .map(normalizeItem)
    .filter((item): item is RssNewsItem => item !== null);
  console.log(`[rss:jovempan] ${url} → ${items.length} items in ${Date.now() - start}ms`);
  return items;
}

export async function fetchJovemPan(): Promise<RssNewsItem[]> {
  const start = Date.now();
  const results = await Promise.allSettled(
    JOVEM_PAN_FEEDS.map(f => fetchSingleFeed(f.url)),
  );

  let okCount = 0;
  const items: RssNewsItem[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      okCount++;
      items.push(...result.value);
    } else {
      console.error('[rss:jovempan] feed failed:', result.reason?.message ?? result.reason);
    }
  }

  // Dedup by URL
  const seen = new Set<string>();
  const deduped = items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const sorted = deduped
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 15);

  console.log(`[rss:jovempan] feeds ok: ${okCount}/${JOVEM_PAN_FEEDS.length} | total: ${sorted.length} items in ${Date.now() - start}ms`);
  return sorted;
}
