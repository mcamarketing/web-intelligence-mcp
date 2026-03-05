#!/usr/bin/env node
/**
 * Web Intelligence MCP Server for Apify
 * 
 * Monetized via Apify Pay-Per-Event:
 * - search-web: $0.02 per call
 * - scrape-page: $0.05 per call  
 * - find-leads: $0.10 per call
 * - company-info: $0.15 per call
 * 
 * Deploy with: apify push
 * Standby mode provides persistent SSE endpoint
 */

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
import { URL } from 'url';

// Initialize Actor
await Actor.init();

// Tool definitions with schemas
const TOOLS: Tool[] = [
  {
    name: 'search_web',
    description: 'Search the web using Google/Bing and return live results. ' +
      'Use this when you need current information, news, prices, or any real-time data. ' +
      'Costs $0.02 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        num_results: {
          type: 'number',
          description: 'Number of results (1-20, default 10)',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'scrape_page',
    description: 'Scrape any webpage and return clean markdown content. ' +
      'Use this to extract article content, documentation, or any web page text. ' +
      'Costs $0.05 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to scrape',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'find_leads',
    description: 'Find business leads from Google Maps. ' +
      'Returns business name, address, phone, website, rating, and more. ' +
      'Costs $0.10 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Business type (e.g., "software companies", "restaurants")',
        },
        location: {
          type: 'string',
          description: 'Location (e.g., "San Francisco, CA")',
        },
        radius: {
          type: 'number',
          description: 'Search radius in meters (default 5000)',
          default: 5000,
        },
        max_results: {
          type: 'number',
          description: 'Maximum results (default 20)',
          default: 20,
        },
      },
      required: ['keyword', 'location'],
    },
  },
  {
    name: 'get_company_info',
    description: 'Get comprehensive company intelligence. ' +
      'Returns tech stack, employee count, funding, contacts, and social profiles. ' +
      'Costs $0.15 per call.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Company domain (e.g., "stripe.com")',
        },
      },
      required: ['domain'],
    },
  },
];

// Create MCP server
const server = new Server(
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

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool execution with monetization
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  Actor.log.info(`Tool called: ${name}`, { args });

  try {
    switch (name) {
      case 'search_web':
        return await handleSearchWeb(args as { query: string; num_results?: number });
      
      case 'scrape_page':
        return await handleScrapePage(args as { url: string });
      
      case 'find_leads':
        return await handleFindLeads(args as { 
          keyword: string; 
          location: string; 
          radius?: number;
          max_results?: number;
        });
      
      case 'get_company_info':
        return await handleGetCompanyInfo(args as { domain: string });
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    Actor.log.error(`Tool execution failed: ${name}`, { error });
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Tool: search_web
async function handleSearchWeb(args: { query: string; num_results?: number }) {
  const { query, num_results = 10 } = args;
  
  // Charge for the tool call
  await Actor.charge({ eventName: 'search-web' });
  
  const serpApiKey = process.env.SERPAPI_KEY;
  if (!serpApiKey) {
    throw new Error('SERPAPI_KEY not configured');
  }

  const response = await axios.get('https://serpapi.com/search', {
    params: {
      q: query,
      api_key: serpApiKey,
      engine: 'google',
      num: Math.min(num_results, 20),
    },
    timeout: 30000,
  });

  const results = response.data.organic_results?.map((r: any) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    position: r.position,
  })) || [];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          query,
          results,
          total_results: response.data.search_information?.total_results,
        }, null, 2),
      },
    ],
  };
}

// Tool: scrape_page
async function handleScrapePage(args: { url: string }) {
  const { url } = args;
  
  // Charge for the tool call
  await Actor.charge({ eventName: 'scrape-page' });
  
  // Validate URL
  new URL(url);
  
  // Try Jina AI first (free tier available)
  const jinaKey = process.env.JINA_AI_KEY;
  
  try {
    let content: string;
    let title: string;
    
    if (jinaKey) {
      // Use Jina AI Reader API
      const response = await axios.get(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`, {
        headers: { 'Authorization': `Bearer ${jinaKey}` },
        timeout: 30000,
      });
      content = response.data;
      title = content.split('\n')[0] || url;
    } else {
      // Fallback to direct scraping
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });
      
      const $ = cheerio.load(response.data);
      title = $('title').text() || url;
      
      // Extract main content
      $('script, style, nav, footer, header, aside').remove();
      const mainContent = $('main, article, .content, #content, .post').first();
      content = mainContent.text() || $('body').text();
      content = content.replace(/\s+/g, ' ').trim();
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            url,
            title,
            markdown: content,
            word_count: content.split(/\s+/).length,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new Error(`Failed to scrape ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Tool: find_leads
async function handleFindLeads(args: { 
  keyword: string; 
  location: string; 
  radius?: number;
  max_results?: number;
}) {
  const { keyword, location, radius = 5000, max_results = 20 } = args;
  
  // Charge for the tool call
  await Actor.charge({ eventName: 'find-leads' });
  
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  // Geocode location
  const geocodeResponse = await axios.get(
    'https://maps.googleapis.com/maps/api/geocode/json',
    {
      params: {
        address: location,
        key: apiKey,
      },
    }
  );

  if (geocodeResponse.data.status !== 'OK') {
    throw new Error(`Geocoding failed: ${geocodeResponse.data.status}`);
  }

  const { lat, lng } = geocodeResponse.data.results[0].geometry.location;

  // Search for places
  const placesResponse = await axios.get(
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
    {
      params: {
        location: `${lat},${lng}`,
        radius,
        keyword,
        key: apiKey,
      },
    }
  );

  if (placesResponse.data.status !== 'OK') {
    throw new Error(`Places search failed: ${placesResponse.data.status}`);
  }

  // Get details for each place
  const leads = await Promise.all(
    placesResponse.data.results
      .slice(0, max_results)
      .map(async (place: any) => {
        try {
          const detailsResponse = await axios.get(
            'https://maps.googleapis.com/maps/api/place/details/json',
            {
              params: {
                place_id: place.place_id,
                fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,price_level',
                key: apiKey,
              },
            }
          );

          const details = detailsResponse.data.result;
          return {
            name: details.name,
            address: details.formatted_address,
            phone: details.formatted_phone_number,
            website: details.website,
            rating: details.rating,
            review_count: details.user_ratings_total,
            place_id: place.place_id,
            maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
            price_level: details.price_level,
          };
        } catch (e) {
          // Return basic info if details fail
          return {
            name: place.name,
            address: place.vicinity,
            rating: place.rating,
            place_id: place.place_id,
            maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
          };
        }
      })
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          keyword,
          location,
          radius,
          leads_found: leads.length,
          leads,
        }, null, 2),
      },
    ],
  };
}

// Tool: get_company_info
async function handleGetCompanyInfo(args: { domain: string }) {
  const { domain } = args;
  
  // Charge for the tool call
  await Actor.charge({ eventName: 'company-info' });
  
  const clearbitKey = process.env.CLEARBIT_API_KEY;
  if (!clearbitKey) {
    throw new Error('CLEARBIT_API_KEY not configured');
  }

  try {
    // Get company data from Clearbit
    const response = await axios.get(
      `https://company.clearbit.com/v2/companies/find`,
      {
        params: { domain },
        headers: { Authorization: `Bearer ${clearbitKey}` },
        timeout: 15000,
      }
    );

    const data = response.data;
    
    const companyInfo = {
      domain,
      name: data.name,
      description: data.description,
      industry: data.category?.industry,
      subIndustry: data.category?.subIndustry,
      employees: data.metrics?.employees,
      employeesRange: data.metrics?.employeesRange,
      revenue: data.metrics?.estimatedAnnualRevenue,
      logo: data.logo,
      location: {
        city: data.geo?.city,
        state: data.geo?.state,
        country: data.geo?.country,
      },
      social: {
        linkedin: data.linkedin?.handle,
        twitter: data.twitter?.handle,
        facebook: data.facebook?.handle,
        github: data.github?.handle,
      },
      tech: data.tech || [],
      foundedYear: data.foundedYear,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(companyInfo, null, 2),
        },
      ],
    };
  } catch (error) {
    // Fallback to basic tech detection
    try {
      const websiteResponse = await axios.get(`https://${domain}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CompanyBot/1.0)',
        },
      });
      
      const $ = cheerio.load(websiteResponse.data);
      const title = $('title').text();
      const description = $('meta[name="description"]').attr('content');
      
      // Detect tech from headers
      const headers = websiteResponse.headers;
      const tech: string[] = [];
      if (headers['x-powered-by']) tech.push(headers['x-powered-by']);
      if (headers.server) tech.push(headers.server);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              domain,
              name: title,
              description,
              tech,
              note: 'Limited data - Clearbit API limit reached or domain not found',
            }, null, 2),
          },
        ],
      };
    } catch (e) {
      throw new Error(`Could not retrieve company info for ${domain}`);
    }
  }
}

// Start server based on transport type
const transportType = process.env.MCP_TRANSPORT || 'sse';

if (transportType === 'stdio') {
  // Stdio transport for local testing
  const transport = new StdioServerTransport();
  await server.connect(transport);
  Actor.log.info('MCP server running on stdio');
} else {
  // SSE transport for Apify Standby mode
  // Apify's web server handles the HTTP/SSE layer
  const port = process.env.APIFY_WEB_SERVER_PORT || 3000;
  
  import('http').then((http) => {
    const httpServer = http.createServer(async (req, res) => {
      // Health check
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'web-intelligence-mcp' }));
        return;
      }
      
      // SSE endpoint for MCP
      if (req.url === '/sse') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        
        const transport = new SSEServerTransport('/sse', res);
        server.connect(transport);
        
        req.on('close', () => {
          Actor.log.info('Client disconnected');
        });
        return;
      }
      
      // Default response
      res.writeHead(404);
      res.end('Not found');
    });
    
    httpServer.listen(port, () => {
      Actor.log.info(`MCP server running on port ${port}`);
      Actor.log.info(`SSE endpoint: http://localhost:${port}/sse`);
    });
  });
}
