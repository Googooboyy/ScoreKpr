import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// Supabase requires a config file to allow unauthenticated (anon) invocations.
// This is set via supabase/functions/bgg-search/config.toml (see below).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const query = url.searchParams.get('q') || '';

  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const bggToken = Deno.env.get('BGG_API_TOKEN');
    if (!bggToken) {
      const payload = {
        error: 'BGG_API_TOKEN is not set in environment',
      };
      return new Response(JSON.stringify(payload), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 1) Search by name
    const searchUrl = `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(query)}&type=boardgame&exact=0`;
    console.log('[bgg-search] search URL', searchUrl);
    const searchResp = await fetchWithRetry(searchUrl, bggToken);
    console.log('[bgg-search] search status', searchResp.status);
    if (!searchResp.ok) {
      const body = await searchResp.text().catch(() => '');
      const payload = {
        error: 'BGG API error (search)',
        status: searchResp.status,
        statusText: searchResp.statusText,
        body,
      };
      return new Response(JSON.stringify(payload), {
        status: searchResp.status || 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const searchXml = await searchResp.text();
    let results = parseSearchXml(searchXml);

    // Post-filter & rank results so they are actually relevant to the query.
    // BGG's search can sometimes return very fuzzy matches, so we:
    // - normalize query/name (lowercase, strip punctuation)
    // - keep only items where the normalized name contains the normalized query
    // - sort to put stronger matches (exact or word-boundary) first
    const normQuery = normalize(query);
    if (normQuery.length > 0) {
      results = results
        .filter((r) => normalize(r.name).includes(normQuery))
        .sort((a, b) => rankMatch(a.name, normQuery) - rankMatch(b.name, normQuery));
    }

    // 2) If we have results, fetch thumbnails via /thing
    const ids = results.map(r => r.bgg_id);
    if (ids.length > 0) {
      const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.slice(0, 20).join(',')}`;
      console.log('[bgg-search] thing URL', thingUrl);
      const thingResp = await fetchWithRetry(thingUrl, bggToken);
      console.log('[bgg-search] thing status', thingResp.status);
      if (thingResp.ok) {
        const thingXml = await thingResp.text();
        console.log('[bgg-search] thing xml snippet', thingXml.slice(0, 500));
        const thumbs = parseThingThumbnailsXml(thingXml);
        console.log('[bgg-search] parsed thumbnails keys', Object.keys(thumbs).slice(0, 10));
        results.forEach(r => {
          if (thumbs[r.bgg_id]) {
            r.thumbnail_url = thumbs[r.bgg_id];
          }
        });
      }
    }

    return new Response(JSON.stringify(results.slice(0, 20)), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const payload = {
      error: (e as Error).message,
    };
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

interface BggResult {
  bgg_id: number;
  name: string;
  year_published: number | null;
  thumbnail_url: string | null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, token: string, attempts = 3): Promise<Response> {
  let lastResp: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Scorekpr/1.0 (https://scorekpr.com)',
      },
    });
    if (resp.ok) return resp;
    lastResp = resp;
    if (![429, 500, 502, 503, 504].includes(resp.status)) {
      return resp;
    }
    const delay = 500 * Math.pow(2, i); // 0.5s, 1s, 2s
    await sleep(delay);
  }
  // If all retries failed, return the last response
  if (lastResp) return lastResp;
  return new Response('BGG request failed', { status: 502 });
}

function parseSearchXml(xml: string): BggResult[] {
  const results: BggResult[] = [];
  const itemRegex = /<item\s[^>]*id="(\d+)"[^>]*>/g;
  const nameRegex = /<name\s[^>]*type="primary"[^>]*value="([^"]*)"[^>]*\/>/;
  const yearRegex = /<yearpublished\s[^>]*value="([^"]*)"[^>]*\/>/;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const bggId = parseInt(match[1], 10);
    const startIdx = match.index;
    const nextItem = xml.indexOf('<item', startIdx + 1);
    const chunk = nextItem > -1 ? xml.slice(startIdx, nextItem) : xml.slice(startIdx);

    const nameMatch = nameRegex.exec(chunk);
    const yearMatch = yearRegex.exec(chunk);

    if (nameMatch) {
      results.push({
        bgg_id: bggId,
        name: decodeXmlEntities(nameMatch[1]),
        year_published: yearMatch ? parseInt(yearMatch[1], 10) || null : null,
        thumbnail_url: null,
      });
    }
  }

  return results;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function rankMatch(name: string, normQuery: string): number {
  const normName = normalize(name);
  if (normName === normQuery) return 0; // exact match
  if (normName.startsWith(normQuery + ' ') || normName.endsWith(' ' + normQuery)) return 1;
  if (normName.includes(' ' + normQuery + ' ')) return 1;
  if (normName.includes(normQuery)) return 2; // substring
  return 3;
}

function parseThingThumbnailsXml(xml: string): Record<number, string> {
  const map: Record<number, string> = {};
  const itemRegex = /<item\s[^>]*id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
  const thumbRegex = /<thumbnail[^>]*>([\s\S]*?)<\/thumbnail>/;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const bggId = parseInt(match[1], 10);
    const chunk = match[2] || '';
    const thumbMatch = thumbRegex.exec(chunk);
    if (thumbMatch && thumbMatch[1]) {
      let url = thumbMatch[1].trim();
      if (url && url.startsWith('//')) {
        url = 'https:' + url;
      }
      map[bggId] = url;
    }
  }

  return map;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
