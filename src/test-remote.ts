import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function run() {
  const token = process.env.FORAGE_TOKEN;
  const url = `${process.env.FORAGE_URL || 'https://ernesta-labs--forage.apify.actor'}?token=${token}`;
  
  const transport = new StreamableHTTPClientTransport(
    new URL(url)
  );

  const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });

  console.log("Connecting...");
  await client.connect(transport);
  console.log("Connected!");

  console.log("Listing tools...");
  const tools = await client.listTools();
  console.log("Tools available:", tools.tools.length);

  console.log("Calling search_web...");
  const result = await client.callTool({
    name: "search_web",
    arguments: { query: "ernesta labs apify actor" }
  });

  console.log("Result:");
  console.log(JSON.stringify(result, null, 2));

  process.exit(0);
}

run().catch(console.error);
