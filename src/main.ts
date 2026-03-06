import { Actor } from 'apify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { knowledgeGraph } from './knowledge-graph.js';

await Actor.init();
await knowledgeGraph.init().catch(() => {}); // Silent init — never block startup

// ==========================================
// ERNESTA LABS BIBLE SECTION 5: PRICING CONFIG
// Actor.charge() values are PRE-CALCULATED to include margin after Apify's ~25% cut
// ==========================================

type ActorTier = 'native' | 'verified' | 'open';

interface ActorPricing {
  tier: ActorTier;
  actorChargeValue: number;
  unitName: string;
  description: string;
  requiresCount?: boolean;
}

// TIER 1: NATIVE TOOLS (Section 5 pricing)
const PRICING = {
  // Native Core
  SEARCH_WEB: { event: 'search-web', charge: 0.03, unit: 'per_call', net: 0.022 },
  SCRAPE_PAGE: { event: 'scrape-page', charge: 0.07, unit: 'per_call', net: 0.052 },
  GET_COMPANY_INFO: { event: 'get-company-info', charge: 0.08, unit: 'per_call', net: 0.060 },
  FIND_EMAILS: { event: 'find-emails', charge: 0.10, unit: 'per_call', net: 0.075 },
  FIND_LOCAL_LEADS: { event: 'find-local-leads', charge: 0.15, unit: 'per_call', net: 0.112 },
  FIND_LEADS: { event: 'find-leads', charge: 0.25, unit: 'per_100_leads', net: 0.187 },
  
  // Discovery
  LIST_ACTORS: { event: 'list-verified', charge: 0.01, unit: 'per_call', net: 0.007 },
  GET_SCHEMA: { event: 'get-schema', charge: 0.01, unit: 'per_call', net: 0.007 },
  
  // Knowledge Graph
  QUERY_KNOWLEDGE: { event: 'query-knowledge', charge: 0.02, unit: 'per_query', net: 0.015 },
  ENRICH_ENTITY: { event: 'enrich-entity', charge: 0.03, unit: 'per_call', net: 0.022 },
  FIND_CONNECTIONS: { event: 'find-connections', charge: 0.05, unit: 'per_call', net: 0.037 },
  
  // Open Access
  OPEN_ACCESS_MARKUP_PERCENT: 25,
  OPEN_ACCESS_MINIMUM_FEE: 0.01
};

// TIER 2: VERIFIED PARTNERS
const VERIFIED_ACTORS = new Map<string, { charge: number; unit: string; desc: string }>([
  ['apify/website-content-crawler', { charge: 0.20, unit: 'per_1000_pages', desc: 'Deep website crawling' }],
  ['apify/google-maps-scraper', { charge: 0.27, unit: 'per_1000_places', desc: 'Google Maps reviews' }],
  ['clockworks/free-twitter-scraper', { charge: 0.05, unit: 'per_1000_tweets', desc: 'Twitter/X data' }],
  ['drobnikj/pdf-to-text', { charge: 0.14, unit: 'per_100_pages', desc: 'PDF parsing' }],
  ['apify/linkedin-profile-scraper', { charge: 0.67, unit: 'per_100_profiles', desc: 'LinkedIn profiles' }],
  ['apify/instagram-scraper', { charge: 0.20, unit: 'per_1000_posts', desc: 'Instagram posts' }],
  ['code_crafter/leads-finder', { charge: 0.25, unit: 'per_100_leads', desc: 'B2B leads with emails' }],
]);

const TOOLS = [
  // Tier 1 Native
  {
    name: 'search_web',
    description: 'Google Search. Cost: $0.03/call',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        num_results: { type: 'number', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'scrape_page',
    description: 'Extract clean text from any URL. Cost: $0.07/call',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_company_info',
    description: 'Unified company intelligence. Cost: $0.08/call',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        find_emails: { type: 'boolean', default: true },
      },
      required: ['domain'],
    },
  },
  {
    name: 'find_emails',
    description: 'Email discovery via Hunter.io. Cost: $0.10/call',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        limit: { type: 'number', default: 10 },
      },
      required: ['domain'],
    },
  },
  {
    name: 'find_local_leads',
    description: 'Google Maps lead gen. Cost: $0.15/call',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        location: { type: 'string' },
        radius: { type: 'number', default: 5000 },
        max_results: { type: 'number', default: 20 },
      },
      required: ['keyword', 'location'],
    },
  },
  {
    name: 'find_leads',
    description: 'B2B leads via Apify. Cost: $0.25 per 100 leads',
    inputSchema: {
      type: 'object',
      properties: {
        job_title: { type: 'string' },
        location: { type: 'string' },
        industry: { type: 'string' },
        company_size: { type: 'string' },
        keywords: { type: 'string' },
        company_website: { type: 'string' },
        num_leads: { type: 'number', default: 100 },
        email_status: { type: 'string', default: 'verified' },
      },
      required: ['job_title'],
    },
  },
  
  // Knowledge Graph
  {
    name: 'query_knowledge',
    description: 'Query accumulated intelligence. Cost: $0.02/query',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        entity_type: { type: 'string', enum: ['Company', 'Person', 'Location', 'Industry', 'any'], default: 'any' },
        min_confidence: { type: 'number', default: 0.7 },
      },
      required: ['question'],
    },
  },
  {
    name: 'enrich_entity',
    description: 'Get everything known about a company/domain. Cost: $0.03/call',
    inputSchema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'e.g., "stripe.com" or "Stripe"' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'find_connections',
    description: 'Find relationship paths between entities. Cost: $0.05/call',
    inputSchema: {
      type: 'object',
      properties: {
        from_entity: { type: 'string' },
        to_entity: { type: 'string' },
        max_hops: { type: 'number', default: 3 },
      },
      required: ['from_entity', 'to_entity'],
    },
  },
  {
    name: 'get_graph_stats',
    description: 'Knowledge graph statistics. Free.',
    inputSchema: { type: 'object', properties: {} },
  },
  
  // Universal Gateway
  {
    name: 'list_verified_actors',
    description: 'Browse curated verified actors. Cost: $0.01/call',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', default: 'all' },
      },
    },
  },
  {
    name: 'get_actor_schema',
    description: 'Get actor schema and pricing. Cost: $0.01/call',
    inputSchema: {
      type: 'object',
      properties: {
        actor_id: { type: 'string' },
      },
      required: ['actor_id'],
    },
  },
  {
    name: 'call_actor',
    description: 'Run any Apify actor (Verified + Open). Cost: actor-specific + 25% platform fee',
    inputSchema: {
      type: 'object',
      properties: {
        actor_id: { type: 'string' },
        input: { type: 'object' },
        timeout_secs: { type: 'number', default: 120 },
        max_cost_usd: { type: 'number' },
      },
      required: ['actor_id', 'input'],
    },
  },
];

// ==========================================
// MCP SERVER SETUP
// ==========================================

const mcpServer = new Server(
  {
    name: 'web-intelligence-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`[Forage] ${name}`, args);

  try {
    switch (name) {
      // Tier 1 Native
      case 'search_web': return await handleSearchWeb(args as any);
      case 'scrape_page': return await handleScrapePage(args as any);
      case 'get_company_info': return await handleGetCompanyInfo(args as any);
      case 'find_emails': return await handleFindEmails(args as any);
      case 'find_local_leads': return await handleFindLocalLeads(args as any);
      case 'find_leads': return await handleFindLeads(args as any);
      
      // Knowledge Graph
      case 'query_knowledge': return await handleQueryKnowledge(args as any);
      case 'enrich_entity': return await handleEnrichEntity(args as any);
      case 'find_connections': return await handleFindConnections(args as any);
      case 'get_graph_stats': return await handleGetGraphStats();
      
      // Universal Gateway
      case 'list_verified_actors': return await handleListVerifiedActors(args as any);
      case 'get_actor_schema': return await handleGetActorSchema(args as any);
      case 'call_actor': return await handleCallActor(args as any);
      
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`[Forage] Error:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// ==========================================
// HANDLERS
// ==========================================

async function handleSearchWeb({ query, num_results = 10 }: { query: string; num_results?: number }) {
  await Actor.charge({ eventName: PRICING.SEARCH_WEB.event, count: 1 });
  
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY not configured');

  const response = await axios.get('https://serpapi.com/search', {
    params: { q: query, api_key: key, engine: 'google', num: Math.min(num_results, 20) },
    timeout: 30000,
  });

  const results = response.data.organic_results?.map((r: any) => ({
    title: r.title, link: r.link, snippet: r.snippet
  })) || [];

  const res = { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({ query, results, cost_usd: PRICING.SEARCH_WEB.charge }, null, 2) 
    }] 
  };
  
  knowledgeGraph.ingest('search_web', { query, results }).catch(() => {});
  return res;
}

async function handleScrapePage({ url }: { url: string }) {
  await Actor.charge({ eventName: PRICING.SCRAPE_PAGE.event, count: 1 });

  const jinaKey = process.env.JINA_AI_KEY;
  let content: string;
  let title: string;

  if (jinaKey) {
    const cleanUrl = url.replace(/^https?:\/\//, '');
    const res = await axios.get(`https://r.jina.ai/https://${cleanUrl}`, {
      headers: { Authorization: `Bearer ${jinaKey}` },
      timeout: 30000,
    });
    const lines = res.data.split('\n');
    title = lines[0].replace(/^Title: /, '');
    content = lines.slice(1).join('\n').replace(/^Content: /, '').trim();
  } else {
    const res = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(res.data);
    title = $('title').text();
    content = ($('main, article, .content').first().text() || $('body').text()).replace(/\s+/g, ' ').trim();
  }

  const response = { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({ url, title, content, cost_usd: PRICING.SCRAPE_PAGE.charge }, null, 2) 
    }] 
  };
  
  knowledgeGraph.ingest('scrape_page', { url, title, content }).catch(() => {});
  return response;
}

async function handleGetCompanyInfo({ domain, find_emails = true }: { domain: string; find_emails?: boolean }) {
  await Actor.charge({ eventName: PRICING.GET_COMPANY_INFO.event, count: 1 });

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  let websiteData = {};
  let emailData = null;

  try {
    const res = await axios.get(`https://r.jina.ai/https://${cleanDomain}`, {
      headers: { Authorization: `Bearer ${process.env.JINA_AI_KEY}` },
      timeout: 15000,
    });
    const lines = res.data.split('\n');
    websiteData = {
      title: lines[0]?.replace(/^Title: /, ''),
      description: lines[1]?.replace(/^Content: /, '').substring(0, 500),
    };
  } catch (e) {
    websiteData = { error: 'Could not fetch website' };
  }

  if (find_emails) {
    try {
      emailData = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain: cleanDomain, api_key: process.env.HUNTER_API_KEY },
        timeout: 15000,
      }).then(r => r.data.data);
    } catch (e) {
      emailData = { error: 'Email search failed' };
    }
  }

  const res = {
    content: [{
      type: 'text',
      text: JSON.stringify({
        domain: cleanDomain,
        website: websiteData,
        email_intelligence: emailData,
        cost_usd: PRICING.GET_COMPANY_INFO.charge,
        timestamp: new Date().toISOString(),
      }, null, 2),
    }],
  };
  
  knowledgeGraph.ingest('get_company_info', { domain: cleanDomain, website: websiteData, email_intelligence: emailData }).catch(() => {});
  return res;
}

async function handleFindEmails({ domain, limit = 10 }: { domain: string; limit?: number }) {
  await Actor.charge({ eventName: PRICING.FIND_EMAILS.event, count: 1 });

  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error('HUNTER_API_KEY not configured');

  const { data } = await axios.get('https://api.hunter.io/v2/domain-search', {
    params: { domain, api_key: key, limit },
    timeout: 15000,
  });

  const emails = data.data?.emails?.map((e: any) => ({
    email: e.value,
    type: e.type,
    confidence: e.confidence,
    first_name: e.first_name,
    last_name: e.last_name,
    position: e.position,
    seniority: e.seniority,
    department: e.department,
    linkedin: e.linkedin,
    phone_number: e.phone_number,
  })) || [];

  const res = {
    content: [{
      type: 'text',
      text: JSON.stringify({
        domain,
        organization: data.data?.organization,
        emails_found: emails.length,
        pattern: data.data?.pattern,
        emails,
        cost_usd: PRICING.FIND_EMAILS.charge,
      }, null, 2),
    }],
  };
  
  knowledgeGraph.ingest('find_emails', { domain, organization: data.data?.organization, pattern: data.data?.pattern, emails }).catch(() => {});
  return res;
}

async function handleFindLocalLeads({ keyword, location, radius = 5000, max_results = 20 }: any) {
  await Actor.charge({ eventName: PRICING.FIND_LOCAL_LEADS.event, count: 1 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const query = `${keyword} in ${location}`;
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
    params: { query, radius, key, maxResults: max_results },
  });

  const leads = await Promise.all(
    (data.results || []).slice(0, max_results).map(async (place: any) => {
      try {
        const details = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: { place_id: place.place_id, fields: 'website,formatted_phone_number', key },
        });
        return {
          name: place.name,
          address: place.formatted_address,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total,
          place_id: place.place_id,
          website: details.data.result?.website,
          phone: details.data.result?.formatted_phone_number,
          location: place.geometry?.location,
        };
      } catch (e) {
        return {
          name: place.name,
          address: place.formatted_address,
          rating: place.rating,
          place_id: place.place_id,
        };
      }
    })
  );

  const res = { 
    content: [{ 
      type: 'text', 
      text: JSON.stringify({ keyword, location, leads, cost_usd: PRICING.FIND_LOCAL_LEADS.charge }, null, 2) 
    }] 
  };
  
  knowledgeGraph.ingest('find_local_leads', { keyword, location, leads }).catch(() => {});
  return res;
}

async function handleFindLeads(args: any) {
  const { job_title, location, industry, company_size, keywords, company_website, num_leads = 100, email_status = 'verified' } = args;
  
  const chargeUnits = Math.ceil(num_leads / 100);
  await Actor.charge({ eventName: PRICING.FIND_LEADS.event, count: chargeUnits });
  
  const actorInput = {
    leadsCount: Math.min(num_leads, 1000),
    fileName: `leads_${Date.now()}`,
    jobTitle: job_title,
    locationInclude: location || '',
    locationExclude: '',
    emailStatus: email_status,
    companyWebsite: company_website || '',
    size: company_size || '',
    industry: industry || '',
    keywords: keywords || '',
    revenue: '',
    funding: ''
  };

  const run = await Actor.start('code_crafter/leads-finder', actorInput);
  console.log(`[Forage] Leads run: ${run.id}`);
  
  const timeout = 5 * 60 * 1000;
  const startTime = Date.now();
  let pollInterval = 2000;
  
  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for leads-finder (run ID: ${run.id})`);
    }
    
    const runInfo = await Actor.apifyClient.run(run.id).get();
    
    // FIX: TypeScript type narrowing with non-null assertion
    if (!runInfo) throw new Error('Failed to get run info');
    
    if (runInfo.status === 'SUCCEEDED') {
      const allItems: any[] = [];
      let offset = 0;
      const pageLimit = 250;
      
      while (true) {
        // FIX: Use non-null assertion for defaultDatasetId
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ 
          offset, 
          limit: pageLimit 
        });
        const items = result.items ?? [];
        allItems.push(...items);
        offset += items.length;
        if (items.length === 0 || items.length < pageLimit) break;
      }
      
      const formattedLeads = allItems.map((lead: any) => ({
        name: lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        title: lead.title || lead.jobTitle,
        company: lead.company || lead.organization,
        email: lead.email,
        email_status: lead.emailStatus || lead.email_verified,
        linkedin: lead.linkedin || lead.linkedinUrl,
        location: lead.location,
        industry: lead.industry,
        company_size: lead.companySize || lead.size,
        website: lead.website || lead.companyWebsite,
        phone: lead.phone,
      }));
      
      const response = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: { job_title, location, industry },
            leads_found: formattedLeads.length,
            cost_usd: PRICING.FIND_LEADS.charge * chargeUnits,
            leads: formattedLeads,
            actor_run_id: run.id
          }, null, 2),
        }],
      };
      
      knowledgeGraph.ingest('find_leads', { leads: formattedLeads }).catch(() => {});
      return response;
    }
    
    // FIX: Use non-null assertion for status checks
    if (['FAILED', 'TIMED_OUT', 'ABORTED'].includes(runInfo.status!)) {
      throw new Error(`Leads finder ${runInfo.status}: ${runInfo.statusMessage || 'Unknown error'}`);
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }
}

// ==========================================
// KNOWLEDGE GRAPH HANDLERS
// ==========================================

async function handleQueryKnowledge(args: any) {
  await Actor.charge({ eventName: PRICING.QUERY_KNOWLEDGE.event, count: 1 });
  const result = await knowledgeGraph.findEntity(args.question, args.entity_type !== 'any' ? args.entity_type : undefined);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        question: args.question,
        results: result,
        cost_usd: PRICING.QUERY_KNOWLEDGE.charge
      }, null, 2)
    }]
  };
}

async function handleEnrichEntity(args: any) {
  await Actor.charge({ eventName: PRICING.ENRICH_ENTITY.event, count: 1 });
  const result = await knowledgeGraph.enrich(args.identifier);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        identifier: args.identifier,
        ...result,
        cost_usd: PRICING.ENRICH_ENTITY.charge
      }, null, 2)
    }]
  };
}

async function handleFindConnections(args: any) {
  await Actor.charge({ eventName: PRICING.FIND_CONNECTIONS.event, count: 1 });
  const result = await knowledgeGraph.findConnections(args.from_entity, args.to_entity, args.max_hops);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ...result,
        cost_usd: PRICING.FIND_CONNECTIONS.charge
      }, null, 2)
    }]
  };
}

async function handleGetGraphStats() {
  const stats = await knowledgeGraph.getStats();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ knowledge_graph: stats }, null, 2)
    }]
  };
}

// ==========================================
// UNIVERSAL GATEWAY HANDLERS
// ==========================================

async function handleListVerifiedActors({ category = 'all' }: { category?: string }) {
  await Actor.charge({ eventName: PRICING.LIST_ACTORS.event, count: 1 });
  
  const verified = Array.from(VERIFIED_ACTORS.entries())
    .map(([actorId, pricing]) => ({
      actor_id: actorId,
      name: actorId.split('/').pop(),
      description: pricing.desc,
      cost_usd: pricing.charge,
      unit: pricing.unit,
    }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        actors: category === 'all' ? verified : verified.filter(a => a.description?.includes(category)),
        cost_usd: PRICING.LIST_ACTORS.charge
      }, null, 2),
    }]
  };
}

async function handleGetActorSchema({ actor_id }: { actor_id: string }) {
  await Actor.charge({ eventName: PRICING.GET_SCHEMA.event, count: 1 });

  const response = await axios.get(`https://api.apify.com/v2/acts/${actor_id}`, {
    headers: process.env.APIFY_TOKEN ? { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : {}
  });
  
  const actor = response.data.data;
  const pricing = VERIFIED_ACTORS.get(actor_id);
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        actor_id,
        name: actor.name,
        is_verified: !!pricing,
        cost_estimate: pricing ? { usd: pricing.charge, unit: pricing.unit } : 'Dynamic (25% markup)',
        input_schema: actor.input?.schema || actor.inputSchema || { warning: 'No schema', example: actor.exampleRunInput },
        cost_usd: PRICING.GET_SCHEMA.charge
      }, null, 2),
    }],
  };
}

async function handleCallActor({ actor_id, input, timeout_secs = 120, max_cost_usd }: any) {
  const verified = VERIFIED_ACTORS.get(actor_id);
  let estimatedCost = verified ? verified.charge : PRICING.OPEN_ACCESS_MINIMUM_FEE;
  
  if (!verified) {
    try {
      const res = await axios.get(`https://api.apify.com/v2/acts/${actor_id}`, {
        headers: process.env.APIFY_TOKEN ? { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : {}
      });
      const basePrice = res.data.data?.pricingInfos?.[0]?.pricePerUnit || 0;
      const markup = Math.max(basePrice * (PRICING.OPEN_ACCESS_MARKUP_PERCENT / 100), PRICING.OPEN_ACCESS_MINIMUM_FEE);
      estimatedCost = basePrice + markup;
    } catch (e) {
      estimatedCost = PRICING.OPEN_ACCESS_MINIMUM_FEE;
    }
  }

  if (max_cost_usd !== undefined && estimatedCost > max_cost_usd) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          actor_id,
          requested_max: max_cost_usd,
          estimated_cost: estimatedCost,
          message: `Cost exceeds max_cost_usd`
        }, null, 2)
      }],
      isError: true
    };
  }

  await Actor.charge({ eventName: 'call-actor', count: 1 });

  const run = await Actor.start(actor_id, input);
  const startTime = Date.now();
  const timeout = timeout_secs * 1000;
  let pollInterval = 2000;

  while (true) {
    if (Date.now() - startTime > timeout) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'TIMEOUT',
            actor_id,
            run_id: run.id,
            monitor_url: `https://console.apify.com/actors/runs/${run.id}`
          }, null, 2)
        }]
      };
    }

    const runInfo = await Actor.apifyClient.run(run.id).get();
    
    if (!runInfo) throw new Error('Failed to retrieve run information');
    
    if (runInfo.status === 'SUCCEEDED') {
      const items: any[] = [];
      let offset = 0;
      
      while (true) {
        // FIX: Non-null assertion for defaultDatasetId
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ offset, limit: 1000 });
        items.push(...result.items);
        offset += result.items.length;
        if (result.items.length < 1000) break;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCEEDED',
            actor_id,
            run_id: run.id,
            estimated_cost: estimatedCost,
            dataset_items: items.length,
            sample: items.slice(0, 10)
          }, null, 2)
        }]
      };
    }

    if (['FAILED', 'ABORTED'].includes(runInfo.status!)) {
      throw new Error(`Actor failed: ${runInfo.statusMessage}`);
    }

    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  if (process.env.TRANSPORT === 'sse') {
    const port = parseInt(process.env.PORT || '3000');
    const http = await import('http');
    const express = await import('express');
    
    const app = express.default();
    const activeTransports = new Map<string, SSEServerTransport>();

    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      res.on('close', () => activeTransports.delete(sessionId));
      await mcpServer.connect(transport);
      console.log(`[Forage] Connected: ${sessionId}`);
    });

    app.post('/messages', express.default.json(), async (req, res) => {
      const sessionId = req.query.sessionId as string;
      if (!sessionId || !activeTransports.has(sessionId)) {
        return res.status(400).json({ error: 'Invalid sessionId' });
      }
      await activeTransports.get(sessionId)!.handlePostMessage(req, res);
    });

    http.createServer(app).listen(port, () => {
      console.log(`[Forage] Gateway on port ${port}`);
    });
  } else {
    await mcpServer.connect(new StdioServerTransport());
    console.error('[Forage] Gateway on stdio');
  }
}

process.on('SIGINT', async () => { await mcpServer.close(); process.exit(0); });
process.on('SIGTERM', async () => { await mcpServer.close(); process.exit(0); });

main().catch(console.error);
