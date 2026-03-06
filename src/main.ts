#!/usr/bin/env node
import { Actor } from 'apify';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

await Actor.init();

const TOOLS: Tool[] = [
  {
    name: 'search_web',
    description: 'Search the web using Google. Costs $0.02 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results (1-20)', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'scrape_page',
    description: 'Scrape any webpage. Costs $0.05 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to scrape' },
      },
      required: ['url'],
    },
  },
  {
    name: 'find_local_leads',
    description: 'Find local business leads from Google Maps. Costs $0.10 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Business type (e.g., "software companies")' },
        location: { type: 'string', description: 'Location (e.g., "San Francisco, CA")' },
        radius: { type: 'number', default: 5000 },
        max_results: { type: 'number', default: 20 },
      },
      required: ['keyword', 'location'],
    },
  },
  {
    name: 'find_leads',
    description: 'Find B2B leads with emails using code_crafter/leads-finder. Costs $0.12 per 100 leads.',
    inputSchema: {
      type: 'object',
      properties: {
        job_title: { type: 'string', description: 'Job titles (e.g., "CEO, CTO")' },
        location: { type: 'string', description: 'Location' },
        industry: { type: 'string' },
        company_size: { type: 'string' },
        keywords: { type: 'string' },
        company_website: { type: 'string' },
        num_leads: { type: 'number', default: 100 },
        email_status: { type: 'string', enum: ['verified', 'unverified', 'all'], default: 'verified' },
      },
      required: ['job_title'],
    },
  },
  {
    name: 'find_emails',
    description: 'Find email addresses for a company domain using Hunter.io. Costs $0.08 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Company domain (e.g., "stripe.com")' },
        limit: { type: 'number', default: 10 },
      },
      required: ['domain'],
    },
  },
  {
    name: 'get_company_info',
    description: 'Get company data from website scraping + email patterns. Costs $0.05 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Company domain' },
        find_emails: { type: 'boolean', default: true },
      },
      required: ['domain'],
    },
  },
  {
    name: 'call_actor',
    description: 'Run any Apify actor by ID. Cost varies.',
    inputSchema: {
      type: 'object',
      properties: {
        actor_id: { type: 'string', description: 'Actor ID' },
        input: { type: 'object' },
        timeout_secs: { type: 'number', default: 120 },
      },
      required: ['actor_id', 'input'],
    },
  },
];

const mcpServer = new Server(
  { name: 'web-intelligence-mcp', version: '1.2.0' },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.log(`Tool called: ${name}`, args);

  try {
    switch (name) {
      case 'search_web':
        return await handleSearchWeb(args as any);
      case 'scrape_page':
        return await handleScrapePage(args as any);
      case 'find_local_leads':
        return await handleFindLocalLeads(args as any);
      case 'find_leads':
        return await handleFindLeads(args as any);
      case 'find_emails':
        return await handleFindEmails(args as any);
      case 'get_company_info':
        return await handleGetCompanyInfo(args as any);
      case 'call_actor':
        return await handleCallActor(args as any);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error in ${name}:`, error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

async function handleSearchWeb({ query, num_results = 10 }: { query: string; num_results?: number }) {
  await Actor.charge({ eventName: 'search-web' });
  
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error('SERPAPI_KEY not configured');

  const response = await axios.get('https://serpapi.com/search', {
    params: { q: query, api_key: key, engine: 'google', num: Math.min(num_results, 20) },
    timeout: 30000,
  });

  const results = response.data.organic_results?.map((r: any) => ({
    title: r.title, link: r.link, snippet: r.snippet
  })) || [];

  return { content: [{ type: 'text', text: JSON.stringify({ query, results }, null, 2) }] };
}

async function handleScrapePage({ url }: { url: string }) {
  await Actor.charge({ eventName: 'scrape-page' });
  
  const jinaKey = process.env.JINA_AI_KEY;
  let content: string;
  let title: string;

  if (jinaKey) {
    const cleanUrl = url.replace(/^https?:\/\//, '');
    const res = await axios.get(`https://r.jina.ai/https://${cleanUrl}`, {
      headers: { Authorization: `Bearer ${jinaKey}` },
      timeout: 30000,
    });
    content = res.data;
    title = content.split('\n')[0] || url;
  } else {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    title = $('title').text() || url;
    $('script, style, nav, footer').remove();
    content = ($('main, article, .content').first().text() || $('body').text()).replace(/\s+/g, ' ').trim();
  }

  return { content: [{ type: 'text', text: JSON.stringify({ url, title, content }, null, 2) }] };
}

async function handleFindLocalLeads({ keyword, location, radius = 5000, max_results = 20 }: any) {
  await Actor.charge({ eventName: 'find-local-leads' });
  
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY not configured');

  const geo = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: { address: location, key },
  });
  
  if (geo.data.status !== 'OK') throw new Error(`Geocoding failed: ${geo.data.status}`);
  const { lat, lng } = geo.data.results[0].geometry.location;

  const places = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
    params: { location: `${lat},${lng}`, radius, keyword, key },
  });

  if (places.data.status !== 'OK') throw new Error(`Places search failed: ${places.data.status}`);

  const leads = await Promise.all(
    places.data.results.slice(0, max_results).map(async (place: any) => {
      try {
        const details = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
          params: { place_id: place.place_id, fields: 'name,formatted_address,formatted_phone_number,website,rating', key },
        });
        const d = details.data.result;
        return {
          name: d.name, 
          address: d.formatted_address, 
          phone: d.formatted_phone_number,
          website: d.website, 
          rating: d.rating,
          maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
        };
      } catch (e) {
        return { name: place.name, rating: place.rating };
      }
    })
  );

  return { content: [{ type: 'text', text: JSON.stringify({ keyword, location, leads }, null, 2) }] };
}

async function handleFindLeads({ 
  job_title, 
  location, 
  industry, 
  company_size, 
  keywords, 
  company_website,
  num_leads = 100,
  email_status = 'verified'
}: any) {
  await Actor.charge({ eventName: 'find-leads' });
  
  console.log(`Running leads-finder for: ${job_title} in ${location}`);
  
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
  console.log(`Leads finder run started: ${run.id}`);
  
  const timeout = 5 * 60 * 1000;
  const startTime = Date.now();
  let pollInterval = 2000;
  const maxPollInterval = 15000;
  
  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new Error(`Timeout waiting for leads-finder (run ID: ${run.id})`);
    }
    
    const runInfo = await Actor.apifyClient.run(run.id).get();
    
    if (!runInfo) {
      throw new Error('Failed to get run info');
    }
    
    if (runInfo.status === 'SUCCEEDED') {
      const allItems: any[] = [];
      let offset = 0;
      const pageLimit = 250;
      
      while (true) {
        const result = await Actor.apifyClient.dataset(runInfo.defaultDatasetId).listItems({ 
          offset, 
          limit: pageLimit 
        });
        const items = result.items ?? [];
        allItems.push(...items);
        offset += items.length;
        if (items.length === 0 || items.length < pageLimit) break;
      }
      
      const formattedLeads = allItems.map((lead: any) => ({
        name: lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
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
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: { job_title, location, industry },
            leads_found: formattedLeads.length,
            cost_estimate: `$${(formattedLeads.length * 0.0015).toFixed(2)}`,
            leads: formattedLeads,
            actor_run_id: run.id
          }, null, 2),
        }],
      };
    }
    
    if (['FAILED', 'TIMED_OUT', 'ABORTED'].includes(runInfo.status)) {
      throw new Error(`Leads finder ${runInfo.status}: ${runInfo.statusMessage || 'Unknown error'}`);
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
  }
}

async function handleFindEmails({ domain, limit = 10 }: { domain: string; limit?: number }) {
  await Actor.charge({ eventName: 'find-emails' });
  
  const key = process.env.HUNTER_API_KEY;
  if (!key) throw new Error('HUNTER_API_KEY not configured');

  const response = await axios.get('https://api.hunter.io/v2/domain-search', {
    params: { domain, limit, api_key: key },
    timeout: 30000,
  });

  const data = response.data.data;
  const emails = data.emails?.map((e: any) => ({
    email: e.value,
    type: e.type,
    confidence: e.confidence,
    first_name: e.first_name,
    last_name: e.last_name,
    position: e.position,
    seniority: e.seniority,
    department: e.department,
    linkedin: e.linkedin,
    twitter: e.twitter,
    phone_number: e.phone_number,
  })) || [];

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        domain,
        organization: data.organization,
        emails_found: emails.length,
        pattern: data.pattern,
        emails: emails,
      }, null, 2),
    }],
  };
}

async function handleGetCompanyInfo({ domain, find_emails = true }: { domain: string; find_emails?: boolean }) {
  await Actor.charge({ eventName: 'get-company-info' });
  
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  
  let websiteData: any = {};
  try {
    const url = `https://${cleanDomain}`;
    const res = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000,
      maxRedirects: 5,
    });
    
    const $ = cheerio.load(res.data);
    websiteData = {
      title: $('title').text()?.trim() || null,
      description: $('meta[name="description"]').attr('content') || 
                   $('meta[property="og:description"]').attr('content') || null,
      social_links: {
        linkedin: $('a[href*="linkedin.com"]').first().attr('href') || null,
        twitter: $('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href') || null,
        facebook: $('a[href*="facebook.com"]').first().attr('href') || null,
      },
      contact_page: $('a[href*="contact"], a[href*="about"]').first().attr('href') || null,
    };
  } catch (error) {
    websiteData = { error: 'Failed to scrape website', details: (error as Error).message };
  }

  let emailData: any = {};
  if (find_emails && process.env.HUNTER_API_KEY) {
    try {
      const hunterRes = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: { domain: cleanDomain, api_key: process.env.HUNTER_API_KEY },
        timeout: 15000,
      });
      emailData = {
        pattern: hunterRes.data.data?.pattern || null,
        organization: hunterRes.data.data?.organization || null,
        sample_emails: hunterRes.data.data?.emails?.slice(0, 3).map((e: any) => ({
          email: e.value,
          position: e.position,
        })) || [],
      };
    } catch (error) {
      emailData = { error: 'Failed to fetch email data' };
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        domain: cleanDomain,
        website: websiteData,
        email_intelligence: emailData,
        timestamp: new Date().toISOString(),
      }, null, 2),
    }],
  };
}

async function handleCallActor({ 
  actor_id, 
  input, 
  timeout_secs = 120 
}: { 
  actor_id: string; 
  input: any; 
  timeout_secs?: number;
}) {
  await Actor.charge({ eventName: 'call-actor' });
  
  console.log(`Calling actor ${actor_id} with input:`, JSON.stringify(input, null, 2));
  
  const run = await Actor.start(actor_id, input);
  console.log(`Actor run started: ${run.id}`);
  
  const timeout = timeout_secs * 1000;
  const startTime = Date.now();
  let pollInterval = 2000;
  const maxPollInterval = 15000;
  
  while (true) {
    if (Date.now() - startTime > timeout) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'TIMEOUT',
            message: `Actor run exceeded ${timeout_secs}s timeout`,
            actor_id,
            run_id: run.id,
            monitor_url: `https://console.apify.com/actors/runs/${run.id}`,
            input,
          }, null, 2),
        }],
      };
    }
    
    const runInfo = await Actor.apifyClient.run(run.id).get();
    
    if (!runInfo) {
      throw new Error('Failed to retrieve run information');
    }
    
    if (runInfo.status === 'SUCCEEDED') {
      const datasetItems: any[] = [];
      try {
        const datasetClient = Actor.apifyClient.dataset(runInfo.defaultDatasetId);
        let offset = 0;
        const limit = 1000;
        
        while (true) {
          const result = await datasetClient.listItems({ offset, limit });
          const items = result.items ?? [];
          datasetItems.push(...items);
          offset += items.length;
          if (items.length === 0 || items.length < limit) break;
        }
      } catch (e) {
        console.warn('Could not fetch dataset items:', e);
      }
      
      let output: any = null;
      try {
        const kvStore = Actor.apifyClient.keyValueStore(runInfo.defaultKeyValueStoreId);
        output = await kvStore.getRecord('OUTPUT');
      } catch (e) {
        // No output record
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'SUCCEEDED',
            actor_id,
            run_id: run.id,
            run_url: `https://console.apify.com/actors/runs/${run.id}`,
            duration: runInfo.stats?.durationSecs,
            cost_usd: runInfo.stats?.costUsd,
            dataset_items_count: datasetItems.length,
            dataset_sample: datasetItems.slice(0, 10),
            output: output?.value || null,
          }, null, 2),
        }],
      };
    }
    
    if (['FAILED', 'ABORTED'].includes(runInfo.status)) {
      throw new Error(`Actor run ${runInfo.status}: ${runInfo.statusMessage || 'Unknown error'}`);
    }
    
    await new Promise(r => setTimeout(r, pollInterval));
    pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
  }
}

async function main() {
  const transportType = process.env.MCP_TRANSPORT || 'stdio';
  
  if (transportType === 'sse') {
    const port = parseInt(process.env.PORT || '3000');
    const http = await import('http');
    const express = await import('express');
    
    const app = express.default();
    const activeTransports = new Map<string, SSEServerTransport>();

    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      res.on('close', () => {
        activeTransports.delete(sessionId);
        console.log(`Client disconnected: ${sessionId}`);
      });

      await mcpServer.connect(transport);
      console.log(`Client connected: ${sessionId}`);
    });

    app.post('/messages', express.default.json(), async (req, res) => {
      const sessionId = req.query.sessionId as string;

      if (!sessionId || !activeTransports.has(sessionId)) {
        res.status(400).json({ error: 'Invalid or missing sessionId' });
        return;
      }

      const transport = activeTransports.get(sessionId)!;
      await transport.handlePostMessage(req, res);
    });

    const httpServer = http.createServer(app);
    httpServer.listen(port, () => {
      console.log(`MCP Server running on port ${port} (SSE mode)`);
    });
  } else {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error('MCP Server running on stdio');
  }
}

process.on('SIGINT', async () => {
  await mcpServer.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mcpServer.close();
  process.exit(0);
});

main().catch(console.error);
