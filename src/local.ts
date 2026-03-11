// src/local.ts
import './main'; // Import main.ts, which runs the MCP server
import { TOOLS, VERIFIED_ACTORS } from './main';

console.log('[Local MCP] Server loaded and running…');

// Print registered tools for sanity check
console.log('[Local MCP] Tools:', TOOLS.map((t) => t.name));

// Print verified actors for sanity check
console.log('[Local MCP] Verified actors:', Array.from(VERIFIED_ACTORS.keys()));
