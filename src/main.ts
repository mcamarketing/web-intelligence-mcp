import { Actor } from 'apify';
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { graphClient } from './forage-graph-client.js';

await Actor.init();

// ==========================================
// ERNESTA LABS BIBLE SECTION 5: PRICING CONFIG
// ==========================================

const PRICING = {
  // Native Core
  SEARCH_WEB: { event: 'search-web', charge: 0.03, unit: 'per_call', net: 0.022 },
  SCRAPE_PAGE: { event: 'scrape-page', charge: 0.07, unit: 'per_call', net: 0.052 },
  GET_COMPANY_INFO: { event: 'get-company-info', charge: 0.08, unit: 'per_call', net: 0.060 },
  FIND_EMAILS: { event: 'find-emails', charge: 0.10, unit: 'per_call', net: 0.075 },
  FIND_LOCAL_LEADS: { event: 'find-local-leads', charge: 0.15, unit: 'per_call', net: 0.112 },
  FIND_LEADS: { event: 'find-leads', charge: 0.25, unit: 'per_100_leads', net: 0.187 },
  LIST_ACTORS: { event: 'list-verified', charge: 0.01, unit: 'per_call', net: 0.007 },
  GET_SCHEMA: { event: 'get-schema', charge: 0.01, unit: 'per_call', net: 0.007 },
  // Knowledge Graph — Premium pricing (no competitors offer persistent graph + causal analysis)
  QUERY_KNOWLEDGE: { event: 'query-knowledge', charge: 0.05, unit: 'per_query', net: 0.037 },
  ENRICH_ENTITY: { event: 'enrich-entity', charge: 0.08, unit: 'per_call', net: 0.060 },
  FIND_CONNECTIONS: { event: 'find-connections', charge: 0.12, unit: 'per_call', net: 0.090 },
  // Graph Advanced
  GET_CLAIMS: { event: 'get-claims', charge: 0.05, unit: 'per_call', net: 0.037 },
  ADD_CLAIM: { event: 'add-claim', charge: 0.05, unit: 'per_call', net: 0.037 },
  GET_REGIME: { event: 'get-regime', charge: 0.03, unit: 'per_call', net: 0.022 },
  SET_REGIME: { event: 'set-regime', charge: 0.03, unit: 'per_call', net: 0.022 },
  GET_SIGNALS: { event: 'get-signals', charge: 0.05, unit: 'per_call', net: 0.037 },
  ADD_SIGNAL: { event: 'add-signal', charge: 0.05, unit: 'per_call', net: 0.037 },
  CAUSAL_PARENTS: { event: 'causal-parents', charge: 0.08, unit: 'per_call', net: 0.060 },
  CAUSAL_CHILDREN: { event: 'causal-children', charge: 0.08, unit: 'per_call', net: 0.060 },
  CAUSAL_PATH: { event: 'causal-path', charge: 0.15, unit: 'per_call', net: 0.112 },
  SIMULATE: { event: 'simulate', charge: 0.25, unit: 'per_call', net: 0.187 },
  LIST_REGIME: { event: 'list-regime-entities', charge: 0.05, unit: 'per_call', net: 0.037 },
  OPEN_ACCESS_MARKUP_PERCENT: 25,
  OPEN_ACCESS_MINIMUM_FEE: 0.01,
  // Original Skills
  SKILL_COMPANY_DOSSIER: { event: 'skill-company-dossier', charge: 0.50 },
  SKILL_PROSPECT_COMPANY: { event: 'skill-prospect-company', charge: 0.75 },
  SKILL_OUTBOUND_LIST: { event: 'skill-outbound-list', charge: 3.50 },
  SKILL_LOCAL_MARKET_MAP: { event: 'skill-local-market-map', charge: 0.80 },
  SKILL_COMPETITOR_INTEL: { event: 'skill-competitor-intel', charge: 0.80 },
  SKILL_DECISION_MAKER: { event: 'skill-decision-maker', charge: 1.00 },
  // New Skills
  SKILL_COMPETITOR_ADS: { event: 'skill-competitor-ads', charge: 0.65 },
  SKILL_JOB_SIGNALS: { event: 'skill-job-signals', charge: 0.55 },
  SKILL_TECH_STACK: { event: 'skill-tech-stack', charge: 0.45 },
  SKILL_FUNDING_INTEL: { event: 'skill-funding-intel', charge: 0.70 },
  SKILL_SOCIAL_PROOF: { event: 'skill-social-proof', charge: 0.55 },
  SKILL_MARKET_MAP: { event: 'skill-market-map', charge: 1.20 },
  SKILL_KASPR_ENRICH: { event: 'skill-kaspr-enrich', charge: 0.75 },
};

const VERIFIED_ACTORS = new Map<string, { charge: number; unit: string; desc: string }>([
  ['apify/website-content-crawler', { charge: 0.20, unit: 'per_1000_pages', desc: 'Deep website crawling' }],
  ['apify/google-maps-scraper', { charge: 0.27, unit: 'per_1000_places', desc: 'Google Maps reviews' }],
  ['clockworks/free-twitter-scraper', { charge: 0.05, unit: 'per_1000_tweets', desc: 'Twitter/X data' }],
  ['drobnikj/pdf-to-text', { charge: 0.14, unit: 'per_100_pages', desc: 'PDF parsing' }],
  ['apify/linkedin-profile-scraper', { charge: 0.67, unit: 'per_100_profiles', desc: 'LinkedIn profiles' }],
  ['apify/instagram-scraper', { charge: 0.20, unit: 'per_1000_posts', desc: 'Instagram posts' }],
  ['code_crafter/leads-finder', { charge: 0.25, unit: 'per_100_leads', desc: 'B2B leads with emails' }],
]);

// ==========================================
// FREE CREDIT SYSTEM ($1 per user)
// ==========================================

const FREE_CREDIT_USD = 1.0;
const userCredits = new Map<string, number>();
let currentApiToken = '';

function getUserCredit(apiToken: string): number {
  if (!userCredits.has(apiToken)) {
    userCredits.set(apiToken, FREE_CREDIT_USD);
  }
  return userCredits.get(apiToken)!;
}

function applyCredit(cost: number): { charged: number; freeUsed: number; remaining: number } {
  const apiToken = currentApiToken;
  if (!apiToken) return { charged: cost, freeUsed: 0, remaining: 0 };
  
  const remaining = getUserCredit(apiToken);
  let freeUsed = 0;
  let charged = cost;

  if (remaining > 0) {
    freeUsed = Math.min(remaining, cost);
    charged = cost - freeUsed;
    const newRemaining = remaining - freeUsed;
    userCredits.set(apiToken, Math.max(0, newRemaining));
  }

  return { charged, freeUsed, remaining: getUserCredit(apiToken) };
}

function getUserRemainingCredit(): number {
  return getUserCredit(currentApiToken);
}

function extractToken(authHeader: string | undefined): string {
  if (!authHeader) return '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  if (authHeader.startsWith('Token ')) return authHeader.slice(6);
  return authHeader;
}

const TOOLS = [
  // CORE TOOLS
  { name: 'search_web', description: 'Real-time web search. Use for current information, news, or when you need results stored in knowledge graph. Returns titles, URLs, snippets. Cost: $0.03', inputSchema: { type: 'object', properties: { query: { type: 'string' }, num_results: { type: 'number', default: 10 } }, required: ['query'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'scrape_page', description: 'Extract clean text content from any URL. Use when you need webpage content as structured text. Returns title and body text. Cost: $0.07', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_company_info', description: 'Get website summary and email contacts for a company domain. Use for quick company overview. For comprehensive profiles use skill_company_dossier instead. Cost: $0.08', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, find_emails: { type: 'boolean', default: true } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'find_emails', description: 'Find verified email addresses for people at a company. Returns name, email, title, seniority, department, LinkedIn, and confidence score. Use when you need contact emails for a specific domain. Cost: $0.10', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'find_local_leads', description: 'Find local businesses by type and location. Returns name, address, phone, website, rating, review count. Use for local service businesses (dentists, plumbers, restaurants). For B2B tech leads use find_leads instead. Cost: $0.15', inputSchema: { type: 'object', properties: { keyword: { type: 'string' }, location: { type: 'string' }, radius: { type: 'number', default: 5000 }, max_results: { type: 'number', default: 20 } }, required: ['keyword', 'location'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'find_leads', description: 'Generate B2B lead list with verified emails. Filter by job_title, location, industry, company_size. Returns name, email, title, company, LinkedIn. Use for outbound sales prospecting. For local businesses use find_local_leads instead. Cost: $0.25/100 leads', inputSchema: { type: 'object', properties: { job_title: { type: 'string' }, location: { type: 'string' }, industry: { type: 'string' }, company_size: { type: 'string' }, keywords: { type: 'string' }, company_website: { type: 'string' }, num_leads: { type: 'number', default: 100 }, email_status: { type: 'string', default: 'verified' } }, required: ['job_title'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'query_knowledge', description: 'Search the knowledge graph for previously researched entities. Use to recall companies, people, or facts from past Forage tool calls. Only returns data from your previous research, not live data. Cost: $0.02', inputSchema: { type: 'object', properties: { question: { type: 'string' }, entity_type: { type: 'string', enum: ['Company', 'Person', 'Location', 'Industry', 'any'], default: 'any' }, min_confidence: { type: 'number', default: 0.7 } }, required: ['question'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'enrich_entity', description: 'Retrieve all accumulated data about a company from the knowledge graph. Use after previous research to get full entity profile. For fresh data use get_company_info or skill_company_dossier instead. Cost: $0.03', inputSchema: { type: 'object', properties: { identifier: { type: 'string', description: 'e.g., "stripe.com" or "Stripe"' } }, required: ['identifier'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'find_connections', description: 'Discover relationships between two entities in the knowledge graph. Returns connection paths (shared investors, employees, customers). Only works with previously researched entities. Cost: $0.05', inputSchema: { type: 'object', properties: { from_entity: { type: 'string' }, to_entity: { type: 'string' }, max_hops: { type: 'number', default: 3 } }, required: ['from_entity', 'to_entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_graph_stats', description: 'View knowledge graph statistics: total entities, relationships, data sources. Use to understand what data has been accumulated. Free', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true, destructiveHint: false } },
  // GRAPH ADVANCED TOOLS
  { name: 'get_claims', description: 'Retrieve all claims/provenance assertions for an entity from the knowledge graph. Returns sourced assertions with confidence scores. Use for evidence-backed research. Cost: $0.02', inputSchema: { type: 'object', properties: { entity: { type: 'string', description: 'Company or entity name' } }, required: ['entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'add_claim', description: 'Add a provenance claim to the knowledge graph. Stores entity relationship assertions with source URL and confidence. Use to build evidence base. Cost: $0.02', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, relation: { type: 'string' }, target: { type: 'string' }, assertion: { type: 'string' }, source_url: { type: 'string' }, confidence: { type: 'number', default: 0.8 } }, required: ['entity', 'relation', 'target', 'assertion'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'get_regime', description: 'Get the current regime label for an entity (normal, stressed, pre_tipping, post_event). Use to understand entity stability. Cost: $0.01', inputSchema: { type: 'object', properties: { entity: { type: 'string' } }, required: ['entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'set_regime', description: 'Set the regime label for an entity. Values: normal, stressed, pre_tipping, post_event. Use to mark entity stability state. Cost: $0.01', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, regime: { type: 'string', enum: ['normal', 'stressed', 'pre_tipping', 'post_event'] } }, required: ['entity', 'regime'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'get_signals', description: 'Retrieve time-series signal data for an entity. Returns historical data points for metrics. Use for trend analysis. Cost: $0.02', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, metric: { type: 'string' }, limit: { type: 'number', default: 100 } }, required: ['entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'add_signal', description: 'Add a time-series data point for an entity. Stores metric value with timestamp in knowledge graph. Use to track metrics over time. Cost: $0.02', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, metric: { type: 'string' }, value: { type: 'number' }, timestamp: { type: 'number' } }, required: ['entity', 'metric', 'value'] }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'get_causal_parents', description: 'Find entities that drive/caused this entity upstream. Returns causal relationships with weights. Use for root cause analysis. Cost: $0.03', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_causal_children', description: 'Find entities this entity drives downstream. Returns causal relationships with weights. Use for impact analysis. Cost: $0.03', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, limit: { type: 'number', default: 10 } }, required: ['entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_causal_path', description: 'Find the highest causal-weight path between two entities. Returns path with mechanism details. Use for understanding influence chains. Cost: $0.05', inputSchema: { type: 'object', properties: { from_entity: { type: 'string' }, to_entity: { type: 'string' } }, required: ['from_entity', 'to_entity'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'simulate', description: 'Simulate a shock/boost/remove intervention on an entity. Propagates impact through causal graph with attenuation. Returns affected entities and residual impacts. Use for scenario planning. Cost: $0.10', inputSchema: { type: 'object', properties: { entity: { type: 'string' }, intervention: { type: 'string', enum: ['shock', 'boost', 'remove'] }, depth: { type: 'number', default: 3 } }, required: ['entity', 'intervention'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'list_regime_entities', description: 'List all entities with a specific regime label. Use to find stressed or pre_tipping entities. Cost: $0.02', inputSchema: { type: 'object', properties: { regime: { type: 'string', enum: ['normal', 'stressed', 'pre_tipping', 'post_event'] } }, required: ['regime'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'list_regime_entities', description: 'List all entities with a specific regime label. Use to find stressed or pre_tipping entities. Cost: $0.02', inputSchema: { type: 'object', properties: { regime: { type: 'string', enum: ['normal', 'stressed', 'pre_tipping', 'post_event'] } }, required: ['regime'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'list_verified_actors', description: 'List available Apify actors that can be run via call_actor. Returns actor IDs, descriptions, and pricing. Use before call_actor to find the right actor. Cost: $0.01', inputSchema: { type: 'object', properties: { category: { type: 'string', default: 'all' } } }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_actor_schema', description: 'Get input schema and pricing for a specific Apify actor. Use before call_actor to understand required parameters. Cost: $0.01', inputSchema: { type: 'object', properties: { actor_id: { type: 'string' } }, required: ['actor_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'call_actor', description: 'Execute any Apify actor with custom input. Use list_verified_actors and get_actor_schema first to find actors and understand inputs. Set max_cost_usd to limit spending. Cost: actor price + 25%', inputSchema: { type: 'object', properties: { actor_id: { type: 'string' }, input: { type: 'object' }, timeout_secs: { type: 'number', default: 120 }, max_cost_usd: { type: 'number' } }, required: ['actor_id', 'input'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  // ORIGINAL SKILLS
  { name: 'skill_company_dossier', description: 'SKILL: Comprehensive company research. Returns website summary, email patterns, and 10 key contacts with titles. Use for deep company research. For quick overview use get_company_info instead. Cost: $0.50', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_prospect_company', description: 'SKILL: Find 15 decision makers at a company with verified emails, sorted by seniority. Use when targeting a specific company for outreach. For broader lead lists use skill_outbound_list. Cost: $0.75', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, seniority: { type: 'string', default: 'senior,director,vp,c_suite' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_outbound_list', description: 'SKILL: Generate 100 B2B leads with verified emails, ready for CRM export. Filter by job title, location, industry, company size. Use for building outbound prospecting lists. Cost: $3.50', inputSchema: { type: 'object', properties: { job_title: { type: 'string' }, location: { type: 'string' }, industry: { type: 'string' }, company_size: { type: 'string' } }, required: ['job_title'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_local_market_map', description: 'SKILL: Find all businesses of a type in a location (up to 60). Returns name, address, phone, website, rating, hours. Use for local market research or local lead generation. Cost: $0.80', inputSchema: { type: 'object', properties: { business_type: { type: 'string' }, location: { type: 'string' } }, required: ['business_type', 'location'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_competitor_intel', description: 'SKILL: Analyze competitor pricing, features, and reviews. Scrapes pricing pages, feature lists, and review sites. Use for competitive research. Cost: $0.80', inputSchema: { type: 'object', properties: { competitor_url: { type: 'string' }, focus: { type: 'string', enum: ['pricing', 'features', 'both'], default: 'both' } }, required: ['competitor_url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_decision_maker_finder', description: 'SKILL: Find 20 decision makers at a company with verified emails. Filter by department (sales, marketing, engineering, executive). Use when you need more contacts than skill_prospect_company provides. Cost: $1.00', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, departments: { type: 'string', default: 'sales,marketing,engineering,executive' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  // NEW SKILLS
  { name: 'skill_competitor_ads', description: 'SKILL: Find active ads from a competitor. Returns ad library links, ad copy examples, and landing pages. Use for competitive advertising research. Cost: $0.65', inputSchema: { type: 'object', properties: { competitor_name: { type: 'string', description: 'Company name e.g. "Notion"' }, competitor_domain: { type: 'string', description: 'Optional domain e.g. "notion.so"' } }, required: ['competitor_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_job_signals', description: 'SKILL: Analyze job listings to reveal hiring strategy and growth areas. Returns job listings, department trends, and growth signals. Use for investment research or competitive intelligence. Cost: $0.55', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string', description: 'Optional domain' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_tech_stack', description: 'SKILL: Detect technologies and platforms a company uses. Returns detected tools with categories. Use for sales targeting or competitive research. Cost: $0.45', inputSchema: { type: 'object', properties: { domain: { type: 'string', description: 'Company domain e.g. "hubspot.com"' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_funding_intel', description: 'SKILL: Get funding history, investors, and recent news for a company. Returns funding rounds, amounts, investors, and news articles. Use for investment research or sales qualification. Cost: $0.70', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string', description: 'Optional domain' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_social_proof', description: 'SKILL: Collect reviews and testimonials for a company from review platforms. Returns reviews, ratings, and sentiment themes. Use for competitive research or sales qualification. Cost: $0.55', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string', description: 'Optional domain' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_market_map', description: 'SKILL: Discover all competitors in a market. Returns players, positioning, and pricing tiers. Use for market research or competitive landscape analysis. Cost: $1.20', inputSchema: { type: 'object', properties: { market: { type: 'string', description: 'e.g. "email marketing software"' }, max_competitors: { type: 'number', default: 10 } }, required: ['market'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_kaspr_enrich', description: 'SKILL: Get phone numbers and email addresses for a LinkedIn profile. Requires LinkedIn profile ID and full name. Returns verified contact info. Cost: $0.75', inputSchema: { type: 'object', properties: { linkedin_id: { type: 'string', description: 'LinkedIn profile ID (the part after /in/)' }, prospect_name: { type: 'string', description: 'Full name of the prospect' } }, required: ['linkedin_id', 'prospect_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
];

// ==========================================
// MCP SERVER
// ==========================================

export function setupMcpServer() {
  const mcpServer = new Server({ name: 'forage', version: '1.0.0' }, { capabilities: { tools: {} } });

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[Forage] ${name}`, args);
    try {
      switch (name) {
        case 'search_web': return await handleSearchWeb(args as any);
        case 'scrape_page': return await handleScrapePage(args as any);
        case 'get_company_info': return await handleGetCompanyInfo(args as any);
        case 'find_emails': return await handleFindEmails(args as any);
        case 'find_local_leads': return await handleFindLocalLeads(args as any);
        case 'find_leads': return await handleFindLeads(args as any);
        case 'query_knowledge': return await handleQueryKnowledge(args as any);
        case 'enrich_entity': return await handleEnrichEntity(args as any);
        case 'find_connections': return await handleFindConnections(args as any);
        case 'get_graph_stats': return await handleGetGraphStats();
        case 'get_claims': return await handleGetClaims(args as any);
        case 'add_claim': return await handleAddClaim(args as any);
        case 'get_regime': return await handleGetRegime(args as any);
        case 'set_regime': return await handleSetRegime(args as any);
        case 'get_signals': return await handleGetSignals(args as any);
        case 'add_signal': return await handleAddSignal(args as any);
        case 'get_causal_parents': return await handleGetCausalParents(args as any);
        case 'get_causal_children': return await handleGetCausalChildren(args as any);
        case 'get_causal_path': return await handleGetCausalPath(args as any);
        case 'simulate': return await handleSimulate(args as any);
        case 'list_regime_entities': return await handleListRegimeEntities(args as any);
        case 'list_verified_actors': return await handleListVerifiedActors(args as any);
        case 'get_actor_schema': return await handleGetActorSchema(args as any);
        case 'call_actor': return await handleCallActor(args as any);
        case 'skill_company_dossier': return await handleSkillCompanyDossier(args as any);
        case 'skill_prospect_company': return await handleSkillProspectCompany(args as any);
        case 'skill_outbound_list': return await handleSkillOutboundList(args as any);
        case 'skill_local_market_map': return await handleSkillLocalMarketMap(args as any);
        case 'skill_competitor_intel': return await handleSkillCompetitorIntel(args as any);
        case 'skill_decision_maker_finder': return await handleSkillDecisionMakerFinder(args as any);
        case 'skill_competitor_ads': return await handleSkillCompetitorAds(args as any);
        case 'skill_job_signals': return await handleSkillJobSignals(args as any);
        case 'skill_tech_stack': return await handleSkillTechStack(args as any);
        case 'skill_funding_intel': return await handleSkillFundingIntel(args as any);
        case 'skill_social_proof': return await handleSkillSocialProof(args as any);
        case 'skill_market_map': return await handleSkillMarketMap(args as any);
        case 'skill_kaspr_enrich': return await handleSkillKasprEnrich(args as any);
        default: throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[Forage] Error:`, error);
      return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  return mcpServer;
}

// ==========================================
// HELPERS
// ==========================================

async function jinaFetch(url: string, maxChars = 3000): Promise<string | null> {
  const jinaKey = process.env.JINA_AI_KEY;
  if (!jinaKey) return null;
  try {
    const res = await axios.get(`https://r.jina.ai/${url}`, { headers: { Authorization: `Bearer ${jinaKey}` }, timeout: 15000 });
    return res.data.substring(0, maxChars);
  } catch { return null; }
}

async function serpSearch(query: string, num = 5): Promise<any[]> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  try {
    const res = await axios.get('https://serpapi.com/search', { params: { q: query, api_key: key, engine: 'google', num }, timeout: 15000 });
    return res.data.organic_results || [];
  } catch { return []; }
}

// ==========================================
// CORE HANDLERS
// ==========================================

async function handleSearchWeb({ query, num_results = 10 }: { query: string; num_results?: number }) {
  const cost = PRICING.SEARCH_WEB.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SEARCH_WEB.event, count: 1 });
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY not configured');
  const response = await axios.get('https://serpapi.com/search', { params: { q: query, api_key: key, engine: 'google', num: Math.min(num_results, 20) }, timeout: 30000 });
  const results = response.data.organic_results?.map((r: any) => ({ title: r.title, link: r.link, snippet: r.snippet })) || [];
  graphClient.ingest('search_web', { query, results });
  return { content: [{ type: 'text', text: JSON.stringify({ query, results, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleScrapePage({ url }: { url: string }) {
  const cost = PRICING.SCRAPE_PAGE.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SCRAPE_PAGE.event, count: 1 });
  const jinaKey = process.env.JINA_AI_KEY;
  let content: string; let title: string;
  if (jinaKey) {
    const cleanUrl = url.replace(/^https?:\/\//, '');
    const res = await axios.get(`https://r.jina.ai/https://${cleanUrl}`, { headers: { Authorization: `Bearer ${jinaKey}` }, timeout: 30000 });
    const lines = res.data.split('\n');
    title = lines[0].replace(/^Title: /, '');
    content = lines.slice(1).join('\n').replace(/^Content: /, '').trim();
  } else {
    const res = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(res.data);
    title = $('title').text();
    content = ($('main, article, .content').first().text() || $('body').text()).replace(/\s+/g, ' ').trim();
  }
  return { content: [{ type: 'text', text: JSON.stringify({ url, title, content, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleGetCompanyInfo({ domain, find_emails = true }: { domain: string; find_emails?: boolean }) {
  const cost = PRICING.GET_COMPANY_INFO.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.GET_COMPANY_INFO.event, count: 1 });
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  let websiteData = {};
  let emailData = null;
  try {
    const res = await axios.get(`https://r.jina.ai/https://${cleanDomain}`, { headers: { Authorization: `Bearer ${process.env.JINA_AI_KEY}` }, timeout: 15000 });
    const lines = res.data.split('\n');
    websiteData = { title: lines[0]?.replace(/^Title: /, ''), description: lines[1]?.replace(/^Content: /, '').substring(0, 500) };
  } catch (e) { websiteData = { error: 'Could not fetch website' }; }
  if (find_emails) {
    try {
      const apolloKey = process.env.APOLLO_API_KEY;
      if (apolloKey) {
        const apolloRes = await axios.post('https://api.apollo.io/v1/mixed_people/search',
          { q_organization_domains: cleanDomain, page: 1, per_page: 10 },
          { headers: { 'x-api-key': apolloKey, 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        emailData = apolloRes.data?.people?.map((p: any) => ({
          name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          email: p.email,
          title: p.title,
          linkedin: p.linkedin_url,
          seniority: p.seniority,
        })) || [];
      }
    } catch (e) { emailData = { error: 'Email search failed' }; }
  }
  graphClient.ingest('get_company_info', { domain: cleanDomain, website: websiteData, email_intelligence: emailData });
  return { content: [{ type: 'text', text: JSON.stringify({ domain: cleanDomain, website: websiteData, email_intelligence: emailData, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, timestamp: new Date().toISOString() }, null, 2) }] };
}

async function handleFindEmails({ domain, limit = 10 }: { domain: string; limit?: number }) {
  const cost = PRICING.FIND_EMAILS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) {
    try {
      await Actor.charge({ eventName: PRICING.FIND_EMAILS.event, count: 1 });
    } catch (e) {
      console.error('Charging error:', e);
    }
  }
  
  // Try calling leads-finder MCP server via MCP protocol
  try {
    const mcpUrl = 'https://alluring-bookshelf--forage----mcp-server-for-ai-agents-task.apify.actor';
    const mcpToken = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
    
    if (mcpToken) {
      const initRes = await axios.post(`${mcpUrl}?token=${mcpToken}`, 
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'forage', version: '1.0' } } },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }, timeout: 15000 }
      );
      
      const mcpSession = initRes.headers.get('mcp-session-id');
      if (mcpSession) {
        const toolRes = await axios.post(`${mcpUrl}?token=${mcpToken}`,
          { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'find_emails', arguments: { domain, limit } } },
          { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': mcpSession }, timeout: 30000 }
        );
        
        const text = toolRes.data;
        if (text.result?.content) {
          const content = text.result.content[0]?.text;
          if (content && !content.includes('error')) {
            graphClient.ingest('find_emails', { domain, emails: [] });
            return { content: [{ type: 'text', text: content }] };
          }
        }
      }
    }
  } catch (e) {
    console.error('MCP leads-finder error:', e);
  }
  
  return { content: [{ type: 'text', text: JSON.stringify({ 
    domain, 
    emails_found: 0, 
    message: 'Email lookup unavailable. Try search or company info.',
    cost_usd: cost, 
    free_credit_used: freeUsed, 
    free_credit_remaining: remaining 
  }, null, 2) }] };
}
  }
  
  const emeliaKey = process.env.EMELIA_API_KEY;
  if (emeliaKey && emeliaKey.length > 5) {
    try {
      const companyName = domain.replace(/\.[a-z]{2,}$/i, '').replace(/-/g, ' ');
      const jobRes = await axios.post('https://api.emelia.io/tools/find/email',
        { fullname: companyName, companyName: domain, country: 'US' },
        { headers: { 'Authorization': `Bearer ${emeliaKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      
      if (jobRes.data && !jobRes.data.error && jobRes.data.jobId) {
        const jobId = jobRes.data.jobId;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const resultRes = await axios.get(`https://api.emelia.io/tools/find/email/${jobId}`,
            { headers: { 'Authorization': `Bearer ${emeliaKey}` }, timeout: 5000 }
          );
          
          if (resultRes.data && resultRes.data.status === 'completed') {
            const emails = (resultRes.data.result || []).slice(0, limit).map((p: any) => ({
              email: p.email || p.email_address,
              name: p.full_name || p.fullname || '',
              title: p.job_title || '',
            }));
            graphClient.ingest('find_emails', { domain, emails });
            return { content: [{ type: 'text', text: JSON.stringify({ domain, emails_found: emails.length, emails, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
          } else if (resultRes.data && resultRes.data.status === 'failed') {
            break;
          }
        }
      }
    } catch (e: any) {
      console.error('Emelia error:', e?.message || e);
    }
  }
  
  return { content: [{ type: 'text', text: JSON.stringify({ 
    domain, 
    emails_found: 0, 
    message: 'Email lookup temporarily unavailable. Try search or company info instead.',
    cost_usd: cost, 
    free_credit_used: freeUsed, 
    free_credit_remaining: remaining 
  }, null, 2) }] };
}

async function handleFindLocalLeads({ keyword, location, radius = 5000, max_results = 20 }: any) {
  const cost = PRICING.FIND_LOCAL_LEADS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.FIND_LOCAL_LEADS.event, count: 1 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured');
  const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params: { query: `${keyword} in ${location}`, radius, key, maxResults: max_results } });
  const leads = await Promise.all((data.results || []).slice(0, max_results).map(async (place: any) => {
    try {
      const details = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { params: { place_id: place.place_id, fields: 'website,formatted_phone_number', key } });
      return { name: place.name, address: place.formatted_address, rating: place.rating, user_ratings_total: place.user_ratings_total, place_id: place.place_id, website: details.data.result?.website, phone: details.data.result?.formatted_phone_number, location: place.geometry?.location };
    } catch { return { name: place.name, address: place.formatted_address, rating: place.rating, place_id: place.place_id }; }
  }));
  graphClient.ingest('find_local_leads', { keyword, location, leads });
  return { content: [{ type: 'text', text: JSON.stringify({ keyword, location, leads_found: leads.length, leads, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleFindLeads(args: any) {
  const { job_title, location, industry, company_size, keywords, company_website, num_leads = 100, email_status = 'verified' } = args;
  const chargeUnits = Math.ceil(num_leads / 100);
  const cost = PRICING.FIND_LEADS.charge * chargeUnits;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.FIND_LEADS.event, count: chargeUnits });
  const run = await Actor.start('code_crafter/leads-finder', { leadsCount: Math.min(num_leads, 1000), fileName: `leads_${Date.now()}`, jobTitle: job_title, locationInclude: location || '', locationExclude: '', emailStatus: email_status, companyWebsite: company_website || '', size: company_size || '', industry: industry || '', keywords: keywords || '', revenue: '', funding: '' });
  const timeout = 5 * 60 * 1000; const startTime = Date.now(); let pollInterval = 2000;
  while (true) {
    if (Date.now() - startTime > timeout) throw new Error(`Timeout (run ID: ${run.id})`);
    const runInfo = await Actor.apifyClient.run(run.id).get();
    if (!runInfo) throw new Error('Failed to get run info');
    if (runInfo.status === 'SUCCEEDED') {
      const allItems: any[] = []; let offset = 0;
      while (true) {
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ offset, limit: 250 });
        const items = result.items ?? []; allItems.push(...items); offset += items.length;
        if (items.length === 0 || items.length < 250) break;
      }
      const formattedLeads = allItems.map((lead: any) => ({ name: lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim(), title: lead.title || lead.jobTitle, company: lead.company || lead.organization, email: lead.email, email_status: lead.emailStatus || lead.email_verified, linkedin: lead.linkedin || lead.linkedinUrl, location: lead.location, industry: lead.industry, company_size: lead.companySize || lead.size, website: lead.website || lead.companyWebsite, phone: lead.phone }));
      graphClient.ingest('find_leads', { leads: formattedLeads });
      return { content: [{ type: 'text', text: JSON.stringify({ query: { job_title, location, industry }, leads_found: formattedLeads.length, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, leads: formattedLeads, actor_run_id: run.id }, null, 2) }] };
    }
    if (['FAILED', 'TIMED_OUT', 'ABORTED'].includes(runInfo.status!)) throw new Error(`Leads finder ${runInfo.status}`);
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }
}

// ==========================================
// KNOWLEDGE GRAPH HANDLERS
// ==========================================

async function handleQueryKnowledge(args: any) {
  const cost = PRICING.QUERY_KNOWLEDGE.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.QUERY_KNOWLEDGE.event, count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/query`, { name: args.question, type: args.entity_type !== 'any' ? args.entity_type : undefined, min_confidence: args.min_confidence || 0.0 }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ question: args.question, results: res.data.entities, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: `Graph query failed: ${err.message}` }], isError: true }; }
}

async function handleEnrichEntity(args: any) {
  const cost = PRICING.ENRICH_ENTITY.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.ENRICH_ENTITY.event, count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/enrich`, { identifier: args.identifier }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ identifier: args.identifier, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: `Graph enrich failed: ${err.message}` }], isError: true }; }
}

async function handleFindConnections(args: any) {
  const cost = PRICING.FIND_CONNECTIONS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.FIND_CONNECTIONS.event, count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/connections`, { from: args.from_entity, to: args.to_entity, max_hops: args.max_hops || 3 }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: `Graph connections failed: ${err.message}` }], isError: true }; }
}

async function handleGetGraphStats() {
  const cost = 0;
  const remaining = getUserRemainingCredit();
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ status: 'Graph service not configured', free_credit_remaining: remaining }) }] };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.get(`${graphUrl}/stats`, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ knowledge_graph: res.data, cost_usd: cost, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

// ==========================================  
// GRAPH ADVANCED HANDLERS
// ==========================================

async function handleGetClaims({ entity }: { entity: string }) {
  const cost = 0.02;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'get-claims', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.get(`${graphUrl}/claims/${encodeURIComponent(entity)}`, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleAddClaim(args: { entity: string; relation: string; target: string; assertion: string; source_url?: string; confidence?: number }) {
  const cost = 0.02;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'add-claim', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/claim`, args, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleGetRegime({ entity }: { entity: string }) {
  const cost = 0.01;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'get-regime', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.get(`${graphUrl}/regime/${encodeURIComponent(entity)}`, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleSetRegime(args: { entity: string; regime: string }) {
  const cost = 0.01;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'set-regime', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/regime`, args, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleGetSignals(args: { entity: string; metric?: string; limit?: number }) {
  const cost = 0.02;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'get-signals', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.get(`${graphUrl}/signals/${encodeURIComponent(args.entity)}`, { 
      headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` },
      params: { metric: args.metric, limit: args.limit || 100 }
    });
    return { content: [{ type: 'text', text: JSON.stringify({ entity: args.entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleAddSignal(args: { entity: string; metric: string; value: number; timestamp?: number }) {
  const cost = 0.02;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'add-signal', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/signal`, { ...args, timestamp: args.timestamp || Date.now() }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleGetCausalParents({ entity, limit = 10 }: { entity: string; limit?: number }) {
  const cost = 0.03;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'causal-parents', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/causal_parents`, { entity, limit }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleGetCausalChildren({ entity, limit = 10 }: { entity: string; limit?: number }) {
  const cost = 0.03;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'causal-children', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/causal_children`, { entity, limit }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleGetCausalPath({ from_entity, to_entity }: { from_entity: string; to_entity: string }) {
  const cost = 0.05;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'causal-path', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/causal_path`, { from: from_entity, to: to_entity }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ from: from_entity, to: to_entity, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleSimulate(args: { entity: string; intervention: string; depth?: number }) {
  const cost = 0.10;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'simulate', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.post(`${graphUrl}/simulate`, { entity: args.entity, intervention: args.intervention, depth: args.depth || 3 }, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

async function handleListRegimeEntities({ regime }: { regime: string }) {
  const cost = 0.02;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: 'list-regime-entities', count: 1 });
  if (!process.env.GRAPH_API_URL) return { content: [{ type: 'text', text: JSON.stringify({ error: 'Graph service not configured' }) }], isError: true };
  const graphUrl = process.env.GRAPH_API_URL.replace(/\/$/, '');
  try {
    const res = await axios.get(`${graphUrl}/regime/list/${regime}`, { headers: { Authorization: `Bearer ${process.env.GRAPH_API_SECRET}` } });
    return { content: [{ type: 'text', text: JSON.stringify({ regime, ...res.data, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
  } catch (err: any) { return { content: [{ type: 'text', text: JSON.stringify({ error: err.message, free_credit_remaining: remaining }) }], isError: true }; }
}

// ==========================================
// ACTOR GATEWAY HANDLERS
// ==========================================

async function handleListVerifiedActors({ category = 'all' }: { category?: string }) {
  const cost = PRICING.LIST_ACTORS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.LIST_ACTORS.event, count: 1 });
  const verified = Array.from(VERIFIED_ACTORS.entries()).map(([actorId, p]) => ({ actor_id: actorId, name: actorId.split('/').pop(), description: p.desc, cost_usd: p.charge, unit: p.unit }));
  return { content: [{ type: 'text', text: JSON.stringify({ actors: category === 'all' ? verified : verified.filter(a => a.description?.includes(category)), cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleGetActorSchema({ actor_id }: { actor_id: string }) {
  const cost = PRICING.GET_SCHEMA.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.GET_SCHEMA.event, count: 1 });
  const response = await axios.get(`https://api.apify.com/v2/acts/${actor_id}`, { headers: process.env.APIFY_TOKEN ? { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : {} });
  const actor = response.data.data;
  const pricing = VERIFIED_ACTORS.get(actor_id);
  return { content: [{ type: 'text', text: JSON.stringify({ actor_id, name: actor.name, is_verified: !!pricing, cost_estimate: pricing ? { usd: pricing.charge, unit: pricing.unit } : 'Dynamic (25% markup)', input_schema: actor.input?.schema || actor.inputSchema || { warning: 'No schema', example: actor.exampleRunInput }, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleCallActor({ actor_id, input, timeout_secs = 120, max_cost_usd }: any) {
  const verified = VERIFIED_ACTORS.get(actor_id);
  let estimatedCost = verified ? verified.charge : PRICING.OPEN_ACCESS_MINIMUM_FEE;
  if (!verified) {
    try {
      const res = await axios.get(`https://api.apify.com/v2/acts/${actor_id}`, { headers: process.env.APIFY_TOKEN ? { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : {} });
      const basePrice = res.data.data?.pricingInfos?.[0]?.pricePerUnit || 0;
      estimatedCost = basePrice + Math.max(basePrice * (PRICING.OPEN_ACCESS_MARKUP_PERCENT / 100), PRICING.OPEN_ACCESS_MINIMUM_FEE);
    } catch { estimatedCost = PRICING.OPEN_ACCESS_MINIMUM_FEE; }
  }
  if (max_cost_usd !== undefined && estimatedCost > max_cost_usd) return { content: [{ type: 'text', text: JSON.stringify({ actor_id, requested_max: max_cost_usd, estimated_cost: estimatedCost, message: 'Cost exceeds max_cost_usd' }) }], isError: true };
  const { charged, freeUsed, remaining } = applyCredit(estimatedCost);
  if (charged > 0) await Actor.charge({ eventName: 'call-actor', count: 1 });
  const run = await Actor.start(actor_id, input);
  const startTime = Date.now(); const timeout = timeout_secs * 1000; let pollInterval = 2000;
  while (true) {
    if (Date.now() - startTime > timeout) return { content: [{ type: 'text', text: JSON.stringify({ status: 'TIMEOUT', actor_id, run_id: run.id, monitor_url: `https://console.apify.com/actors/runs/${run.id}` }) }] };
    const runInfo = await Actor.apifyClient.run(run.id).get();
    if (!runInfo) throw new Error('Failed to retrieve run information');
    if (runInfo.status === 'SUCCEEDED') {
      const items: any[] = []; let offset = 0;
      while (true) {
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ offset, limit: 1000 });
        items.push(...result.items); offset += result.items.length;
        if (result.items.length < 1000) break;
      }
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'SUCCEEDED', actor_id, run_id: run.id, estimated_cost: estimatedCost, dataset_items: items.length, sample: items.slice(0, 10) }, null, 2) }] };
    }
    if (['FAILED', 'ABORTED'].includes(runInfo.status!)) throw new Error(`Actor failed: ${runInfo.statusMessage}`);
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }
}

// ==========================================
// ORIGINAL SKILL HANDLERS
// ==========================================

async function handleSkillCompanyDossier({ domain }: { domain: string }) {
  const cost = PRICING.SKILL_COMPANY_DOSSIER.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_COMPANY_DOSSIER.event, count: 1 });
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apolloKey = process.env.APOLLO_API_KEY;
  const [websiteRaw, emailsRaw] = await Promise.allSettled([
    axios.get(`https://r.jina.ai/https://${cleanDomain}`, { headers: { Authorization: `Bearer ${process.env.JINA_AI_KEY}` }, timeout: 15000 }),
    apolloKey
      ? axios.post('https://api.apollo.io/v1/mixed_people/search',
          { q_organization_domains: cleanDomain, page: 1, per_page: 10 },
          { headers: { 'x-api-key': apolloKey, 'Content-Type': 'application/json' }, timeout: 15000 })
      : Promise.reject('No Apollo key'),
  ]);
  const website = websiteRaw.status === 'fulfilled' ? { title: websiteRaw.value.data.split('\n')[0]?.replace(/^Title: /, ''), summary: websiteRaw.value.data.split('\n').slice(1).join(' ').substring(0, 800) } : { error: 'Could not fetch' };
  const emailData = emailsRaw.status === 'fulfilled' ? emailsRaw.value.data.people : null;
  const contacts = emailData?.slice(0, 10).map((p: any) => ({ name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email, title: p.title, seniority: p.seniority, department: p.departments?.[0], linkedin: p.linkedin_url })) || [];
  const dossier = { domain: cleanDomain, website_summary: website, key_contacts: contacts, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, generated_at: new Date().toISOString() };
  graphClient.ingest('skill_company_dossier', dossier);
  return { content: [{ type: 'text', text: JSON.stringify(dossier, null, 2) }] };
}

async function handleSkillProspectCompany({ domain, seniority = 'senior,director,vp,c_suite' }: any) {
  const cost = PRICING.SKILL_PROSPECT_COMPANY.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_PROSPECT_COMPANY.event, count: 1 });
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) throw new Error('APOLLO_API_KEY not configured');
  const { data } = await axios.post('https://api.apollo.io/v1/mixed_people/search',
    { q_organization_domains: cleanDomain, page: 1, per_page: 25 },
    { headers: { 'x-api-key': apolloKey, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const seniorityLevels = seniority.split(',').map((s: string) => s.trim().toLowerCase());
  const decisionMakers = (data.people || [])
    .filter((p: any) => !p.seniority || seniorityLevels.includes(p.seniority?.toLowerCase()))
    .slice(0, 15)
    .map((p: any) => ({ name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email, title: p.title, seniority: p.seniority, department: p.departments?.[0], linkedin: p.linkedin_url }));
  const result = { domain: cleanDomain, decision_makers_found: decisionMakers.length, contacts: decisionMakers, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_prospect_company', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillOutboundList({ job_title, location, industry, company_size }: any) {
  const cost = PRICING.SKILL_OUTBOUND_LIST.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_OUTBOUND_LIST.event, count: 1 });
  const run = await Actor.start('code_crafter/leads-finder', { leadsCount: 100, fileName: `outbound_${Date.now()}`, jobTitle: job_title, locationInclude: location || '', emailStatus: 'verified', size: company_size || '', industry: industry || '' });
  const timeout = 8 * 60 * 1000; const startTime = Date.now(); let pollInterval = 3000;
  while (true) {
    if (Date.now() - startTime > timeout) throw new Error('Outbound list timed out');
    const runInfo = await Actor.apifyClient.run(run.id).get();
    if (!runInfo) throw new Error('Failed to get run info');
    if (runInfo.status === 'SUCCEEDED') {
      const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ limit: 100 });
      const leads = result.items.map((lead: any) => ({ name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.name, title: lead.title || lead.jobTitle, company: lead.company || lead.organization, email: lead.email, email_verified: lead.emailStatus === 'verified', linkedin: lead.linkedin || lead.linkedinUrl, location: lead.location, company_size: lead.companySize, website: lead.website, phone: lead.phone }));
      graphClient.ingest('skill_outbound_list', { leads });
      return { content: [{ type: 'text', text: JSON.stringify({ job_title, location, industry, total_leads: leads.length, verified_emails: leads.filter((l: any) => l.email_verified).length, leads, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, export_ready: true }, null, 2) }] };
    }
    if (['FAILED', 'ABORTED', 'TIMED_OUT'].includes(runInfo.status!)) throw new Error(`Leads actor ${runInfo.status}`);
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, 15000);
  }
}

async function handleSkillLocalMarketMap({ business_type, location }: any) {
  const cost = PRICING.SKILL_LOCAL_MARKET_MAP.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_LOCAL_MARKET_MAP.event, count: 1 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured');
  const allResults: any[] = []; let pageToken: string | undefined;
  do {
    const params: any = { query: `${business_type} in ${location}`, key };
    if (pageToken) params.pagetoken = pageToken;
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params });
    const detailed = await Promise.all((data.results || []).map(async (place: any) => {
      try {
        const det = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { params: { place_id: place.place_id, fields: 'website,formatted_phone_number,opening_hours', key } });
        return { name: place.name, address: place.formatted_address, phone: det.data.result?.formatted_phone_number, website: det.data.result?.website, rating: place.rating, review_count: place.user_ratings_total, open_now: det.data.result?.opening_hours?.open_now, location: place.geometry?.location };
      } catch { return { name: place.name, address: place.formatted_address, rating: place.rating }; }
    }));
    allResults.push(...detailed);
    pageToken = data.next_page_token;
    if (pageToken) await new Promise(r => setTimeout(r, 2000));
  } while (pageToken && allResults.length < 60);
  const result = { business_type, location, total_found: allResults.length, businesses: allResults, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_local_market_map', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillCompetitorIntel({ competitor_url, focus = 'both' }: any) {
  const cost = PRICING.SKILL_COMPETITOR_INTEL.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_COMPETITOR_INTEL.event, count: 1 });
  const competitorName = competitor_url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('.')[0];
  const searchQueries: string[] = [];
  if (focus === 'pricing' || focus === 'both') searchQueries.push(`${competitorName} pricing plans`);
  if (focus === 'features' || focus === 'both') searchQueries.push(`${competitorName} features`);
  searchQueries.push(`${competitorName} reviews site:g2.com OR site:capterra.com OR site:trustpilot.com`);
  const searchResults: Record<string, string[]> = {};
  await Promise.allSettled(searchQueries.map(async (q) => { const results = await serpSearch(q, 3); searchResults[q] = results.map((r: any) => r.link); }));
  const urlsToScrape = new Set<string>([competitor_url]);
  Object.values(searchResults).forEach(links => links.slice(0, 2).forEach(link => urlsToScrape.add(link)));
  if (focus === 'pricing' || focus === 'both') urlsToScrape.add(`${competitor_url.replace(/\/$/, '')}/pricing`);
  if (focus === 'features' || focus === 'both') urlsToScrape.add(`${competitor_url.replace(/\/$/, '')}/features`);
  const scraped = await Promise.allSettled(Array.from(urlsToScrape).slice(0, 8).map(async (url) => { const content = await jinaFetch(url, 2500); return { url, content, success: !!content }; }));
  const pages_data = scraped.filter(r => r.status === 'fulfilled' && (r.value as any).success).map((r: any) => r.value);
  const homepagePage = pages_data.find(p => p.url === competitor_url);
  const pricingPages = pages_data.filter(p => p.url.includes('pricing') || p.url.includes('plans') || p.url.includes('cost'));
  const featurePages = pages_data.filter(p => p.url.includes('features') || p.url.includes('product') || p.url.includes('solutions'));
  const reviewPages = pages_data.filter(p => p.url.includes('g2.com') || p.url.includes('capterra') || p.url.includes('trustpilot'));
  const result = { competitor: competitor_url, competitor_name: competitorName, focus, summary: { homepage: homepagePage?.content?.substring(0, 500) || null, pricing_pages_found: pricingPages.length, feature_pages_found: featurePages.length, review_pages_found: reviewPages.length }, pricing_data: pricingPages.map(p => ({ url: p.url, content: p.content })), feature_data: featurePages.map(p => ({ url: p.url, content: p.content })), review_data: reviewPages.map(p => ({ url: p.url, content: p.content })), all_pages_scraped: pages_data.length, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_competitor_intel', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillDecisionMakerFinder({ domain, departments = 'sales,marketing,engineering,executive' }: any) {
  const cost = PRICING.SKILL_DECISION_MAKER.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_DECISION_MAKER.event, count: 1 });
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!apolloKey) throw new Error('APOLLO_API_KEY not configured');
  const deptList = departments.split(',').map((d: string) => d.trim().toLowerCase());
  const { data } = await axios.post('https://api.apollo.io/v1/mixed_people/search',
    { q_organization_domains: cleanDomain, page: 1, per_page: 50 },
    { headers: { 'x-api-key': apolloKey, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  const contacts = (data.people || [])
    .filter((p: any) => { if (!p.departments?.length) return true; return deptList.some((d: string) => p.departments.some((dept: string) => dept.toLowerCase().includes(d))); })
    .sort((a: any, b: any) => { const s = ['c_suite', 'vp', 'director', 'senior', 'junior']; return s.indexOf(a.seniority) - s.indexOf(b.seniority); })
    .slice(0, 20)
    .map((p: any) => ({ name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), email: p.email, title: p.title, seniority: p.seniority, department: p.departments?.[0], linkedin: p.linkedin_url }));
  const result = { domain: cleanDomain, contacts_found: contacts.length, contacts, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_decision_maker_finder', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ==========================================
// NEW SKILL HANDLERS
// ==========================================

async function handleSkillCompetitorAds({ competitor_name, competitor_domain }: any) {
  const cost = PRICING.SKILL_COMPETITOR_ADS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_COMPETITOR_ADS.event, count: 1 });
  const fbLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=ALL&country=ALL&q=${encodeURIComponent(competitor_name)}&search_type=keyword_unordered`;
  const googleTransparencyUrl = `https://adstransparency.google.com/?region=anywhere&advertiserName=${encodeURIComponent(competitor_name)}`;
  const [fbContent, googleContent] = await Promise.all([jinaFetch(fbLibraryUrl, 2000), jinaFetch(googleTransparencyUrl, 2000)]);
  const adSearchResults: any[] = [];
  await Promise.allSettled([`${competitor_name} facebook ad examples copy`, `${competitor_name} google ads strategy`, `${competitor_name} best performing ads`].map(async (q) => { const results = await serpSearch(q, 3); results.slice(0, 2).forEach((r: any) => adSearchResults.push({ query: q, title: r.title, url: r.link, snippet: r.snippet })); }));
  const landingPages: any[] = [];
  await Promise.allSettled(adSearchResults.filter(r => r.url && !r.url.includes('google') && !r.url.includes('facebook')).slice(0, 3).map(async (r) => { const content = await jinaFetch(r.url, 1500); if (content) landingPages.push({ url: r.url, content }); }));
  const result = { competitor: competitor_name, domain: competitor_domain || 'not provided', facebook_ad_library: { url: fbLibraryUrl, content: fbContent || 'Visit URL manually to see active ads' }, google_ads_transparency: { url: googleTransparencyUrl, content: googleContent || 'Visit URL manually to see active Google ads' }, ad_intelligence: adSearchResults, landing_pages: landingPages, manual_links: [fbLibraryUrl, googleTransparencyUrl], cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_competitor_ads', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillJobSignals({ company_name, domain }: any) {
  const cost = PRICING.SKILL_JOB_SIGNALS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_JOB_SIGNALS.event, count: 1 });
  const allResults: any[] = [];
  await Promise.allSettled([
    `${company_name} jobs site:linkedin.com OR site:greenhouse.io OR site:lever.co OR site:jobs.ashbyhq.com`,
    `${company_name} hiring ${new Date().getFullYear()}`,
    `${company_name} careers open roles`,
  ].map(async (q) => { const results = await serpSearch(q, 5); results.forEach((r: any) => allResults.push({ title: r.title, url: r.link, snippet: r.snippet })); }));
  let careersContent = null;
  if (domain) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    for (const url of [`https://${cleanDomain}/careers`, `https://${cleanDomain}/jobs`, `https://${cleanDomain}/work-with-us`]) {
      careersContent = await jinaFetch(url, 3000);
      if (careersContent) break;
    }
  }
  const jobPages: any[] = [];
  await Promise.allSettled(allResults.filter(r => r.url && (r.url.includes('greenhouse') || r.url.includes('lever') || r.url.includes('ashby'))).slice(0, 3).map(async (r) => { const content = await jinaFetch(r.url, 2000); if (content) jobPages.push({ url: r.url, content }); }));
  const result = { company: company_name, domain: domain || 'not provided', careers_page: careersContent, job_listings_found: allResults.length, search_results: allResults, job_pages_scraped: jobPages, signals_to_watch: ['New departments = strategic expansion', 'Engineering spike = product build phase', 'Sales + marketing = growth mode', 'Infra / DevOps = scaling', 'AI / ML roles = technology pivot'], cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_job_signals', { company: company_name, job_listings: allResults });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillTechStack({ domain }: any) {
  const cost = PRICING.SKILL_TECH_STACK.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_TECH_STACK.event, count: 1 });
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const [builtWithContent, homepageContent, jobsContent] = await Promise.all([
    jinaFetch(`https://builtwith.com/${cleanDomain}`, 3000),
    jinaFetch(`https://${cleanDomain}`, 2000),
    jinaFetch(`https://${cleanDomain}/careers`, 1500),
  ]);
  const stackResults = await serpSearch(`${cleanDomain} tech stack engineering blog`, 5);
  const engBlogPages: any[] = [];
  await Promise.allSettled(stackResults.filter((r: any) => r.link && (r.link.includes('engineering') || r.link.includes('tech') || r.link.includes('blog'))).slice(0, 2).map(async (r: any) => { const content = await jinaFetch(r.link, 2000); if (content) engBlogPages.push({ url: r.link, content }); }));
  const result = { domain: cleanDomain, builtwith_data: builtWithContent, homepage_signals: homepageContent?.substring(0, 1000) || null, jobs_tech_mentions: jobsContent?.substring(0, 1000) || null, engineering_blog: engBlogPages, search_results: stackResults.slice(0, 5).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet })), cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_tech_stack', { domain: cleanDomain });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillFundingIntel({ company_name, domain }: any) {
  const cost = PRICING.SKILL_FUNDING_INTEL.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_FUNDING_INTEL.event, count: 1 });
  const allResults: any[] = [];
  await Promise.allSettled([
    `${company_name} funding round raised 2024 2025`,
    `${company_name} investors valuation`,
    `${company_name} news announcement`,
    `${company_name} site:crunchbase.com OR site:techcrunch.com OR site:businesswire.com`,
  ].map(async (q) => { const results = await serpSearch(q, 4); results.slice(0, 3).forEach((r: any) => allResults.push({ query: q, title: r.title, url: r.link, snippet: r.snippet, date: r.date })); }));
  const crunchbaseUrl = `https://www.crunchbase.com/organization/${company_name.toLowerCase().replace(/\s+/g, '-')}`;
  const crunchbaseContent = await jinaFetch(crunchbaseUrl, 2500);
  const newsPages: any[] = [];
  await Promise.allSettled(allResults.filter(r => r.url && (r.url.includes('techcrunch') || r.url.includes('businesswire') || r.url.includes('prnewswire'))).slice(0, 3).map(async (r) => { const content = await jinaFetch(r.url, 2000); if (content) newsPages.push({ url: r.url, content }); }));
  const result = { company: company_name, domain: domain || 'not provided', crunchbase: { url: crunchbaseUrl, content: crunchbaseContent }, funding_search_results: allResults, news_articles: newsPages, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_funding_intel', { company: company_name });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillSocialProof({ company_name, domain }: any) {
  const cost = PRICING.SKILL_SOCIAL_PROOF.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_SOCIAL_PROOF.event, count: 1 });
  const slug = company_name.toLowerCase().replace(/\s+/g, '-');
  const reviewPages: any[] = [];
  await Promise.allSettled([
    `https://www.g2.com/products/${slug}/reviews`,
    `https://www.capterra.com/reviews/${slug}`,
    `https://www.trustpilot.com/review/${domain || slug}`,
  ].map(async (url) => { const content = await jinaFetch(url, 3000); if (content) reviewPages.push({ source: url.includes('g2') ? 'G2' : url.includes('capterra') ? 'Capterra' : 'Trustpilot', url, content }); }));
  const testimonialResults = await serpSearch(`${company_name} customer testimonial case study review`, 5);
  let testimonialPage = null;
  if (domain) {
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    for (const url of [`https://${cleanDomain}/customers`, `https://${cleanDomain}/testimonials`, `https://${cleanDomain}/case-studies`]) {
      testimonialPage = await jinaFetch(url, 2500);
      if (testimonialPage) break;
    }
  }
  const result = { company: company_name, review_platforms: reviewPages, own_site_testimonials: testimonialPage, search_results: testimonialResults.slice(0, 5).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet })), platforms_found: reviewPages.map(r => r.source), cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_social_proof', { company: company_name, reviews_found: reviewPages.length });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillMarketMap({ market, max_competitors = 10 }: any) {
  const cost = PRICING.SKILL_MARKET_MAP.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_MARKET_MAP.event, count: 1 });
  const allResults: any[] = [];
  await Promise.allSettled([
    `best ${market} tools software`,
    `top ${market} companies`,
    `${market} alternatives competitors`,
    `${market} comparison`,
  ].map(async (q) => { const results = await serpSearch(q, 5); results.forEach((r: any) => allResults.push({ title: r.title, url: r.link, snippet: r.snippet })); }));
  const comparisonPages: any[] = [];
  await Promise.allSettled(allResults.filter(r => r.url && (r.url.includes('g2.com') || r.url.includes('capterra') || r.title?.toLowerCase().includes('best') || r.title?.toLowerCase().includes('top'))).slice(0, 4).map(async (r) => { const content = await jinaFetch(r.url, 3000); if (content) comparisonPages.push({ url: r.url, content }); }));
  const pricingResults = await serpSearch(`${market} pricing comparison 2024 2025`, 5);
  const result = { market, search_results: allResults.slice(0, 15), comparison_pages: comparisonPages, pricing_comparison_results: pricingResults.slice(0, 5).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet })), note: 'Use comparison_pages to extract player names, positioning and pricing tiers', cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining };
  graphClient.ingest('skill_market_map', { market });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillKasprEnrich({ linkedin_id, prospect_name }: any) {
  const cost = PRICING.SKILL_KASPR_ENRICH.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await Actor.charge({ eventName: PRICING.SKILL_KASPR_ENRICH.event, count: 1 });
  const apiKey = process.env.KASPR_API_KEY;
  if (!apiKey) throw new Error("KASPR_API_KEY is not configured in Actor environment");

  const res = await fetch("https://api.developers.kaspr.io/profile/linkedin", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "accept-version": "v2.0"
    },
    body: JSON.stringify({
      id: linkedin_id,
      name: prospect_name
    })
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e) { data = text; }

  const result = {
    prospect: prospect_name,
    linkedin_id,
    kaspr_data: data,
    status: res.status,
    cost_usd: cost,
    free_credit_used: freeUsed,
    free_credit_remaining: remaining
  };

  graphClient.ingest('skill_kaspr_enrich', { prospect: prospect_name, id: linkedin_id });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ==========================================
// MAIN — Fixed for Apify Standby Mode
// ==========================================

async function main() {
  const standbyPort = process.env.ACTOR_STANDBY_PORT || process.env.ACTOR_WEB_SERVER_PORT;
  console.error(`[Forage] STANDBY_PORT: ${standbyPort}`);
  console.error(`[Forage] WEB_SERVER_URL: ${process.env.ACTOR_WEB_SERVER_URL}`);
  const useHttp = standbyPort || process.env.TRANSPORT === 'http';

  if (useHttp) {
    const port = parseInt(standbyPort || process.env.PORT || '3000');
    const http = await import('http');
    const express = await import('express');
    const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const app = express.default();
    app.use(express.default.json());

    // Streamable HTTP — one transport per session, stored by session ID
    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.all('*', async (req: any, res: any) => {
      try {
        // Extract API token from Authorization header
        currentApiToken = extractToken(req.headers['authorization']);

        // New session: POST with no mcp-session-id header
        if (req.method === 'POST' && !req.headers['mcp-session-id']) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sessionId) => {
              transports.set(sessionId, transport);
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) transports.delete(transport.sessionId);
          };
          const mcpServer = setupMcpServer();
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        // Existing session
        const sessionId = req.headers['mcp-session-id'] as string;
        const transport = sessionId ? transports.get(sessionId) : undefined;
        if (!transport) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[Forage] Error:', err);
        if (!res.headersSent) res.status(500).json({ error: String(err) });
      }
    });

    app.get('/health', (_req: any, res: any) =>
      res.json({ status: 'ok', server: 'forage', transport: 'streamable-http', tools: TOOLS.length }));

    // Keepalive — prevents Apify standby idle timeout from killing the container
    const webServerUrl = process.env.ACTOR_WEB_SERVER_URL;
    if (webServerUrl) {
      setInterval(async () => {
        try {
          await fetch(`${webServerUrl}/health`);
        } catch { /* silent */ }
      }, 3 * 60 * 1000); // every 3 minutes
    }

    http.createServer(app).listen(port, '0.0.0.0', () =>
      console.error(`[Forage] Streamable HTTP MCP server on 0.0.0.0:${port}`));

  } else {
    const mcpServer = setupMcpServer();
    await mcpServer.connect(new StdioServerTransport());
    console.error('[Forage] Gateway on stdio');
  }

  process.on('SIGTERM', async () => { await Actor.exit(); process.exit(0); });
  process.on('SIGINT',  async () => { await Actor.exit(); process.exit(0); });
}

main().catch(console.error);
