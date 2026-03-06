// Tool: Find Emails (Hunter.io) - COMPLETED
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

// Tool: Get Company Info
async function handleGetCompanyInfo({ domain, find_emails = true }: { domain: string; find_emails?: boolean }) {
  await Actor.charge({ eventName: 'get-company-info' });
  
  // Clean domain
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  
  // Scrape website
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

  // Get email pattern from Hunter if enabled
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

// Tool: Call Any Actor
async function handleCallActor({ 
  actor_id, 
  input, 
  timeout_secs = 120 
}: { 
  actor_id: string; 
  input: any; 
  timeout_secs?: number;
}) {
  await Actor.charge({ eventName: 'call-actor', count: 1 });
  
  console.log(`Calling actor ${actor_id} with input:`, JSON.stringify(input, null, 2));
  
  // Start the actor run
  const run = await Actor.start(actor_id, input);
  console.log(`Actor run started: ${run.id}`);
  
  // Wait for completion with timeout
  const timeout = timeout_secs * 1000;
  const startTime = Date.now();
  
  while (true) {
    if (Date.now() - startTime > timeout) {
      // Don't fail, just return the run ID so user can check later
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
      // Fetch results from default dataset
      const datasetItems: any[] = [];
      try {
        const datasetClient = Actor.apifyClient.dataset(runInfo.defaultDatasetId);
        let offset = 0;
        const limit = 1000;
        
        while (true) {
          const { items, total } = await datasetClient.listItems({ offset, limit });
          datasetItems.push(...items);
          offset += items.length;
          if (offset >= total || items.length === 0) break;
        }
      } catch (e) {
        console.warn('Could not fetch dataset items:', e);
      }
      
      // Fetch key-value store output if exists
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
            dataset_sample: datasetItems.slice(0, 10), // Return first 10 items
            output: output?.value || null,
          }, null, 2),
        }],
      };
    }
    
    if (['FAILED', 'ABORTED'].includes(runInfo.status)) {
      throw new Error(`Actor run ${runInfo.status}: ${runInfo.statusMessage || 'Unknown error'}`);
    }
    
    // Sleep before polling again
    await new Promise(r => setTimeout(r, 2000));
  }
}

// Server Transport Setup
async function main() {
  // Determine transport type from environment
  const transportType = process.env.MCP_TRANSPORT || 'stdio';
  
  if (transportType === 'sse') {
    // HTTP SSE Transport (for remote connections)
    const port = parseInt(process.env.PORT || '3000');
    const http = await import('http');
    const express = await import('express');
    
    const app = express.default();
    const server = http.createServer(app);
    
    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);
    });
    
    app.post('/messages', async (req, res) => {
      // Note: In production, you'd need to properly route this to the correct transport instance
      res.status(200).send('OK');
    });
    
    server.listen(port, () => {
      console.log(`MCP Server running on port ${port} (SSE mode)`);
    });
  } else {
    // Stdio Transport (default, for local MCP clients like Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP Server running on stdio'); // stderr so it doesn't interfere with protocol
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});

// Start server
main().catch(console.error);
