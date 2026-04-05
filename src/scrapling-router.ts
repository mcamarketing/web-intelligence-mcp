/**
 * scrapling-router.ts
 * 
 * Routes scraping requests to either Scrapling bridge or Forage MCP.
 * All imports use .js extensions per Apify Docker build requirements.
 * 
 * Key principle: Always check cache first (query_knowledge + get_claims)
 * before scraping. Write back to graph after every scrape.
 */

import { graphClient, isBudgetExceeded, type EntityType } from './forage-graph-client.js';

const SCRAPLING_URL = process.env.SCRAPLING_URL || 'http://localhost:8001';
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const FORAGE_ENDPOINT = process.env.FORAGE_ENDPOINT || 'https://ernesta-labs--forage.apify.actor';

// ─── FREE SOURCES [free-001] ─────────────────────────────────────────────────

const FREE_SOURCES = [
  'api.gdeltproject.org',
  'worldvaluessurvey.org',
  'pewresearch.org',
  'overpass-api.de',
  'worldpop.org',
  'reddit.com',
  'api.coingecko.com',
  'fred.stlouisfed.org',
  'wildberries.ru'
];

// ─── TYPES [types-001] ─────────────────────────────────────────────────────

export interface PageData {
  url: string;
  title?: string;
  content?: string;
  textContent?: string;
  error?: string;
  graph_written?: boolean;
  cost_usd?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  timestamp?: string;
}

export interface ScrapingOptions {
  schema?: Record<string, string>;
  entityName?: string;
  entityType?: EntityType;
  sourceLabel?: string;
}

// ─── ROUTER [router-001] ───────────────────────────────────────────────────

export class ScraplingRouter {
  private readonly FREE_SOURCES = FREE_SOURCES;
  private scraplingHealthy: boolean | null = null;
  private lastHealthCheck = 0;
  private static readonly HEALTH_TTL_MS = 30_000; // re-check every 30s

  /**
   * Probe scrapling bridge health. Cached for 30s.
   */
  private async isScraplingReachable(): Promise<boolean> {
    if (this.scraplingHealthy !== null && Date.now() - this.lastHealthCheck < ScraplingRouter.HEALTH_TTL_MS) {
      return this.scraplingHealthy;
    }
    try {
      const resp = await fetch(`${SCRAPLING_URL}/health`, { signal: AbortSignal.timeout(3000) });
      this.scraplingHealthy = resp.ok;
    } catch {
      this.scraplingHealthy = false;
    }
    this.lastHealthCheck = Date.now();
    return this.scraplingHealthy;
  }

  /**
   * Check if URL is a free data source.
   */
  isFreeSource(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.FREE_SOURCES.some(source => hostname.includes(source));
    } catch {
      return false;
    }
  }

  /**
   * Check if we have fresh data in graph (<24h old).
   */
  private async isDataFresh(entityName: string): Promise<boolean> {
    try {
      // Get claims for entity
      const claims = await graphClient.getClaims(entityName);
      if (!claims || !claims.length) return false;
      
      // Check most recent claim timestamp
      const latestClaim = claims[0];
      if (latestClaim.created_at) {
        const claimTime = new Date(latestClaim.created_at).getTime();
        const hoursOld = (Date.now() - claimTime) / (1000 * 60 * 60);
        return hoursOld < 24;
      }
      
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Scrape a URL with routing logic:
   * 1. Check cache (query_knowledge + get_claims) - if fresh, return graph data
   * 2. If free source OR no APIFY_TOKEN → Scrapling bridge
   * 3. Otherwise → Forage scrape_page
   * 4. Bridge handles graph write-back in both paths
   */
  async scrape(url: string, opts?: ScrapingOptions): Promise<PageData> {
    // Check budget
    if (isBudgetExceeded()) {
      return {
        url,
        error: 'SESSION_BUDGET_EXCEEDED',
        graph_written: false,
        cost_usd: 0
      };
    }

    const entityName = opts?.entityName;
    
    // Step 1: Check cache if entity name provided
    if (entityName) {
      const isFresh = await this.isDataFresh(entityName);
      if (isFresh) {
        console.log(`[ROUTER] Cache hit for ${entityName}, returning graph data`);
        const cached = await graphClient.queryKnowledge(entityName);
        return {
          url,
          content: JSON.stringify(cached),
          graph_written: true,
          cost_usd: 0.05  // Only the query_knowledge cost
        };
      }
    }

    // Step 2: Determine routing
    const isFree = this.isFreeSource(url);
    const hasToken = !!APIFY_TOKEN;
    const scraplingUp = await this.isScraplingReachable();

    let result: PageData;
    let cost = 0;

    if (isFree || !hasToken) {
      // Free source or no token — MUST use Scrapling bridge
      if (!scraplingUp) {
        console.error(`[ROUTER] Scrapling bridge unreachable — rejecting scrape for ${url}`);
        return {
          url,
          error: 'SCRAPLING_BRIDGE_UNAVAILABLE: free-tier scraping requires the Scrapling service. Start it with docker compose up scrapling.',
          graph_written: false,
          cost_usd: 0
        };
      }
      console.log(`[ROUTER] Routing to Scrapling: ${url}`);
      result = await this.scrapeWithScrapling(url, opts?.schema);
      cost = 0.05; // add_claim cost
    } else if (scraplingUp) {
      // Prefer Scrapling even for paid URLs when available (cost savings)
      console.log(`[ROUTER] Routing to Scrapling (cost-save): ${url}`);
      result = await this.scrapeWithScrapling(url, opts?.schema);
      cost = 0.05;
    } else {
      // Route to Forage MCP (paid) — only when Scrapling is down AND we have a token
      console.warn(`[ROUTER] Scrapling down, falling back to paid Forage MCP: ${url}`);
      result = await this.scrapeWithForage(url, opts?.schema);
      cost = 0.12; // scrape_page + add_claim
    }

    // Step 3: Write to graph if entity name provided
    if (entityName && result.content && !result.error) {
      await this.writeToGraph(entityName, (opts?.entityType || 'Entity') as EntityType, result, opts?.sourceLabel || url, cost);
      result.graph_written = true;
    }

    result.cost_usd = cost;
    return result;
  }

  /**
   * Scrape via local Scrapling bridge.
   */
  private async scrapeWithScrapling(url: string, schema?: Record<string, string>): Promise<PageData> {
    try {
      const response = await fetch(`${SCRAPLING_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, schema })
      });
      
      if (!response.ok) {
        throw new Error(`Scrapling error: ${response.status}`);
      }
      
      const data = await response.json() as { url?: string; title?: string; content?: string; text_content?: string };
      return {
        url: data.url || url,
        title: data.title,
        content: data.content || data.text_content,
        textContent: data.text_content
      };
    } catch (e: any) {
      return {
        url,
        error: `Scrapling failed: ${e.message}`
      };
    }
  }

  /**
   * Scrape via Forage MCP endpoint.
   */
  private async scrapeWithForage(url: string, schema?: Record<string, string>): Promise<PageData> {
    try {
      const response = await fetch(`${FORAGE_ENDPOINT}/mcp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APIFY_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.random().toString(36).substring(7),
          method: 'tools/call',
          params: {
            name: 'scrape_page',
            arguments: { url }
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Forage error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      const content = data.result?.content?.[0]?.text 
        ? JSON.parse(data.result.content[0].text) 
        : {};
      
      return {
        url: content.url || url,
        title: content.title,
        content: content.content || content.text
      };
    } catch (e: any) {
      return {
        url,
        error: `Forage scrape failed: ${e.message}`
      };
    }
  }

  /**
   * Write scraped data to graph.
   */
  private async writeToGraph(
    entityName: string,
    entityType: EntityType,
    data: PageData,
    source: string,
    cost: number
  ): Promise<void> {
    try {
      // Add claim with scraped content
      await graphClient.addClaim(
        entityName,
        'SCRAPED_CONTENT',
        source,
        JSON.stringify({
          title: data.title,
          snippet: data.content?.substring(0, 500),
          scraped_at: new Date().toISOString()
        }),
        source,
        0.7
      );
      
      console.log(`[ROUTER] Wrote ${entityName} to graph, cost: $${cost}`);
    } catch (e) {
      console.error('[ROUTER] Graph write failed:', e);
    }
  }

  /**
   * Web search with routing:
   * - No APIFY_TOKEN → Scrapling bridge (DuckDuckGo)
   * - With token → Forage search_web
   */
  async search(query: string, maxResults: number = 10): Promise<SearchResult[]> {
    // Check budget
    if (isBudgetExceeded()) {
      console.warn('[ROUTER] Budget exceeded, skipping search');
      return [];
    }

    const scraplingUp = await this.isScraplingReachable();

    if (!APIFY_TOKEN) {
      if (!scraplingUp) {
        console.error(`[ROUTER] Scrapling bridge unreachable — rejecting search`);
        return [];
      }
      // Use Scrapling
      try {
        const response = await fetch(`${SCRAPLING_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, max_results: maxResults })
        });
        
        const data = await response.json() as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
        return (data.results || []).map((r) => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.snippet || ''
        }));
      } catch (e) {
        console.error('[ROUTER] Scrapling search failed:', e);
        return [];
      }
    }

    // Use Forage search_web
    try {
      const response = await fetch(`${FORAGE_ENDPOINT}/mcp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APIFY_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.random().toString(36).substring(7),
          method: 'tools/call',
          params: {
            name: 'search_web',
            arguments: { query, num_results: maxResults }
          }
        })
      });
      
      const data = await response.json() as { result?: { content?: Array<{ text?: string }> } };
      const results = data.result?.content?.[0]?.text 
        ? JSON.parse(data.result.content[0].text) 
        : [];
      
      // Add search results to graph as claims
      for (const result of results.slice(0, 5)) {
        await graphClient.addClaim(
          query,
          'SEARCH_RESULT',
          result.url,
          JSON.stringify({ title: result.title, snippet: result.snippet }),
          'search_web',
          0.5
        );
      }
      
      return results;
    } catch (e) {
      console.error('[ROUTER] Forage search failed:', e);
      return [];
    }
  }
}

// ─── EXPORT [export-001] ────────────────────────────────────────────────────

export const scraplingRouter = new ScraplingRouter();