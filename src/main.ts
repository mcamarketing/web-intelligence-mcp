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
import {
  INTERCOM_TOOLS,
  verifyIntercomWebhook,
  handleContactCreated,
  handleConversationOpened,
  handleConversationClosed,
  handleUserIntercalated,
  handleIntercomCreateContact,
  handleIntercomGetConversation,
  handleIntercomReply,
  handleIntercomQualifyLead,
  handleIntercomRouteToSales,
} from './intercom-integration.js';

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
  // Intercom Integration
  INTERCOM_CREATE_CONTACT: { event: 'intercom-create-contact', charge: 0.02 },
  INTERCOM_GET_CONVERSATION: { event: 'intercom-get-conversation', charge: 0.02 },
  INTERCOM_REPLY: { event: 'intercom-reply', charge: 0.03 },
  INTERCOM_QUALIFY_LEAD: { event: 'intercom-qualify-lead', charge: 0.25 },
  INTERCOM_ROUTE_TO_SALES: { event: 'intercom-route-to-sales', charge: 0.02 },
};

const VERIFIED_ACTORS = new Map<string, { charge: number; unit: string; desc: string }>([
  // ── Web & content ───────────────────────────────────────────────────────
  ['apify/website-content-crawler',        { charge: 0.20,  unit: 'per_1000_pages',   desc: 'Deep website crawling + text extraction' }],
  ['apify/cheerio-scraper',                { charge: 0.01,  unit: 'per_1000_pages',   desc: 'Fast HTML scraper, email extraction' }],
  ['apify/web-scraper',                    { charge: 0.10,  unit: 'per_1000_pages',   desc: 'Full JS browser scraper' }],
  ['apify/google-search-scraper',          { charge: 0.003, unit: 'per_search',        desc: 'Google search results' }],
  ['drobnikj/pdf-to-text',                 { charge: 0.14,  unit: 'per_100_pages',    desc: 'PDF parsing' }],
  // ── Lead generation ─────────────────────────────────────────────────────
  ['apify/google-maps-scraper',            { charge: 0.27,  unit: 'per_1000_places',  desc: 'Google Maps — local businesses, address, phone, website, reviews' }],
  ['compass/crawler-google-places',        { charge: 0.10,  unit: 'per_1000_places',  desc: 'Google Places enrichment' }],
  ['apify/linkedin-profile-scraper',       { charge: 0.67,  unit: 'per_100_profiles', desc: 'LinkedIn profiles — name, title, company, email' }],
  ['apify/linkedin-company-scraper',       { charge: 0.50,  unit: 'per_100_companies',desc: 'LinkedIn company pages — employees, contacts' }],
  ['anchor/linkedin-people-finder',        { charge: 0.30,  unit: 'per_100_results',  desc: 'LinkedIn people search by title/company' }],
  ['code_crafter/leads-finder',            { charge: 0.25,  unit: 'per_100_leads',    desc: 'B2B leads with emails' }],
  ['easyapi/b2b-leads-hunter',             { charge: 0.20,  unit: 'per_100_leads',    desc: 'B2B leads from multiple sources' }],
  ['curious_coder/apollo-leads-scraper',   { charge: 0.15,  unit: 'per_100_leads',    desc: 'Apollo.io leads without API key' }],
  ['vdrmota/contact-info-scraper',         { charge: 0.05,  unit: 'per_100_pages',    desc: 'Extract emails, phones from any website' }],
  ['bebity/email-finder',                  { charge: 0.10,  unit: 'per_100_emails',   desc: 'Find emails by domain or name' }],
  // ── Social media ────────────────────────────────────────────────────────
  ['apify/instagram-scraper',              { charge: 0.20,  unit: 'per_1000_posts',   desc: 'Instagram posts, profiles, hashtags' }],
  ['clockworks/free-twitter-scraper',      { charge: 0.05,  unit: 'per_1000_tweets',  desc: 'Twitter/X data' }],
  ['apify/tiktok-scraper',                 { charge: 0.30,  unit: 'per_1000_posts',   desc: 'TikTok posts and profiles' }],
  ['apify/facebook-pages-scraper',         { charge: 0.25,  unit: 'per_1000_posts',   desc: 'Facebook pages data' }],
  ['apify/reddit-scraper',                 { charge: 0.05,  unit: 'per_1000_posts',   desc: 'Reddit posts and comments' }],
  // ── E-commerce & reviews ────────────────────────────────────────────────
  ['apify/amazon-product-scraper',         { charge: 0.20,  unit: 'per_1000_items',   desc: 'Amazon products, prices, reviews' }],
  ['apify/tripadvisor-scraper',            { charge: 0.20,  unit: 'per_1000_reviews', desc: 'TripAdvisor reviews and listings' }],
  ['apify/trustpilot-scraper',             { charge: 0.10,  unit: 'per_1000_reviews', desc: 'Trustpilot company reviews' }],
  ['apify/booking-scraper',                { charge: 0.20,  unit: 'per_1000_items',   desc: 'Booking.com hotels and availability' }],
  // ── Jobs & recruitment ──────────────────────────────────────────────────
  ['apify/indeed-scraper',                 { charge: 0.10,  unit: 'per_1000_jobs',    desc: 'Indeed job listings' }],
  ['apify/linkedin-jobs-scraper',          { charge: 0.20,  unit: 'per_100_jobs',     desc: 'LinkedIn job postings' }],
  // ── Intelligence & OSINT ────────────────────────────────────────────────
  ['apify/yelp-scraper',                   { charge: 0.10,  unit: 'per_1000_items',   desc: 'Yelp businesses and reviews' }],
  ['apify/yellow-pages-scraper',           { charge: 0.05,  unit: 'per_1000_items',   desc: 'Yellow Pages business listings' }],
  ['epctex/crunchbase-scraper',            { charge: 0.20,  unit: 'per_100_companies',desc: 'Crunchbase funding, investors, teams' }],
]);

// ==========================================
// FREE CREDIT SYSTEM ($1 per user)
// ==========================================

const FREE_CREDIT_USD = 5.0;
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

// Skip charging — billing not configured on free tier
async function chargeIfNotOwner(eventName: string, count: number = 1) {
  try {
    await Actor.charge({ eventName, count });
  } catch (e: any) {
    // Silently ignore 403 (billing not set up)
  }
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
  { name: 'find_local_leads', description: 'Find local businesses by type and location via Google Maps. Returns name, address, phone, website, rating — and automatically scrapes emails from each website. Up to 200 results. Use for medspas, dentists, restaurants, gyms, any local business. Cost: $0.15', inputSchema: { type: 'object', properties: { keyword: { type: 'string', description: 'e.g. "medspa" or "dental clinic"' }, location: { type: 'string', description: 'e.g. "London, UK" or "New York"' }, max_results: { type: 'number', default: 50, description: 'Up to 200' }, enrich_emails: { type: 'boolean', default: true, description: 'Scrape emails from each website' } }, required: ['keyword', 'location'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
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
  { name: 'list_verified_actors', description: 'List available Apify actors that can be run via call_actor. Returns actor IDs, descriptions, and pricing. Use before call_actor to find the right actor. Cost: $0.01', inputSchema: { type: 'object', properties: { category: { type: 'string', default: 'all' } } }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'get_actor_schema', description: 'Get input schema and pricing for a specific Apify actor. Use before call_actor to understand required parameters. Cost: $0.01', inputSchema: { type: 'object', properties: { actor_id: { type: 'string' } }, required: ['actor_id'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'call_actor', description: 'Execute any Apify actor with custom input. Use list_verified_actors and get_actor_schema first to find actors and understand inputs. Set max_cost_usd to limit spending. Cost: actor price + 25%', inputSchema: { type: 'object', properties: { actor_id: { type: 'string' }, input: { type: 'object' }, timeout_secs: { type: 'number', default: 120 }, max_cost_usd: { type: 'number' } }, required: ['actor_id', 'input'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'search_apify_store', description: 'Search the Apify actor store (1500+ actors). Use to find the right actor for any task not covered by core tools — emails, LinkedIn, social media, jobs, real estate, e-commerce, AI, and more. Then call it with call_actor. Free', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'e.g. "linkedin email finder" or "instagram scraper"' }, category: { type: 'string', description: 'Optional: lead-generation, social-media, e-commerce, travel, real-estate, jobs, ai, web-scraping' }, limit: { type: 'number', default: 20 } }, required: ['query'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  // ── SKILLS — deep multi-actor research bundles ─────────────────────────────
  { name: 'skill_company_dossier', description: 'Deep company profile: website summary, key contacts, LinkedIn data, funding/investors from Crunchbase, phones, social links, news. Orchestrates 6+ actors in parallel. Cost: $0.50', inputSchema: { type: 'object', properties: { domain: { type: 'string', description: 'e.g. "stripe.com"' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_prospect_company', description: 'Find senior decision-makers at a company: C-suite, VPs, directors with emails and LinkedIn. Uses LinkedIn scrapers + Apollo (no API key). Cost: $0.75', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, seniority: { type: 'string', default: 'senior,director,vp,c_suite', description: 'Comma-separated seniority levels' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_outbound_list', description: 'Generate outbound lead list (200+ leads) with verified emails and LinkedIn. Filters by job title, location, industry, company size. Uses 5 parallel lead-gen actors. Cost: $3.50', inputSchema: { type: 'object', properties: { job_title: { type: 'string' }, location: { type: 'string' }, industry: { type: 'string' }, company_size: { type: 'string' } }, required: ['job_title'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_local_market_map', description: 'Map all local businesses of a type in a city: names, addresses, phones, websites, emails, ratings. Uses Google Maps + Yelp + Yellow Pages in parallel. Up to 100 businesses. Cost: $0.80', inputSchema: { type: 'object', properties: { business_type: { type: 'string', description: 'e.g. "medspa" or "accountants"' }, location: { type: 'string', description: 'e.g. "London, UK"' } }, required: ['business_type', 'location'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_competitor_intel', description: 'Full competitor intelligence: pricing page, features, about, reviews from Trustpilot, G2, Capterra, and Google. Scrapes 8+ pages and searches in parallel. Cost: $0.80', inputSchema: { type: 'object', properties: { competitor_url: { type: 'string', description: 'e.g. "https://competitor.com"' }, focus: { type: 'string', enum: ['pricing', 'features', 'both'], default: 'both' } }, required: ['competitor_url'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_decision_maker_finder', description: 'Find department heads and decision-makers at a company by department. Combines LinkedIn people search, Apollo scraper, and email discovery. Cost: $1.00', inputSchema: { type: 'object', properties: { domain: { type: 'string' }, departments: { type: 'string', default: 'sales,marketing,engineering,executive', description: 'Comma-separated departments' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_competitor_ads', description: 'Research competitor advertising strategy: Facebook Ad Library, Google Transparency, ad copy examples, landing pages. Cost: $0.65', inputSchema: { type: 'object', properties: { competitor_name: { type: 'string' }, competitor_domain: { type: 'string' } }, required: ['competitor_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_job_signals', description: 'Analyse a company\'s hiring signals: job titles on Indeed + LinkedIn, department breakdown, careers page content. Reveals growth stage and strategic priorities. Cost: $0.55', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_tech_stack', description: 'Detect a company\'s technology stack: BuiltWith data, Wappalyzer-style page signals, StackShare profile, engineering blog mentions, job tech requirements. Cost: $0.45', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_funding_intel', description: 'Research a company\'s funding history: Crunchbase data (rounds, investors, valuation), TechCrunch articles, press releases. Cost: $0.70', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_social_proof', description: 'Gather social proof: Trustpilot reviews (structured), G2 ratings, Capterra ratings, own-site testimonials and case studies. Cost: $0.55', inputSchema: { type: 'object', properties: { company_name: { type: 'string' }, domain: { type: 'string' } }, required: ['company_name'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_market_map', description: 'Map an entire market: top players, comparison sites, pricing tiers, G2/Capterra category pages. Returns structured competitive landscape. Cost: $1.20', inputSchema: { type: 'object', properties: { market: { type: 'string', description: 'e.g. "CRM software" or "email marketing"' }, max_competitors: { type: 'number', default: 10 } }, required: ['market'] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: 'skill_kaspr_enrich', description: 'Enrich a LinkedIn profile: name, headline, experience, email, phone, skills. Uses LinkedIn profile scraper + people finder. Cost: $0.75', inputSchema: { type: 'object', properties: { linkedin_id: { type: 'string', description: 'LinkedIn URL or profile ID' }, prospect_name: { type: 'string' } }, required: [] }, annotations: { readOnlyHint: true, destructiveHint: false } },
  // ── INTERCOM INTEGRATION ────────────────────────────────────────────────────
  ...INTERCOM_TOOLS,
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
        case 'search_apify_store': return await handleSearchApifyStore(args as any);
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
        // Intercom tools
        case 'intercom_create_contact': return await handleIntercomCreateContact(args as any);
        case 'intercom_get_conversation': return await handleIntercomGetConversation(args as any);
        case 'intercom_reply': return await handleIntercomReply(args as any);
        case 'intercom_qualify_lead': return await handleIntercomQualifyLead(args as any);
        case 'intercom_route_to_sales': return await handleIntercomRouteToSales(args as any);
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

/**
 * Run any Apify actor and return dataset items.
 * Polls until SUCCEEDED/FAILED. Returns [] on any failure.
 */
async function runActor(actorId: string, input: Record<string, any>, timeoutMs = 5 * 60 * 1000, itemLimit = 500): Promise<any[]> {
  try {
    const run = await Actor.start(actorId, input);
    const start = Date.now();
    let poll = 2500;
    while (Date.now() - start < timeoutMs) {
      const runInfo = await Actor.apifyClient.run(run.id).get();
      if (!runInfo) break;
      if (runInfo.status === 'SUCCEEDED') {
        const dataset = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ limit: itemLimit });
        return dataset.items as any[];
      }
      if (['FAILED', 'ABORTED', 'TIMED_OUT'].includes(runInfo.status!)) break;
      await new Promise(r => setTimeout(r, poll));
      poll = Math.min(poll * 1.4, 12000);
    }
  } catch (e: any) {
    console.error(`[runActor] ${actorId} error:`, e.message);
  }
  return [];
}

/**
 * Free search using apify/google-search-scraper — no external API key needed.
 * Returns an array of { title, url, snippet } objects.
 */
async function apifySearch(query: string, num = 10): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const run = await Actor.start('apify/google-search-scraper', {
      queries: query,
      resultsPerPage: Math.min(num, 100),
      maxPagesPerQuery: 1,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    });
    const timeout = 3 * 60 * 1000;
    const startTime = Date.now();
    let pollInterval = 2000;
    while (Date.now() - startTime < timeout) {
      const runInfo = await Actor.apifyClient.run(run.id).get();
      if (!runInfo) break;
      if (runInfo.status === 'SUCCEEDED') {
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ limit: 250 });
        const organic: Array<{ title: string; url: string; snippet: string }> = [];
        for (const item of result.items as any[]) {
          for (const r of (item.organicResults || []) as any[]) {
            organic.push({ title: r.title || '', url: r.url || r.link || '', snippet: r.description || r.snippet || '' });
          }
        }
        return organic.slice(0, num);
      }
      if (['FAILED', 'ABORTED', 'TIMED_OUT'].includes(runInfo.status!)) break;
      await new Promise(r => setTimeout(r, pollInterval));
      pollInterval = Math.min(pollInterval * 1.5, 10000);
    }
  } catch (e) {
    console.error('[apifySearch] error:', e);
  }
  return [];
}

/**
 * Free scrape using direct axios + cheerio — no API key needed.
 * Returns cleaned text content, or null on failure.
 */
async function axiosScrape(url: string, maxChars = 3000): Promise<string | null> {
  try {
    const res = await axios.get(url, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForageBot/1.0)' },
      maxRedirects: 3,
    });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, header').remove();
    const text = ($('main, article, .content').first().text() || $('body').text())
      .replace(/\s+/g, ' ')
      .trim();
    return text.substring(0, maxChars) || null;
  } catch { return null; }
}

/**
 * Fetch page content — tries Jina first (if key present), then direct scrape.
 */
async function fetchPage(url: string, maxChars = 3000): Promise<string | null> {
  const jinaResult = await jinaFetch(url, maxChars);
  if (jinaResult) return jinaResult;
  return axiosScrape(url, maxChars);
}

/**
 * Search — tries SerpAPI first (if key present), then Apify google-search-scraper.
 */
async function smartSearch(query: string, num = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const serpResults = await serpSearch(query, num);
  if (serpResults.length > 0) {
    return serpResults.map((r: any) => ({ title: r.title || '', url: r.link || '', snippet: r.snippet || '' }));
  }
  return apifySearch(query, num);
}

// ==========================================
// FREE EMAIL SCRAPER (replaces Apollo.io)
// ==========================================

/**
 * Scrape email addresses from a company domain using direct HTTP + cheerio.
 * Falls back to apify/cheerio-scraper when the direct pass finds fewer than `limit` emails.
 * No paid API keys required — only APIFY_TOKEN (already in env) for the fallback.
 */
async function scrapeEmailsFromDomain(
  cleanDomain: string,
  limit = 10,
): Promise<Array<{ email: string; source_url: string; confidence: number }>> {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const found = new Map<string, { email: string; source_url: string; confidence: number }>();

  const addEmails = (emails: string[], mailtoSet: Set<string>, sourceUrl: string) => {
    for (const raw of emails) {
      const email = raw.toLowerCase();
      if (/noreply|no-reply|donotreply|example\.com|sentry\.io|\.png@|\.jpg@/.test(email)) continue;
      if (!found.has(email)) {
        const isDomainMatch = email.endsWith(`@${cleanDomain}`);
        const isMailto = mailtoSet.has(email);
        found.set(email, { email, source_url: sourceUrl, confidence: isDomainMatch ? (isMailto ? 0.95 : 0.85) : 0.60 });
      }
    }
  };

  const contactPaths = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/support', '/help'];

  // Pass 1: direct axios + cheerio (fast, zero cost)
  await Promise.allSettled(
    contactPaths.map(async (path) => {
      const url = `https://${cleanDomain}${path}`;
      try {
        const res = await axios.get(url, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForageBot/1.0)' },
          maxRedirects: 3,
        });
        const $ = cheerio.load(res.data);
        const mailtoSet = new Set<string>();
        $('a[href^="mailto:"]').each((_: any, el: any) => {
          const addr = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
          if (addr) mailtoSet.add(addr);
        });
        const bodyHits = ($('body').text().match(emailRegex) || []).map((e: string) => e.toLowerCase());
        addEmails([...bodyHits, ...Array.from(mailtoSet)], mailtoSet, url);
      } catch { /* skip unreachable */ }
    })
  );

  // Pass 2: Apify cheerio-scraper fallback when Pass 1 yield is low
  if (found.size < limit) {
    const apifyToken = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
    if (apifyToken) {
      try {
        const startUrls = contactPaths.slice(0, 4).map(path => ({ url: `https://${cleanDomain}${path}` }));
        const run = await Actor.start('apify/cheerio-scraper', {
          startUrls,
          pageFunction: `async function pageFunction(context) {
            const { $, request } = context;
            const emailRegex = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/g;
            const mailtoEmails = [];
            $('a[href^="mailto:"]').each((_, el) => {
              const addr = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
              if (addr) mailtoEmails.push(addr);
            });
            const found = [...($('body').text().match(emailRegex) || []), ...mailtoEmails];
            return { url: request.url, emails: [...new Set(found)] };
          }`,
          maxRequestsPerCrawl: 6,
          maxConcurrency: 3,
        });

        const actorTimeout = 60000;
        const actorStart = Date.now();
        let pollInterval = 2000;
        while (Date.now() - actorStart < actorTimeout) {
          const runInfo = await Actor.apifyClient.run(run.id).get();
          if (!runInfo) break;
          if (runInfo.status === 'SUCCEEDED') {
            const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId!).listItems({ limit: 50 });
            for (const item of result.items as any[]) {
              const mailtoSet = new Set<string>();
              const emails = ((item.emails || []) as string[]).map(e => e.toLowerCase());
              addEmails(emails, mailtoSet, item.url);
            }
            break;
          }
          if (['FAILED', 'ABORTED', 'TIMED_OUT'].includes(runInfo.status!)) break;
          await new Promise(r => setTimeout(r, pollInterval));
          pollInterval = Math.min(pollInterval * 1.5, 10000);
        }
      } catch (e) {
        console.error('[scrapeEmailsFromDomain] Apify fallback error:', e);
      }
    }
  }

  return Array.from(found.values())
    .sort((a, b) => {
      const aDomain = a.email.endsWith(`@${cleanDomain}`) ? 1 : 0;
      const bDomain = b.email.endsWith(`@${cleanDomain}`) ? 1 : 0;
      if (bDomain !== aDomain) return bDomain - aDomain;
      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}

// ==========================================
// CORE HANDLERS
// ==========================================

async function handleSearchWeb({ query, num_results = 10 }: { query: string; num_results?: number }) {
  const cost = PRICING.SEARCH_WEB.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SEARCH_WEB.event, 1);
  const results = await smartSearch(query, Math.min(num_results, 20));
  graphClient.ingest('search_web', { query, results });
  return { content: [{ type: 'text', text: JSON.stringify({ query, results, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleScrapePage({ url }: { url: string }) {
  const cost = PRICING.SCRAPE_PAGE.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SCRAPE_PAGE.event, 1);
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
  if (charged > 0) await chargeIfNotOwner(PRICING.GET_COMPANY_INFO.event, 1);
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // Check graph first for cached data
  const cached = await graphClient.queryKnowledge(cleanDomain, 0).catch(() => null);

  const result: any = { domain: cleanDomain, cached_graph_data: cached?.results?.[0] || cached || null };

  // Parallel: website content + emails + contact scraper + Google search for company info
  await Promise.allSettled([
    axiosScrape(`https://${cleanDomain}`, 3000).then(text => { result.website_summary = text?.slice(0, 800); }),
    axiosScrape(`https://${cleanDomain}/about`, 2000).then(text => { if (text) result.about_page = text.slice(0, 600); }),
    runActor('vdrmota/contact-info-scraper', { startUrls: [{ url: `https://${cleanDomain}` }], maxDepth: 1, maxPagesPerCrawl: 5 }, 60000, 10)
      .then(items => { const item = items[0]; if (item) { result.phones = item.phones; result.social_links = item.socialMedia; } }),
    apifySearch(`${cleanDomain} company overview investors funding employees`, 5)
      .then(res => { result.web_intel = res.slice(0, 3).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })); }),
    find_emails ? handleFindEmails({ domain: cleanDomain, limit: 5 }).then(r => {
      try { result.emails = JSON.parse((r.content[0] as any).text).emails; } catch { /* silent */ }
    }) : Promise.resolve(),
  ]);

  graphClient.ingest('get_company_info', { domain: cleanDomain, ...result });
  return { content: [{ type: 'text', text: JSON.stringify({ ...result, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, timestamp: new Date().toISOString() }, null, 2) }] };
}

async function handleFindEmails({ domain, limit = 10 }: { domain: string; limit?: number }) {
  const cost = PRICING.FIND_EMAILS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.FIND_EMAILS.event, 1);

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const junk = /noreply|no-reply|donotreply|example\.com|sentry\.io|\.png@|\.jpg@|wixpress|amazonaws/;
  const allEmails = new Map<string, { email: string; source: string; confidence: number }>();

  const addEmail = (raw: string, source: string, baseConf: number) => {
    const email = raw.toLowerCase().trim();
    if (junk.test(email) || email.length > 80) return;
    if (!allEmails.has(email) || allEmails.get(email)!.confidence < baseConf) {
      const isDomain = email.endsWith(`@${cleanDomain}`);
      allEmails.set(email, { email, source, confidence: isDomain ? Math.max(baseConf, 0.85) : baseConf });
    }
  };

  // Fire all sources IN PARALLEL — no waiting for one to finish before starting next
  const contactPaths = ['', '/contact', '/contact-us', '/about', '/about-us', '/team', '/support', '/help'];

  await Promise.allSettled([

    // Source 1: Direct cheerio scrape of contact pages (instant, zero cost)
    Promise.allSettled(contactPaths.map(async (p) => {
      try {
        const res = await axios.get(`https://${cleanDomain}${p}`, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 2 });
        const $ = cheerio.load(res.data);
        $('a[href^="mailto:"]').each((_, el) => {
          const addr = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
          if (addr) addEmail(addr, `mailto:${cleanDomain}${p}`, 0.95);
        });
        ($('body').text().match(emailRegex) || []).forEach(e => addEmail(e, `scrape:${cleanDomain}${p}`, 0.80));
      } catch { /* silent */ }
    })),

    // Source 2: vdrmota/contact-info-scraper — dedicated email extractor
    runActor('vdrmota/contact-info-scraper', {
      startUrls: contactPaths.slice(0, 4).map(p => ({ url: `https://${cleanDomain}${p}` })),
      maxDepth: 1, maxPagesPerCrawl: 8,
    }, 90000).then(items => {
      items.forEach((item: any) => {
        (item.emails || []).forEach((e: string) => addEmail(e, 'contact-info-scraper', 0.85));
      });
    }),

    // Source 3: apify/cheerio-scraper with email regex pageFunction
    runActor('apify/cheerio-scraper', {
      startUrls: [{ url: `https://${cleanDomain}` }],
      pageFunction: `async function pageFunction({ $, request }) {
        const re = /[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/g;
        const mailtos = []; $('a[href^="mailto:"]').each((_,el) => { const h=($(el).attr('href')||'').replace(/^mailto:/i,'').split('?')[0].trim(); if(h) mailtos.push(h); });
        return { url: request.url, emails: [...new Set([...(($('body').text().match(re))||[]), ...mailtos])] };
      }`,
      maxRequestsPerCrawl: 10, maxConcurrency: 5, linkSelector: 'a[href*="contact"],a[href*="about"],a[href*="team"]',
    }, 90000).then(items => {
      items.forEach((item: any) => (item.emails || []).forEach((e: string) => addEmail(e, 'cheerio-scraper', 0.80)));
    }),

    // Source 4: Google search — "@domain.com" and "site:domain.com email"
    apifySearch(`"@${cleanDomain}" OR site:${cleanDomain} email contact`, 20).then(results => {
      results.forEach(r => (r.snippet.match(emailRegex) || []).forEach(e => addEmail(e, 'google-search', 0.70)));
    }),

    // Source 5: bebity/email-finder — dedicated finder actor
    runActor('bebity/email-finder', { domain: cleanDomain, limit: Math.min(limit * 2, 50) }, 90000).then(items => {
      items.forEach((item: any) => {
        if (item.email) addEmail(item.email, 'email-finder', item.verified ? 0.92 : 0.75);
      });
    }),

  ]);

  const sorted = Array.from(allEmails.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  graphClient.ingest('find_emails', { domain: cleanDomain, emails: sorted });

  return { content: [{ type: 'text', text: JSON.stringify({
    domain: cleanDomain, emails_found: sorted.length, emails: sorted,
    sources_used: ['direct-scrape', 'contact-info-scraper', 'cheerio-scraper', 'google-search', 'email-finder'],
    cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
  }, null, 2) }] };
}

async function handleFindLocalLeads({ keyword, location, max_results = 100, enrich_emails = true }: any) {
  const cost = PRICING.FIND_LOCAL_LEADS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.FIND_LOCAL_LEADS.event, 1);

  const query = `${keyword} in ${location}`;
  const limit = Math.min(max_results, 200);
  const placeMap = new Map<string, any>(); // dedup by name+address

  const addPlace = (p: any) => {
    const key = `${(p.name || '').toLowerCase()}|${(p.address || '').toLowerCase()}`;
    if (!placeMap.has(key)) placeMap.set(key, p);
    else Object.assign(placeMap.get(key), p); // merge fields from multiple sources
  };

  // Fire all 4 sources IN PARALLEL — skill says: compass/crawler-google-places → poidata/google-maps-email-extractor → vdrmota/contact-info-scraper
  await Promise.allSettled([

    // Source 1: apify/google-maps-scraper — primary, high volume
    runActor('apify/google-maps-scraper', {
      searchStringsArray: [query], maxCrawledPlacesPerSearch: limit,
      includeHistogram: false, includeOpeningHours: false, language: 'en',
    }, 6 * 60000, 250).then(items => items.forEach((p: any) => addPlace({
      name: p.title || p.name, address: p.address || p.street,
      phone: p.phone || p.phoneUnformatted, website: p.website,
      rating: p.totalScore || p.rating, reviews: p.reviewsCount,
      google_maps_url: p.url, category: p.categoryName || keyword,
    }))),

    // Source 2: compass/crawler-google-places — skill's primary lead-gen actor, includes emails
    runActor('compass/crawler-google-places', {
      searchString: query, maxPlaces: limit, language: 'en',
    }, 6 * 60000, 250).then(items => items.forEach((p: any) => addPlace({
      name: p.title || p.name, address: p.address,
      phone: p.phone, website: p.website, email: p.email,
      rating: p.rating, reviews: p.reviewCount,
    }))),

    // Source 3: poidata/google-maps-email-extractor — specifically for emails from maps listings
    runActor('poidata/google-maps-email-extractor', {
      searchString: query, maxPlaces: Math.min(limit, 100),
    }, 5 * 60000, 150).then(items => items.forEach((p: any) => {
      addPlace({ name: p.title || p.name, address: p.address, phone: p.phone, website: p.website, emails: p.emails || (p.email ? [p.email] : []) });
    })),

    // Source 4: lukaskrivka/google-maps-with-contact-details — email extractor from skill list
    runActor('lukaskrivka/google-maps-with-contact-details', {
      searchString: query, maxPlaces: Math.min(limit, 100),
    }, 5 * 60000, 150).then(items => items.forEach((p: any) => {
      addPlace({ name: p.title || p.name, address: p.address, phone: p.phone, website: p.website, emails: p.emails || [] });
    })),

  ]);

  let places = Array.from(placeMap.values()).slice(0, limit);

  // Fallback if all actors failed
  if (places.length === 0) {
    const results = await apifySearch(`${keyword} ${location} address phone website`, 30);
    places = results.map(r => ({ name: r.title, website: r.url, snippet: r.snippet }));
  }

  // Step 2: Email enrichment via vdrmota/contact-info-scraper on websites that don't have emails yet
  if (enrich_emails) {
    const needsEmail = places.filter(p => p.website && (!p.emails || p.emails.length === 0)).slice(0, 80);
    if (needsEmail.length > 0) {
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const junk = /noreply|no-reply|example\.com|sentry\.io|amazonaws/;

      await Promise.allSettled([
        // Batch scrape with vdrmota/contact-info-scraper
        runActor('vdrmota/contact-info-scraper', {
          startUrls: needsEmail.slice(0, 40).map(p => ({ url: p.website })),
          maxDepth: 1, maxPagesPerCrawl: 80,
        }, 4 * 60000, 100).then(items => {
          items.forEach((item: any) => {
            const place = needsEmail.find(p => item.url?.includes(new URL(p.website).hostname));
            if (place) place.emails = (item.emails || []).filter((e: string) => !junk.test(e)).slice(0, 5);
          });
        }),

        // Direct scrape for remainder
        Promise.allSettled(needsEmail.slice(40).map(async (place) => {
          try {
            const domain = new URL(place.website).hostname;
            const res = await axios.get(`https://${domain}/contact`, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' }, maxRedirects: 2 });
            const found = (res.data.match(emailRegex) || []).filter((e: string) => !junk.test(e));
            if (found.length) place.emails = [...new Set(found)].slice(0, 5);
          } catch { /* silent */ }
        })),
      ]);
    }
  }

  graphClient.ingest('find_local_leads', { keyword, location, leads: places });
  return { content: [{ type: 'text', text: JSON.stringify({
    keyword, location, leads_found: places.length,
    sources_used: ['google-maps-scraper', 'crawler-google-places', 'google-maps-email-extractor', 'google-maps-with-contact-details', 'contact-info-scraper'],
    leads: places, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
  }, null, 2) }] };
}

async function handleFindLeads(args: any) {
  const { job_title, location, industry, company_size, keywords, company_website, num_leads = 100 } = args;
  const chargeUnits = Math.ceil(num_leads / 100);
  const cost = PRICING.FIND_LEADS.charge * chargeUnits;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.FIND_LEADS.event, chargeUnits);

  const searchQuery = [
    job_title ? `"${job_title}"` : '',
    industry || '', location || '', company_size ? `${company_size} employees` : '',
    keywords || '', company_website ? `site:${company_website}` : '',
  ].filter(Boolean).join(' ');

  const leadMap = new Map<string, any>(); // dedup by email or website
  const addLead = (lead: any) => {
    const key = lead.email || lead.website || lead.url || lead.name || Math.random().toString();
    if (!leadMap.has(key)) leadMap.set(key, lead);
    else Object.assign(leadMap.get(key), lead);
  };

  // Fire all sources IN PARALLEL
  await Promise.allSettled([

    // Source 1: code_crafter/leads-finder — Apollo alternative with emails + LinkedIn
    runActor('code_crafter/leads-finder', {
      searchQuery, jobTitle: job_title, location, industry,
      limit: Math.min(num_leads, 100),
    }, 5 * 60000, 200).then(items => items.forEach((l: any) => addLead({
      name: l.fullName || l.name, email: l.email || l.workEmail || l.personalEmail,
      title: l.jobTitle || l.title || job_title, company: l.company || l.companyName,
      linkedin: l.linkedinUrl || l.linkedin, phone: l.phone || l.mobilePhone,
      location: l.location || l.city, source: 'leads-finder',
    }))),

    // Source 2: peakydev/leads-scraper-ppe — $1/1k with emails, similar to Apollo
    runActor('peakydev/leads-scraper-ppe', {
      searchQuery, jobTitle: job_title, location, industry,
      maxResults: Math.min(num_leads, 100),
    }, 5 * 60000, 200).then(items => items.forEach((l: any) => addLead({
      name: l.fullName || l.name, email: l.workEmail || l.email || l.personalEmail,
      title: l.jobTitle || job_title, company: l.companyName || l.company,
      linkedin: l.linkedinUrl, phone: l.mobilePhone, source: 'leads-scraper-ppe',
    }))),

    // Source 3: olympus/b2b-leads-finder — $1/1k like Apollo/LinkedIn
    runActor('olympus/b2b-leads-finder', {
      searchQuery, location, limit: Math.min(num_leads, 100),
    }, 5 * 60000, 200).then(items => items.forEach((l: any) => addLead({
      name: l.name, email: l.email, title: l.title || job_title,
      company: l.company, linkedin: l.linkedin, source: 'b2b-leads-finder',
    }))),

    // Source 4: curious_coder/apollo-leads-scraper — Apollo without API key
    runActor('curious_coder/apollo-leads-scraper', {
      jobTitle: job_title, location, industry, companySize: company_size,
      limit: Math.min(num_leads, 100),
    }, 5 * 60000, 200).then(items => items.forEach((l: any) => addLead({
      name: l.name, email: l.email, title: l.title || job_title,
      company: l.organization?.name || l.company, linkedin: l.linkedin_url,
      location: l.city || l.location, source: 'apollo-scraper',
    }))),

    // Source 5: Google search as broad fallback
    apifySearch(`${searchQuery} email contact`, Math.min(num_leads, 30)).then(results => {
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      results.forEach(r => {
        const emails = r.snippet.match(emailRegex) || [];
        emails.forEach(email => addLead({
          email, website: r.url, company: r.title.replace(/\s*[-|].*$/, '').trim(),
          title: job_title, location, source: 'google-search',
        }));
        if (!emails.length) addLead({ website: r.url, company: r.title.replace(/\s*[-|].*$/, '').trim(), title: job_title, location, source: 'google-search' });
      });
    }),

  ]);

  const leads = Array.from(leadMap.values()).slice(0, num_leads);
  graphClient.ingest('find_leads', { leads });

  return { content: [{ type: 'text', text: JSON.stringify({
    query: { job_title, location, industry, company_size },
    leads_found: leads.length,
    sources_used: ['leads-finder', 'leads-scraper-ppe', 'b2b-leads-finder', 'apollo-scraper', 'google-search'],
    cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
    leads,
  }, null, 2) }] };
}

// ==========================================
// KNOWLEDGE GRAPH HANDLERS
// ==========================================

async function handleQueryKnowledge(args: any) {
  const cost = PRICING.QUERY_KNOWLEDGE.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.QUERY_KNOWLEDGE.event, 1);
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
  if (charged > 0) await chargeIfNotOwner(PRICING.ENRICH_ENTITY.event, 1);
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
  if (charged > 0) await chargeIfNotOwner(PRICING.FIND_CONNECTIONS.event, 1);
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
  if (charged > 0) await chargeIfNotOwner('get-claims', 1);
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
  if (charged > 0) await chargeIfNotOwner('add-claim', 1);
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
  if (charged > 0) await chargeIfNotOwner('get-regime', 1);
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
  if (charged > 0) await chargeIfNotOwner('set-regime', 1);
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
  if (charged > 0) await chargeIfNotOwner('get-signals', 1);
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
  if (charged > 0) await chargeIfNotOwner('add-signal', 1);
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
  if (charged > 0) await chargeIfNotOwner('causal-parents', 1);
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
  if (charged > 0) await chargeIfNotOwner('causal-children', 1);
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
  if (charged > 0) await chargeIfNotOwner('causal-path', 1);
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
  if (charged > 0) await chargeIfNotOwner('simulate', 1);
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
  if (charged > 0) await chargeIfNotOwner('list-regime-entities', 1);
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
  if (charged > 0) await chargeIfNotOwner(PRICING.LIST_ACTORS.event, 1);
  const verified = Array.from(VERIFIED_ACTORS.entries()).map(([actorId, p]) => ({ actor_id: actorId, name: actorId.split('/').pop(), description: p.desc, cost_usd: p.charge, unit: p.unit }));
  return { content: [{ type: 'text', text: JSON.stringify({ actors: category === 'all' ? verified : verified.filter(a => a.description?.includes(category)), cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining }, null, 2) }] };
}

async function handleGetActorSchema({ actor_id }: { actor_id: string }) {
  const cost = PRICING.GET_SCHEMA.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.GET_SCHEMA.event, 1);
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
  if (charged > 0) await chargeIfNotOwner('call-actor', 1);
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
// SKILL HANDLERS — all free, multi-actor parallel
// ==========================================

async function handleSkillCompanyDossier({ domain }: { domain: string }) {
  const cost = PRICING.SKILL_COMPANY_DOSSIER.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_COMPANY_DOSSIER.event, 1);
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // Check graph cache
  const cached = await graphClient.queryKnowledge(cleanDomain, 0).catch(() => null);
  const dossier: any = { domain: cleanDomain, cached_graph_data: cached?.results?.[0] || cached || null };

  await Promise.allSettled([
    // Website pages
    axiosScrape(`https://${cleanDomain}`, 3000).then(t => { dossier.homepage = t?.slice(0, 800); }),
    axiosScrape(`https://${cleanDomain}/about`, 2000).then(t => { if (t) dossier.about = t.slice(0, 600); }),
    axiosScrape(`https://${cleanDomain}/pricing`, 1500).then(t => { if (t) dossier.pricing_page = t.slice(0, 600); }),

    // Contact info scraper — emails, phones, socials
    runActor('vdrmota/contact-info-scraper', {
      startUrls: [{ url: `https://${cleanDomain}` }, { url: `https://${cleanDomain}/about` }, { url: `https://${cleanDomain}/contact` }],
      maxDepth: 1, maxPagesPerCrawl: 6,
    }, 90000, 10).then(items => {
      if (items[0]) { dossier.phones = items[0].phones; dossier.social_links = items[0].socialMedia; dossier.emails_from_site = items[0].emails; }
    }),

    // LinkedIn company profile
    runActor('apify/linkedin-company-scraper', {
      startUrls: [{ url: `https://www.linkedin.com/company/${cleanDomain.split('.')[0]}` }],
    }, 90000, 5).then(items => {
      if (items[0]) dossier.linkedin = { name: items[0].name, description: items[0].description, employees: items[0].staffCount, industry: items[0].industries?.[0], hq: items[0].locations?.[0]?.city };
    }),

    // Crunchbase — funding, investors
    runActor('epctex/crunchbase-scraper', {
      startUrls: [{ url: `https://www.crunchbase.com/organization/${cleanDomain.split('.')[0]}`, method: 'GET' }],
      maxItems: 5,
    }, 90000, 5).then(items => {
      if (items[0]) dossier.funding = { total_raised: items[0].totalFunding, last_round: items[0].lastFundingType, investors: items[0].investors?.slice(0, 5) };
    }),

    // Google search for company overview + news
    apifySearch(`${cleanDomain} company overview funding investors employees`, 5).then(res => {
      dossier.web_intel = res.slice(0, 4).map(r => ({ title: r.title, url: r.url, snippet: r.snippet }));
    }),

    // Key contacts via find_emails
    handleFindEmails({ domain: cleanDomain, limit: 8 }).then(r => {
      try { dossier.key_contacts = JSON.parse((r.content[0] as any).text).emails; } catch { /* silent */ }
    }),
  ]);

  dossier.generated_at = new Date().toISOString();
  dossier.cost_usd = cost;
  dossier.free_credit_used = freeUsed;
  dossier.free_credit_remaining = remaining;
  graphClient.ingest('skill_company_dossier', dossier);
  return { content: [{ type: 'text', text: JSON.stringify(dossier, null, 2) }] };
}

async function handleSkillProspectCompany({ domain, seniority = 'senior,director,vp,c_suite' }: any) {
  const cost = PRICING.SKILL_PROSPECT_COMPANY.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_PROSPECT_COMPANY.event, 1);
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const seniorityLevels = seniority.split(',').map((s: string) => s.trim().toLowerCase());

  const contactMap = new Map<string, any>();
  const addContact = (c: any) => {
    const key = c.email || c.linkedin || c.name || Math.random().toString();
    if (!contactMap.has(key)) contactMap.set(key, c);
    else Object.assign(contactMap.get(key), c);
  };

  await Promise.allSettled([
    // LinkedIn people finder by domain
    runActor('anchor/linkedin-people-finder', {
      companyDomain: cleanDomain, seniority: seniorityLevels.join(','), limit: 25,
    }, 5 * 60000, 50).then(items => items.forEach((p: any) => addContact({
      name: p.name || p.fullName, email: p.email, title: p.title || p.jobTitle,
      seniority: p.seniority, linkedin: p.linkedinUrl || p.linkedin, source: 'linkedin-people-finder',
    }))),

    // Apollo scraper — no API key needed
    runActor('curious_coder/apollo-leads-scraper', {
      domain: cleanDomain, limit: 25,
    }, 5 * 60000, 50).then(items => items.forEach((p: any) => addContact({
      name: p.name, email: p.email, title: p.title,
      seniority: p.seniority, linkedin: p.linkedin_url, source: 'apollo-scraper',
    }))),

    // LinkedIn company scraper to extract employee list
    runActor('apify/linkedin-company-scraper', {
      startUrls: [{ url: `https://www.linkedin.com/company/${cleanDomain.split('.')[0]}` }],
    }, 5 * 60000, 5).then(items => {
      if (items[0]?.employees) {
        items[0].employees.slice(0, 15).forEach((e: any) => addContact({
          name: e.name, title: e.title, linkedin: e.linkedinUrl, source: 'linkedin-company',
        }));
      }
    }),

    // Direct email scraping as fallback
    handleFindEmails({ domain: cleanDomain, limit: 15 }).then(r => {
      try {
        const data = JSON.parse((r.content[0] as any).text);
        data.emails?.forEach((e: any) => addContact({ email: e.email, source: 'email-scraper', confidence: e.confidence }));
      } catch { /* silent */ }
    }),
  ]);

  const contacts = Array.from(contactMap.values())
    .filter(c => c.name || c.email)
    .slice(0, 20);

  const result = {
    domain: cleanDomain, seniority_filter: seniorityLevels,
    decision_makers_found: contacts.length, contacts,
    sources_used: ['linkedin-people-finder', 'apollo-scraper', 'linkedin-company', 'email-scraper'],
    cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
  };
  graphClient.ingest('skill_prospect_company', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillOutboundList({ job_title, location, industry, company_size }: any) {
  const cost = PRICING.SKILL_OUTBOUND_LIST.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_OUTBOUND_LIST.event, 1);

  const leadMap = new Map<string, any>();
  const addLead = (lead: any) => {
    const key = lead.email || lead.linkedin || lead.name || Math.random().toString();
    if (!leadMap.has(key)) leadMap.set(key, lead);
    else Object.assign(leadMap.get(key), lead);
  };
  const normalize = (l: any, src: string) => ({
    name: l.fullName || l.name, email: l.workEmail || l.email || l.personalEmail,
    title: l.jobTitle || l.title || job_title, company: l.companyName || l.company || l.organization?.name,
    linkedin: l.linkedinUrl || l.linkedin_url || l.linkedin,
    phone: l.mobilePhone || l.phone, location: l.location || l.city,
    company_size: l.companySize || company_size, source: src,
  });

  // 5 actors in parallel — cast as wide a net as possible
  await Promise.allSettled([
    runActor('code_crafter/leads-finder', {
      jobTitle: job_title, locationInclude: location || '', emailStatus: 'verified',
      size: company_size || '', industry: industry || '', leadsCount: 100,
    }, 8 * 60000, 200).then(items => items.forEach((l: any) => addLead(normalize(l, 'leads-finder')))),

    runActor('peakydev/leads-scraper-ppe', {
      jobTitle: job_title, location, industry, maxResults: 100,
    }, 6 * 60000, 200).then(items => items.forEach((l: any) => addLead(normalize(l, 'leads-scraper-ppe')))),

    runActor('curious_coder/apollo-leads-scraper', {
      jobTitle: job_title, location, industry, companySize: company_size, limit: 100,
    }, 6 * 60000, 200).then(items => items.forEach((l: any) => addLead(normalize(l, 'apollo-scraper')))),

    runActor('easyapi/b2b-leads-hunter', {
      jobTitle: job_title, location, industry, limit: 100,
    }, 6 * 60000, 200).then(items => items.forEach((l: any) => addLead(normalize(l, 'b2b-leads-hunter')))),

    runActor('anchor/linkedin-people-finder', {
      jobTitle: job_title, location, industry, seniority: 'senior,director,vp,c_suite', limit: 100,
    }, 6 * 60000, 200).then(items => items.forEach((l: any) => addLead(normalize(l, 'linkedin-people-finder')))),
  ]);

  const leads = Array.from(leadMap.values()).filter(l => l.name || l.email).slice(0, 200);
  graphClient.ingest('skill_outbound_list', { leads });
  return { content: [{ type: 'text', text: JSON.stringify({
    job_title, location, industry,
    total_leads: leads.length,
    verified_emails: leads.filter(l => l.email).length,
    sources_used: ['leads-finder', 'leads-scraper-ppe', 'apollo-scraper', 'b2b-leads-hunter', 'linkedin-people-finder'],
    leads, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining, export_ready: true,
  }, null, 2) }] };
}

async function handleSkillLocalMarketMap({ business_type, location }: any) {
  const cost = PRICING.SKILL_LOCAL_MARKET_MAP.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_LOCAL_MARKET_MAP.event, 1);

  const query = `${business_type} in ${location}`;
  const placeMap = new Map<string, any>();
  const addPlace = (p: any) => {
    const key = `${(p.name || '').toLowerCase()}|${(p.address || '').toLowerCase()}`;
    if (!placeMap.has(key)) placeMap.set(key, p);
    else Object.assign(placeMap.get(key), p);
  };

  await Promise.allSettled([
    runActor('apify/google-maps-scraper', {
      searchStringsArray: [query], maxCrawledPlacesPerSearch: 60,
      includeHistogram: false, includeOpeningHours: false, language: 'en',
    }, 6 * 60000, 150).then(items => items.forEach((p: any) => addPlace({
      name: p.title || p.name, address: p.address || p.street,
      phone: p.phone || p.phoneUnformatted, website: p.website,
      rating: p.totalScore || p.rating, reviews: p.reviewsCount,
      google_maps_url: p.url, category: p.categoryName || business_type,
    }))),

    runActor('compass/crawler-google-places', {
      searchString: query, maxPlaces: 60, language: 'en',
    }, 6 * 60000, 150).then(items => items.forEach((p: any) => addPlace({
      name: p.title || p.name, address: p.address,
      phone: p.phone, website: p.website, email: p.email,
      rating: p.rating, reviews: p.reviewCount,
    }))),

    runActor('poidata/google-maps-email-extractor', {
      searchString: query, maxPlaces: 60,
    }, 5 * 60000, 100).then(items => items.forEach((p: any) => addPlace({
      name: p.title || p.name, address: p.address,
      phone: p.phone, website: p.website, emails: p.emails || (p.email ? [p.email] : []),
    }))),

    // Yelp for reviews + ratings
    runActor('apify/yelp-scraper', {
      searchTerm: business_type, location, maxResults: 40,
    }, 4 * 60000, 80).then(items => items.forEach((p: any) => addPlace({
      name: p.name, address: p.address, phone: p.phone, website: p.website,
      rating: p.rating, reviews: p.reviewCount, yelp_url: p.url,
    }))),

    // Yellow Pages for extra coverage
    runActor('apify/yellow-pages-scraper', {
      search: business_type, location, maxItems: 40,
    }, 4 * 60000, 80).then(items => items.forEach((p: any) => addPlace({
      name: p.name, address: p.address, phone: p.phone, website: p.website,
    }))),
  ]);

  let businesses = Array.from(placeMap.values()).slice(0, 100);
  if (businesses.length === 0) {
    const fallback = await apifySearch(`${query} address phone website`, 20);
    businesses = fallback.map(r => ({ name: r.title, website: r.url, snippet: r.snippet }));
  }

  const result = {
    business_type, location, total_found: businesses.length,
    sources_used: ['google-maps-scraper', 'crawler-google-places', 'google-maps-email-extractor', 'yelp-scraper', 'yellow-pages-scraper'],
    businesses, cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
  };
  graphClient.ingest('skill_local_market_map', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillCompetitorIntel({ competitor_url, focus = 'both' }: any) {
  const cost = PRICING.SKILL_COMPETITOR_INTEL.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_COMPETITOR_INTEL.event, 1);

  const cleanUrl = competitor_url.replace(/\/$/, '');
  const competitorName = cleanUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].split('.')[0];
  const cleanDomain = cleanUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const intel: any = { competitor: cleanUrl, competitor_name: competitorName, focus };

  await Promise.allSettled([
    // Scrape key pages directly
    axiosScrape(cleanUrl, 3000).then(t => { intel.homepage = t?.slice(0, 800); }),
    axiosScrape(`${cleanUrl}/pricing`, 3000).then(t => { intel.pricing_page = t?.slice(0, 1200); }),
    axiosScrape(`${cleanUrl}/features`, 2000).then(t => { intel.features_page = t?.slice(0, 1000); }),
    axiosScrape(`${cleanUrl}/about`, 1500).then(t => { intel.about_page = t?.slice(0, 600); }),

    // Trustpilot reviews
    runActor('apify/trustpilot-scraper', {
      startUrls: [{ url: `https://www.trustpilot.com/review/${cleanDomain}` }],
      maxReviews: 20,
    }, 4 * 60000, 30).then(items => {
      intel.trustpilot_reviews = items.slice(0, 10).map((r: any) => ({
        rating: r.rating, title: r.title, text: r.text?.slice(0, 200), date: r.date,
      }));
    }),

    // Search: pricing, features, reviews
    apifySearch(`${competitorName} pricing plans 2025`, 5).then(r => { intel.pricing_intel = r.slice(0, 3); }),
    apifySearch(`${competitorName} reviews site:g2.com OR site:capterra.com OR site:trustpilot.com`, 5).then(r => { intel.review_intel = r.slice(0, 3); }),
    apifySearch(`${competitorName} features product`, 5).then(r => { intel.feature_intel = r.slice(0, 3); }),
  ]);

  intel.cost_usd = cost;
  intel.free_credit_used = freeUsed;
  intel.free_credit_remaining = remaining;
  graphClient.ingest('skill_competitor_intel', intel);
  return { content: [{ type: 'text', text: JSON.stringify(intel, null, 2) }] };
}

async function handleSkillDecisionMakerFinder({ domain, departments = 'sales,marketing,engineering,executive' }: any) {
  const cost = PRICING.SKILL_DECISION_MAKER.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_DECISION_MAKER.event, 1);
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const deptList = departments.split(',').map((d: string) => d.trim().toLowerCase());

  const contactMap = new Map<string, any>();
  const addContact = (c: any) => {
    const key = c.email || c.linkedin || c.name || Math.random().toString();
    if (!contactMap.has(key)) contactMap.set(key, c);
    else Object.assign(contactMap.get(key), c);
  };

  await Promise.allSettled([
    // LinkedIn people finder — C-suite + VPs
    runActor('anchor/linkedin-people-finder', {
      companyDomain: cleanDomain, seniority: 'c_suite,vp,director,senior', limit: 30,
    }, 5 * 60000, 60).then(items => items.forEach((p: any) => addContact({
      name: p.name || p.fullName, email: p.email, title: p.title || p.jobTitle,
      seniority: p.seniority, department: p.department, linkedin: p.linkedinUrl, source: 'linkedin-people-finder',
    }))),

    // Apollo scraper — no API key
    runActor('curious_coder/apollo-leads-scraper', {
      domain: cleanDomain, seniority: 'c_suite,vp,director', limit: 30,
    }, 5 * 60000, 60).then(items => items.forEach((p: any) => addContact({
      name: p.name, email: p.email, title: p.title,
      seniority: p.seniority, department: p.departments?.[0], linkedin: p.linkedin_url, source: 'apollo-scraper',
    }))),

    // Search LinkedIn by department
    ...deptList.slice(0, 3).map(dept =>
      apifySearch(`${cleanDomain} "${dept}" director OR VP OR head site:linkedin.com`, 5).then(results => {
        results.forEach(r => addContact({ title: `${dept} leader`, website: r.url, company: cleanDomain, source: 'linkedin-search' }));
      })
    ),

    // Email scraping
    handleFindEmails({ domain: cleanDomain, limit: 15 }).then(r => {
      try {
        const data = JSON.parse((r.content[0] as any).text);
        data.emails?.forEach((e: any) => addContact({ email: e.email, source: 'email-scraper' }));
      } catch { /* silent */ }
    }),
  ]);

  const seniorityOrder = ['c_suite', 'vp', 'director', 'senior', 'manager', 'junior'];
  const contacts = Array.from(contactMap.values())
    .filter(c => c.name || c.email)
    .sort((a, b) => (seniorityOrder.indexOf(a.seniority) || 99) - (seniorityOrder.indexOf(b.seniority) || 99))
    .slice(0, 25);

  const result = {
    domain: cleanDomain, departments: deptList, contacts_found: contacts.length, contacts,
    sources_used: ['linkedin-people-finder', 'apollo-scraper', 'linkedin-search', 'email-scraper'],
    cost_usd: cost, free_credit_used: freeUsed, free_credit_remaining: remaining,
  };
  graphClient.ingest('skill_decision_maker_finder', result);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function handleSkillCompetitorAds({ competitor_name, competitor_domain }: any) {
  const cost = PRICING.SKILL_COMPETITOR_ADS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_COMPETITOR_ADS.event, 1);

  const fbLibraryUrl = `https://www.facebook.com/ads/library/?active_status=active&ad_type=ALL&country=ALL&q=${encodeURIComponent(competitor_name)}&search_type=keyword_unordered`;
  const googleTransparencyUrl = `https://adstransparency.google.com/?region=anywhere&advertiserName=${encodeURIComponent(competitor_name)}`;
  const intel: any = { competitor: competitor_name, domain: competitor_domain || null };

  await Promise.allSettled([
    // Scrape ad library pages directly
    axiosScrape(fbLibraryUrl, 2000).then(t => { intel.facebook_ad_library = { url: fbLibraryUrl, content: t || 'Visit URL manually' }; }),
    axiosScrape(googleTransparencyUrl, 2000).then(t => { intel.google_ads_transparency = { url: googleTransparencyUrl, content: t || 'Visit URL manually' }; }),

    // If domain given — scrape landing pages
    competitor_domain
      ? axiosScrape(`https://${competitor_domain.replace(/^https?:\/\//, '')}`, 2000).then(t => { intel.landing_page = t?.slice(0, 800); })
      : Promise.resolve(),

    // Search for ad intelligence
    apifySearch(`${competitor_name} facebook ad examples copy creative`, 5).then(r => { intel.fb_ad_intel = r.slice(0, 4); }),
    apifySearch(`${competitor_name} google ads strategy keywords`, 5).then(r => { intel.google_ad_intel = r.slice(0, 4); }),
    apifySearch(`${competitor_name} best performing ads 2025`, 5).then(r => { intel.ad_performance_intel = r.slice(0, 4); }),
  ]);

  intel.manual_links = [fbLibraryUrl, googleTransparencyUrl];
  intel.cost_usd = cost;
  intel.free_credit_used = freeUsed;
  intel.free_credit_remaining = remaining;
  graphClient.ingest('skill_competitor_ads', intel);
  return { content: [{ type: 'text', text: JSON.stringify(intel, null, 2) }] };
}

async function handleSkillJobSignals({ company_name, domain }: any) {
  const cost = PRICING.SKILL_JOB_SIGNALS.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_JOB_SIGNALS.event, 1);

  const signals: any = { company: company_name, domain: domain || null };

  await Promise.allSettled([
    // Indeed job listings
    runActor('apify/indeed-scraper', {
      queries: [{ keyword: company_name, location: '' }], maxItems: 30,
    }, 5 * 60000, 50).then(items => {
      signals.indeed_jobs = items.slice(0, 20).map((j: any) => ({
        title: j.positionName || j.title, company: j.company,
        location: j.location, date: j.date, url: j.url,
      }));
    }),

    // LinkedIn jobs
    runActor('apify/linkedin-jobs-scraper', {
      queries: [{ keyword: company_name, location: '' }], maxJobs: 30,
    }, 5 * 60000, 50).then(items => {
      signals.linkedin_jobs = items.slice(0, 20).map((j: any) => ({
        title: j.title, company: j.company, location: j.location,
        date: j.postedAt, url: j.link, seniority: j.seniorityLevel,
      }));
    }),

    // Scrape careers page directly
    domain
      ? (async () => {
          const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          for (const path of ['/careers', '/jobs', '/work-with-us', '/join-us']) {
            const content = await axiosScrape(`https://${cleanDomain}${path}`, 3000);
            if (content) { signals.careers_page = content.slice(0, 1500); break; }
          }
        })()
      : Promise.resolve(),

    // Search for job postings + signals
    apifySearch(`${company_name} jobs hiring ${new Date().getFullYear()}`, 8).then(r => { signals.job_search_results = r.slice(0, 6); }),
    apifySearch(`${company_name} site:greenhouse.io OR site:lever.co OR site:workable.com`, 5).then(r => { signals.ats_listings = r.slice(0, 5); }),
  ]);

  const allJobs = [...(signals.indeed_jobs || []), ...(signals.linkedin_jobs || [])];
  const deptFreq: Record<string, number> = {};
  allJobs.forEach((j: any) => {
    const t = (j.title || '').toLowerCase();
    ['engineering', 'sales', 'marketing', 'product', 'design', 'data', 'finance', 'hr', 'legal', 'operations'].forEach(d => {
      if (t.includes(d)) deptFreq[d] = (deptFreq[d] || 0) + 1;
    });
  });
  signals.department_breakdown = deptFreq;
  signals.signals_to_watch = ['Engineering spike = product build phase', 'Sales + marketing = growth mode', 'Infra / DevOps = scaling', 'AI / ML roles = tech pivot', 'New departments = strategic expansion'];
  signals.cost_usd = cost;
  signals.free_credit_used = freeUsed;
  signals.free_credit_remaining = remaining;

  graphClient.ingest('skill_job_signals', { company: company_name, job_count: allJobs.length });
  return { content: [{ type: 'text', text: JSON.stringify(signals, null, 2) }] };
}

async function handleSkillTechStack({ domain }: any) {
  const cost = PRICING.SKILL_TECH_STACK.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_TECH_STACK.event, 1);
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const stack: any = { domain: cleanDomain };

  await Promise.allSettled([
    // BuiltWith — most comprehensive tech profiler
    axiosScrape(`https://builtwith.com/${cleanDomain}`, 4000).then(t => { stack.builtwith = t?.slice(0, 2000); }),

    // Wappalyzer alternative via scraper — detect frameworks from page source
    runActor('apify/cheerio-scraper', {
      startUrls: [{ url: `https://${cleanDomain}` }],
      pageFunction: `async function pageFunction({ $, request, html }) {
        const signals = [];
        const h = html || '';
        if (h.includes('react')) signals.push('React');
        if (h.includes('angular')) signals.push('Angular');
        if (h.includes('vue')) signals.push('Vue');
        if (h.includes('next')) signals.push('Next.js');
        if (h.includes('stripe')) signals.push('Stripe');
        if (h.includes('hubspot')) signals.push('HubSpot');
        if (h.includes('segment')) signals.push('Segment');
        if (h.includes('intercom')) signals.push('Intercom');
        if (h.includes('zendesk')) signals.push('Zendesk');
        if (h.includes('salesforce')) signals.push('Salesforce');
        if (h.includes('wordpress')) signals.push('WordPress');
        if (h.includes('shopify')) signals.push('Shopify');
        if (h.includes('gtm') || h.includes('googletagmanager')) signals.push('Google Tag Manager');
        if (h.includes('ga4') || h.includes('gtag')) signals.push('Google Analytics 4');
        return { url: request.url, detected_tech: signals };
      }`,
      maxRequestsPerCrawl: 1,
    }, 60000, 3).then(items => {
      if (items[0]) stack.detected_tech = items[0].detected_tech;
    }),

    // Homepage + careers — for tech mentions
    axiosScrape(`https://${cleanDomain}`, 2000).then(t => { stack.homepage_signals = t?.slice(0, 800); }),
    axiosScrape(`https://${cleanDomain}/careers`, 2000).then(t => { stack.jobs_tech_mentions = t?.slice(0, 1000); }),

    // Engineering blog
    apifySearch(`${cleanDomain} tech stack engineering blog`, 5).then(results => {
      stack.engineering_blog_results = results.slice(0, 4);
    }),

    // StackShare profile
    axiosScrape(`https://stackshare.io/${cleanDomain.split('.')[0]}`, 2000).then(t => { if (t) stack.stackshare = t.slice(0, 800); }),
  ]);

  stack.cost_usd = cost;
  stack.free_credit_used = freeUsed;
  stack.free_credit_remaining = remaining;
  graphClient.ingest('skill_tech_stack', { domain: cleanDomain });
  return { content: [{ type: 'text', text: JSON.stringify(stack, null, 2) }] };
}

async function handleSkillFundingIntel({ company_name, domain }: any) {
  const cost = PRICING.SKILL_FUNDING_INTEL.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_FUNDING_INTEL.event, 1);

  const intel: any = { company: company_name, domain: domain || null };
  const crunchbaseSlug = company_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  await Promise.allSettled([
    // Crunchbase scraper — primary funding source
    runActor('epctex/crunchbase-scraper', {
      startUrls: [{ url: `https://www.crunchbase.com/organization/${crunchbaseSlug}`, method: 'GET' }],
      maxItems: 5,
    }, 3 * 60000, 10).then(items => {
      if (items[0]) intel.crunchbase = {
        total_raised: items[0].totalFunding, last_round: items[0].lastFundingType,
        investors: items[0].investors?.slice(0, 10), founded: items[0].foundedOn,
        valuation: items[0].preMoneyValuation, employee_count: items[0].staffCount,
      };
    }),

    // Scrape Crunchbase page directly as fallback
    axiosScrape(`https://www.crunchbase.com/organization/${crunchbaseSlug}`, 3000).then(t => {
      if (t && !intel.crunchbase) intel.crunchbase_page = t.slice(0, 1500);
    }),

    // News searches
    apifySearch(`${company_name} funding round raised Series 2024 2025`, 8).then(r => { intel.funding_news = r.slice(0, 5); }),
    apifySearch(`${company_name} investors valuation acquisition`, 5).then(r => { intel.investor_intel = r.slice(0, 4); }),
    apifySearch(`${company_name} site:techcrunch.com OR site:businesswire.com OR site:prnewswire.com`, 5).then(r => { intel.press_releases = r.slice(0, 4); }),

    // Scrape news articles
    apifySearch(`${company_name} news announcement`, 5).then(async results => {
      const newsArticles: any[] = [];
      await Promise.allSettled(
        results.filter(r => r.url.includes('techcrunch') || r.url.includes('businesswire')).slice(0, 2).map(async r => {
          const content = await axiosScrape(r.url, 2000);
          if (content) newsArticles.push({ url: r.url, content: content.slice(0, 600) });
        })
      );
      intel.news_articles = newsArticles;
    }),
  ]);

  intel.cost_usd = cost;
  intel.free_credit_used = freeUsed;
  intel.free_credit_remaining = remaining;
  graphClient.ingest('skill_funding_intel', { company: company_name });
  return { content: [{ type: 'text', text: JSON.stringify(intel, null, 2) }] };
}

async function handleSkillSocialProof({ company_name, domain }: any) {
  const cost = PRICING.SKILL_SOCIAL_PROOF.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_SOCIAL_PROOF.event, 1);
  const slug = company_name.toLowerCase().replace(/\s+/g, '-');
  const cleanDomain = domain?.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || slug;

  const proof: any = { company: company_name };

  await Promise.allSettled([
    // Trustpilot via actor — structured reviews
    runActor('apify/trustpilot-scraper', {
      startUrls: [{ url: `https://www.trustpilot.com/review/${cleanDomain}` }],
      maxReviews: 30,
    }, 4 * 60000, 40).then(items => {
      proof.trustpilot = {
        reviews: items.slice(0, 15).map((r: any) => ({
          rating: r.rating, title: r.title, text: r.text?.slice(0, 200), date: r.date,
        })),
        avg_rating: items.length ? (items.reduce((s: number, r: any) => s + (r.rating || 0), 0) / items.length).toFixed(1) : null,
        total_reviews: items.length,
      };
    }),

    // G2 via direct scrape
    axiosScrape(`https://www.g2.com/products/${slug}/reviews`, 3000).then(t => {
      if (t) proof.g2 = t.slice(0, 1200);
    }),

    // Capterra via direct scrape
    axiosScrape(`https://www.capterra.com/reviews/${slug}`, 3000).then(t => {
      if (t) proof.capterra = t.slice(0, 1200);
    }),

    // Own site testimonials
    domain
      ? (async () => {
          for (const path of ['/customers', '/testimonials', '/case-studies', '/reviews']) {
            const content = await axiosScrape(`https://${cleanDomain}${path}`, 2500);
            if (content) { proof.own_testimonials = content.slice(0, 1200); break; }
          }
        })()
      : Promise.resolve(),

    // Search for reviews + case studies
    apifySearch(`${company_name} customer testimonial case study review`, 8).then(r => { proof.review_search = r.slice(0, 5); }),
    apifySearch(`"${company_name}" reviews site:g2.com OR site:capterra.com OR site:getapp.com`, 5).then(r => { proof.review_sites = r.slice(0, 4); }),
  ]);

  proof.cost_usd = cost;
  proof.free_credit_used = freeUsed;
  proof.free_credit_remaining = remaining;
  graphClient.ingest('skill_social_proof', { company: company_name });
  return { content: [{ type: 'text', text: JSON.stringify(proof, null, 2) }] };
}

async function handleSkillMarketMap({ market, max_competitors = 10 }: any) {
  const cost = PRICING.SKILL_MARKET_MAP.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_MARKET_MAP.event, 1);

  const map: any = { market, max_competitors };

  await Promise.allSettled([
    // Multiple search angles
    apifySearch(`best ${market} tools software 2025`, 10).then(r => { map.best_tools = r.slice(0, 8); }),
    apifySearch(`top ${market} companies players`, 8).then(r => { map.top_players = r.slice(0, 6); }),
    apifySearch(`${market} alternatives competitors comparison`, 8).then(r => { map.comparison = r.slice(0, 6); }),
    apifySearch(`${market} pricing comparison tiers 2025`, 5).then(r => { map.pricing_intel = r.slice(0, 4); }),

    // G2 comparison page
    axiosScrape(`https://www.g2.com/categories/${market.toLowerCase().replace(/\s+/g, '-')}`, 3000).then(t => {
      if (t) map.g2_category = t.slice(0, 2000);
    }),

    // Capterra comparison
    axiosScrape(`https://www.capterra.com/${market.toLowerCase().replace(/\s+/g, '-')}-software/`, 3000).then(t => {
      if (t) map.capterra_category = t.slice(0, 2000);
    }),

    // Scrape any G2/Capterra results that show up in best-tools
    apifySearch(`${market} site:g2.com/categories OR site:capterra.com`, 4).then(async results => {
      const pages: any[] = [];
      await Promise.allSettled(results.slice(0, 2).map(async r => {
        const content = await axiosScrape(r.url, 2000);
        if (content) pages.push({ url: r.url, content: content.slice(0, 1000) });
      }));
      map.comparison_pages = pages;
    }),
  ]);

  map.note = 'Use comparison_pages + g2_category to extract player names, positioning and pricing tiers';
  map.cost_usd = cost;
  map.free_credit_used = freeUsed;
  map.free_credit_remaining = remaining;
  graphClient.ingest('skill_market_map', { market });
  return { content: [{ type: 'text', text: JSON.stringify(map, null, 2) }] };
}

async function handleSkillKasprEnrich({ linkedin_id, prospect_name }: any) {
  const cost = PRICING.SKILL_KASPR_ENRICH.charge;
  const { charged, freeUsed, remaining } = applyCredit(cost);
  if (charged > 0) await chargeIfNotOwner(PRICING.SKILL_KASPR_ENRICH.event, 1);

  const profile: any = { prospect: prospect_name, linkedin_id };

  await Promise.allSettled([
    // LinkedIn profile scraper
    linkedin_id
      ? runActor('apify/linkedin-profile-scraper', {
          profileUrls: [linkedin_id.startsWith('http') ? linkedin_id : `https://www.linkedin.com/in/${linkedin_id}`],
        }, 3 * 60000, 5).then(items => {
          if (items[0]) profile.linkedin_data = {
            name: items[0].name, headline: items[0].headline,
            about: items[0].about, experience: items[0].experience?.slice(0, 3),
            education: items[0].education?.slice(0, 2), skills: items[0].skills?.slice(0, 10),
            email: items[0].email, phone: items[0].phone,
          };
        })
      : Promise.resolve(),

    // People finder for emails + phone
    prospect_name
      ? runActor('anchor/linkedin-people-finder', {
          fullName: prospect_name, limit: 3,
        }, 3 * 60000, 5).then(items => {
          if (items[0]) profile.contact_data = {
            email: items[0].email, phone: items[0].phone,
            linkedin: items[0].linkedinUrl, company: items[0].company, title: items[0].title,
          };
        })
      : Promise.resolve(),

    // Google search for public info
    apifySearch(`"${prospect_name}" ${linkedin_id || ''} email contact`, 5).then(r => {
      profile.web_mentions = r.slice(0, 4);
    }),
  ]);

  profile.sources_used = ['linkedin-profile-scraper', 'linkedin-people-finder', 'google-search'];
  profile.cost_usd = cost;
  profile.free_credit_used = freeUsed;
  profile.free_credit_remaining = remaining;
  graphClient.ingest('skill_kaspr_enrich', { prospect: prospect_name, id: linkedin_id });
  return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
}

// ==========================================
// MAIN — Fixed for Apify Standby Mode
// ==========================================

async function main() {
  await Actor.init();
  
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

    // ── SIMPLE HTTP ENDPOINTS FOR DIRECT TESTING ─────────────────────
    // These bypass MCP protocol and let you test tools with curl/requests
    
    app.get('/health', (_req: any, res: any) =>
      res.json({ status: 'ok', server: 'forage', transport: 'streamable-http', tools: TOOLS.length }));

    app.get('/tools', (_req: any, res: any) => {
      // Extract token from Authorization header or query string (for standby actors)
      const authHeader = _req.headers['authorization'];
      const queryToken = _req.query?.token;
      currentApiToken = extractToken(authHeader) || (queryToken ? String(queryToken) : '');
      res.json({ tools: TOOLS.map(t => ({ name: t.name, description: t.description, required: t.inputSchema.required || [] })) });
    });

    // ── INTERCOM WEBHOOK ENDPOINT ─────────────────────────────────────
    app.post('/intercom/webhook', async (req: any, res: any) => {
      try {
        const signature = req.headers['x-hub-signature-256'] as string;
        const secret = process.env.INTERCOM_WEBHOOK_SECRET;
        const payload = JSON.stringify(req.body);

        // Verify webhook signature if secret is configured
        if (secret && signature) {
          const isValid = verifyIntercomWebhook(payload, signature.replace('sha256=', ''), secret);
          if (!isValid) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
          }
        }

        const event = req.body;
        const topic = req.headers['x-intercom-topic'] as string;

        console.log('[Intercom] Webhook received:', topic);

        let result;
        switch (topic) {
          case 'contact.created':
            result = await handleContactCreated(event);
            break;
          case 'conversation.user.created':
          case 'conversation.opened':
            result = await handleConversationOpened(event);
            break;
          case 'conversation.closed':
            result = await handleConversationClosed(event);
            break;
          case 'conversation.user.intercalated':
            result = await handleUserIntercalated(event);
            break;
          default:
            result = { status: 'ignored', topic };
        }

        res.json({ received: true, ...result });
      } catch (err: any) {
        console.error('[Intercom] Webhook error:', err);
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/call/:tool', async (req: any, res: any) => {
      try {
        // Extract token from Authorization header or query string (for standby actors)
        const authHeader = req.headers['authorization'];
        const queryToken = req.query?.token;
        currentApiToken = extractToken(authHeader) || (queryToken ? String(queryToken) : '');
        const toolName = req.params.tool;
        const args = req.body || {};
        
        // Reuse the exact same handler switch from MCP server
        let result: any;
        switch (toolName) {
          case 'search_web': result = await handleSearchWeb(args); break;
          case 'scrape_page': result = await handleScrapePage(args); break;
          case 'get_company_info': result = await handleGetCompanyInfo(args); break;
          case 'find_emails': result = await handleFindEmails(args); break;
          case 'find_local_leads': result = await handleFindLocalLeads(args); break;
          case 'find_leads': result = await handleFindLeads(args); break;
          case 'query_knowledge': result = await handleQueryKnowledge(args); break;
          case 'enrich_entity': result = await handleEnrichEntity(args); break;
          case 'find_connections': result = await handleFindConnections(args); break;
          case 'get_graph_stats': result = await handleGetGraphStats(); break;
          case 'get_claims': result = await handleGetClaims(args); break;
          case 'add_claim': result = await handleAddClaim(args); break;
          case 'get_regime': result = await handleGetRegime(args); break;
          case 'set_regime': result = await handleSetRegime(args); break;
          case 'get_signals': result = await handleGetSignals(args); break;
          case 'add_signal': result = await handleAddSignal(args); break;
          case 'get_causal_parents': result = await handleGetCausalParents(args); break;
          case 'get_causal_children': result = await handleGetCausalChildren(args); break;
          case 'get_causal_path': result = await handleGetCausalPath(args); break;
          case 'simulate': result = await handleSimulate(args); break;
          case 'list_regime_entities': result = await handleListRegimeEntities(args); break;
          case 'list_verified_actors': result = await handleListVerifiedActors(args); break;
          case 'get_actor_schema': result = await handleGetActorSchema(args); break;
          case 'call_actor': result = await handleCallActor(args); break;
          case 'skill_company_dossier': result = await handleSkillCompanyDossier(args); break;
          case 'skill_prospect_company': result = await handleSkillProspectCompany(args); break;
          case 'skill_outbound_list': result = await handleSkillOutboundList(args); break;
          case 'skill_local_market_map': result = await handleSkillLocalMarketMap(args); break;
          case 'skill_competitor_intel': result = await handleSkillCompetitorIntel(args); break;
          case 'skill_decision_maker_finder': result = await handleSkillDecisionMakerFinder(args); break;
          case 'skill_competitor_ads': result = await handleSkillCompetitorAds(args); break;
          case 'skill_job_signals': result = await handleSkillJobSignals(args); break;
          case 'skill_tech_stack': result = await handleSkillTechStack(args); break;
          case 'skill_funding_intel': result = await handleSkillFundingIntel(args); break;
          case 'skill_social_proof': result = await handleSkillSocialProof(args); break;
          case 'skill_market_map': result = await handleSkillMarketMap(args); break;
          case 'skill_kaspr_enrich': result = await handleSkillKasprEnrich(args); break;
          // Intercom tools
          case 'intercom_create_contact': result = await handleIntercomCreateContact(args); break;
          case 'intercom_get_conversation': result = await handleIntercomGetConversation(args); break;
          case 'intercom_reply': result = await handleIntercomReply(args); break;
          case 'intercom_qualify_lead': result = await handleIntercomQualifyLead(args); break;
          case 'intercom_route_to_sales': result = await handleIntercomRouteToSales(args); break;
          default:
            return res.status(404).json({ error: `Unknown tool: ${toolName}`, available: TOOLS.map(t => t.name) });
        }
        res.json({ success: true, tool: toolName, result });
      } catch (err: any) {
        res.status(500).json({ success: false, tool: req.params.tool, error: err.message });
      }
    });

    // ── MCP PROTOCOL (CATCH-ALL) ────────────────────────────────────

    app.all('*', async (req: any, res: any) => {
      try {
        // Extract API token from Authorization header or query string (for standby actors)
        const authHeader = req.headers['authorization'];
        const queryToken = req.query?.token;
        currentApiToken = extractToken(authHeader) || (queryToken ? String(queryToken) : '');

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

// ==========================================
// APIFY STORE SEARCH — find actors for any task
// ==========================================

async function handleSearchApifyStore({ query, category, limit = 20 }: { query: string; category?: string; limit?: number }) {
  try {
    const params: Record<string, string> = { search: query, limit: String(Math.min(limit, 50)) };
    if (category) params.category = category;
    const res = await axios.get('https://api.apify.com/v2/store', {
      params,
      headers: process.env.APIFY_TOKEN ? { Authorization: `Bearer ${process.env.APIFY_TOKEN}` } : {},
      timeout: 15000,
    });
    const items = (res.data?.data?.items || []).map((a: any) => ({
      id: `${a.username}/${a.name}`,
      title: a.title,
      description: (a.description || '').slice(0, 200),
      category: a.categories?.[0] || 'uncategorized',
      runs: a.stats?.totalRuns || 0,
      rating: a.stats?.averageRating,
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ total: items.length, query, actors: items }, null, 2) }] };
  } catch (e: any) {
    return { content: [{ type: 'text', text: `Store search failed: ${e.message}. Try call_actor with a known actor ID like "apify/google-search-scraper".` }], isError: true };
  }
}

// Sandbox server for Smithery scanning
export function createSandboxServer() {
  return setupMcpServer();
}

main().catch(console.error);
