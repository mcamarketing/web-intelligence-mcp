/**
 * meta-orchestrator.ts
 * 
 * Agent swarm orchestration server.
 * Port: 8000
 * All imports use .js extensions per Apify Docker build requirements.
 */

import { graphClient, getCostTracker, isBudgetExceeded } from './forage-graph-client.js';

const PORT = parseInt(process.env.PORT || '8000');
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const FORAGE_ENDPOINT = process.env.FORAGE_ENDPOINT || 'https://ernesta-labs--forage.apify.actor';

// ─── MISSION MAP [mission-001] ───────────────────────────────────────────────

const MISSION_MAP: Record<string, string[]> = {
  fashion: ['cultural_analyst', 'brand_strategist', 'narrative_tracker'],
  luxury: ['cultural_analyst', 'brand_strategist', 'narrative_tracker'],
  brand: ['cultural_analyst', 'brand_strategist', 'narrative_tracker'],
  geo: ['geo_cartographer'],
  map: ['geo_cartographer'],
  village: ['geo_cartographer'],
  city: ['geo_cartographer'],
  predict: ['prediction_validator'],
  price: ['prediction_validator'],
  market: ['prediction_validator'],
  simulate: ['simulation_seeder', 'cultural_analyst'],
  oasis: ['simulation_seeder', 'cultural_analyst'],
  mirofish: ['simulation_seeder', 'cultural_analyst'],
  identity: ['identity_modeller', 'cultural_analyst'],
  religion: ['identity_modeller', 'cultural_analyst'],
  survey: ['identity_modeller', 'cultural_analyst']
};

const DEFAULT_ROLES = ['cultural_analyst', 'narrative_tracker'];

// ─── AGENT REGISTRY [registry-001] ─────────────────────────────────────────

interface AgentRecord {
  id: string;
  role: string;
  container_id: string;
  fitness: number;
  tasks_completed: number;
  claims_written: number;
  cost_incurred: number;
  spawned_at: string;
  last_active: string;
}

const agentRegistry: Map<string, AgentRecord> = new Map();
const swarmRegistry: Map<string, string[]> = new Map();

// ─── REQUEST TYPES [types-001] ─────────────────────────────────────────────

interface OrchestrateRequest {
  mission: string;
  budget_usd?: number;
}

interface FitnessUpdateRequest {
  agent_id: string;
  fitness: number;
  tasks_completed: number;
  cost_incurred: number;
  claims_written: number;
}

// ─── HELPERS [helpers-001] ─────────────────────────────────────────────────

function parseMission(mission: string): string[] {
  const missionLower = mission.toLowerCase();
  const roles = new Set<string>();
  
  for (const [keyword, roleList] of Object.entries(MISSION_MAP)) {
    if (missionLower.includes(keyword)) {
      roleList.forEach(r => roles.add(r));
    }
  }
  
  return roles.size > 0 ? Array.from(roles) : DEFAULT_ROLES;
}

function hashId(str: string): string {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 12);
}

// ─── ROUTES [routes-001] ───────────────────────────────────────────────────

// Simple Express-like router
const routes: Map<string, Function> = new Map();

async function handleRequest(req: Request, res: any): Promise<void> {
  const { method, url } = req;
  const pathname = url.split('?')[0];
  
  try {
    // POST /orchestrate
    if (method === 'POST' && pathname === '/orchestrate') {
      const body = await req.json();
      const result = await orchestrate(body);
      res.json(result);
      return;
    }
    
    // POST /fitness-update
    if (method === 'POST' && pathname === '/fitness-update') {
      const body = await req.json();
      const result = await fitnessUpdate(body);
      res.json(result);
      return;
    }
    
    // GET /status
    if (method === 'GET' && pathname === '/status') {
      const result = await getStatus();
      res.json(result);
      return;
    }
    
    // GET /agents
    if (method === 'GET' && pathname === '/agents') {
      const result = await listAgents();
      res.json(result);
      return;
    }
    
    // GET /health
    if (method === 'GET' && pathname === '/health') {
      res.json({ status: 'ok', service: 'meta-orchestrator' });
      return;
    }
    
    // 404
    res.status(404).json({ error: 'Not found' });
  } catch (e: any) {
    console.error('[ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
}

async function orchestrate(req: OrchestrateRequest): Promise<any> {
  const mission = req.mission;
  const roles = parseMission(mission);
  const swarmId = `swarm_${hashId(mission + Date.now())}`;
  const agents: AgentRecord[] = [];
  
  console.log(`[ORCHESTRATOR] Mission: "${mission}" -> roles: ${roles.join(', ')}`);
  
  for (const role of roles) {
    // Check if existing agent can be reused (fitness >= 0.85, recent)
    let reuseAgent: AgentRecord | undefined;
    
    for (const [id, agent] of agentRegistry) {
      if (agent.role === role && agent.fitness >= 0.85) {
        const hoursSinceActive = (Date.now() - new Date(agent.last_active).getTime()) / (1000 * 60 * 60);
        if (hoursSinceActive < 1) {
          reuseAgent = agent;
          console.log(`[ORCHESTRATOR] Reusing agent ${id} for role ${role}`);
          break;
        }
      }
    }
    
    if (reuseAgent) {
      agents.push(reuseAgent);
      continue;
    }
    
    // Spawn new agent
    const agentId = `agent_${hashId(role + Date.now())}`;
    const containerId = `container_${agentId}`;
    
    const agent: AgentRecord = {
      id: agentId,
      role,
      container_id: containerId,
      fitness: 0.5,  // Always init at 0.5, never 1.0
      tasks_completed: 0,
      claims_written: 0,
      cost_incurred: 0,
      spawned_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    };
    
    // Register in memory
    agentRegistry.set(agentId, agent);
    
    // Write to Forage graph (async, fire-and-forget)
    try {
      await graphClient.addClaim(
        agentId,
        'SPAWNED',
        role,
        JSON.stringify({ role, mission, budget: req.budget_usd }),
        'meta-orchestrator',
        1.0
      );
      await graphClient.addSignal(agentId, 'fitness', 0.5);
    } catch (e) {
      // Ignore graph errors - agent still runs
    }
    
    console.log(`[ORCHESTRATOR] Spawned ${role} agent: ${agentId}`);
    agents.push(agent);
  }
  
  // Register swarm
  swarmRegistry.set(swarmId, agents.map(a => a.id));
  
  return {
    swarm_id: swarmId,
    mission,
    roles,
    agents: agents.map(a => ({
      id: a.id,
      role: a.role,
      container_id: a.container_id,
      fitness: a.fitness
    }))
  };
}

async function fitnessUpdate(req: FitnessUpdateRequest): Promise<any> {
  const { agent_id, fitness, tasks_completed, cost_incurred, claims_written } = req;
  
  // Update agent record
  const agent = agentRegistry.get(agent_id);
  if (agent) {
    agent.fitness = fitness;
    agent.tasks_completed = tasks_completed;
    agent.cost_incurred = cost_incurred;
    agent.claims_written = claims_written;
    agent.last_active = new Date().toISOString();
  }
  
  // Write signals to graph
  try {
    await graphClient.addSignal(agent_id, 'fitness', fitness);
    await graphClient.addSignal(agent_id, 'tasks_completed', tasks_completed);
    await graphClient.addSignal(agent_id, 'cost_incurred', cost_incurred);
    await graphClient.addSignal(agent_id, 'claims_written', claims_written);
  } catch (e) {
    // Ignore
  }
  
  // Clone or kill based on fitness
  if (fitness >= 0.85) {
    console.log(`[ORCHESTRATOR] Cloning high-fitness agent ${agent_id}`);
    // Clone would spawn new agent with mutated params
  } else if (fitness <= 0.30) {
    console.log(`[ORCHESTRATOR] Killing low-fitness agent ${agent_id}`);
    agentRegistry.delete(agent_id);
    try {
      await graphClient.setRegime(agent_id, 'retired');
    } catch (e) {}
  }
  
  return { status: 'updated', agent_id, fitness };
}

async function getStatus(): Promise<any> {
  let graphStats = { total_entities: 0, total_relationships: 0 };
  
  try {
    const stats = await graphClient.getGraphStats();
    if (stats) {
      graphStats = stats;
    }
  } catch (e) {
    // Ignore - may not be reachable
  }
  
  const costTracker = getCostTracker();
  
  return {
    graph: graphStats,
    agents: Array.from(agentRegistry.values()).map(a => ({
      id: a.id,
      role: a.role,
      fitness: a.fitness,
      tasks_completed: a.tasks_completed,
      claims_written: a.claims_written,
      last_active: a.last_active
    })),
    swarms: swarmRegistry.size,
    session_cost_usd: costTracker.total,
    thresholds: {
      clone: 0.85,
      kill: 0.30
    }
  };
}

async function listAgents(): Promise<any[]> {
  return Array.from(agentRegistry.values()).map(a => ({
    id: a.id,
    role: a.role,
    fitness: a.fitness,
    tasks_completed: a.tasks_completed,
    claims_written: a.claims_written,
    cost_incurred: a.cost_incurred,
    spawned_at: a.spawned_at,
    last_active: a.last_active
  }));
}

// ─── SERVER [server-001] ───────────────────────────────────────────────────

import http from 'node:http';

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // Parse JSON body for POST
  if (req.method === 'POST') {
    const buffers: Buffer[] = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : {};
    (req as any).json = () => body;
  }
  
  await handleRequest(req as any, res);
});

server.listen(PORT, () => {
  console.log(`[ORCHESTRATOR] Started on port ${PORT}`);
  console.log(`[ORCHESTRATOR] Mission map: ${Object.keys(MISSION_MAP).join(', ')}`);
});

export default server;