/**
 * nemoclaw-spawner.ts
 * 
 * Docker-based agent container spawner.
 * Uses dockerode for container management.
 * All imports use .js extensions per Apify Docker build requirements.
 */

import { createHash } from 'crypto';

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const FORAGE_ENDPOINT = process.env.FORAGE_ENDPOINT || 'https://ernesta-labs--forage.apify.actor';

// ─── TYPES [types-001] ─────────────────────────────────────────────────────

export type AgentRole = 
  | 'cultural_analyst'
  | 'brand_strategist'
  | 'geo_cartographer'
  | 'narrative_tracker'
  | 'identity_modeller'
  | 'prediction_validator'
  | 'simulation_seeder';

export interface AgentEnv {
  AGENT_ROLE: string;
  AGENT_ID: string;
  APIFY_TOKEN: string;
  FORAGE_ENDPOINT: string;
  SESSION_BUDGET_USD: string;
  [key: string]: string;
}

export interface SpawnResult {
  container_id: string;
  agent_id: string;
  started_at: string;
}

export interface AgentStatus {
  container_id: string;
  agent_id: string;
  role: string;
  status: 'running' | 'stopped' | 'error';
  started_at: string;
}

// ─── CONFIG [config-001] ───────────────────────────────────────────────────

const AGENT_RAM_MB = 512;
const AGENT_CPU = 0.5;
const NETWORK_MODE = 'perception-net';

// ─── DOCKERODE WRAPPER [docker-001] ───────────────────────────────────────

let docker: any = null;

async function getDocker() {
  if (docker) return docker;
  
  try {
    // Dynamic import for dockerode
    // @ts-ignore
    const { Docker } = await import('dockerode');
    docker = new Docker();
    await docker.ping();
    console.log('[NEMOCLAW] Docker connected');
    return docker;
  } catch (e) {
    console.warn('[NEMOCLAW] Docker not available, using mock mode');
    return null;
  }
}

// ─── SPAWNER [spawner-001] ─────────────────────────────────────────────────

export class NemoClawSpawner {
  private readonly docker: any;
  
  constructor() {
    this.docker = null; // Lazy init
  }
  
  /**
   * Spawn an agent container with resource limits.
   */
  async spawnAgent(
    role: AgentRole,
    templatePath: string,
    env: AgentEnv
  ): Promise<SpawnResult> {
    const dockerClient = await getDocker();
    
    const agentId = this.generateAgentId(role);
    const containerId = `perception-${role}-${agentId.substring(0, 8)}`;
    const startedAt = new Date().toISOString();
    
    // Merge environment
    const containerEnv = {
      ...env,
      AGENT_ROLE: role,
      AGENT_ID: agentId,
      APIFY_TOKEN: APIFY_TOKEN || '',
      FORAGE_ENDPOINT
    };
    
    if (dockerClient) {
      try {
        // Pull or use existing image
        const imageName = 'node:18-alpine'; // Minimal base
        
        // Create container with resource limits
        const container = await dockerClient.createContainer({
          Image: imageName,
          name: containerId,
          Env: Object.entries(containerEnv).map(([k, v]) => `${k}=${v}`),
          HostConfig: {
            Memory: AGENT_RAM_MB * 1024 * 1024,
            CpuQuota: Math.floor(AGENT_CPU * 100000),
            NetworkMode: NETWORK_MODE,
            Binds: [
              '/tmp/agent-work:/tmp/agent-work:rw'
            ]
          },
          Cmd: ['sleep', 'infinity'], // Placeholder - would run agent
          AttachStdout: true,
          AttachStderr: true
        });
        
        // Start container
        await container.start();
        
        console.log(`[NEMOCLAW] Spawned container ${containerId} for role ${role}`);
      } catch (e: any) {
        console.error('[NEMOCLAW] Docker spawn failed:', e.message);
      }
    } else {
      // Mock mode - no actual container
      console.log(`[NEMOCLAW] Mock: would spawn ${role} agent ${agentId}`);
    }
    
    return {
      container_id: containerId,
      agent_id: agentId,
      started_at: startedAt
    };
  }
  
  /**
   * Kill an agent container.
   */
  async killAgent(containerId: string): Promise<void> {
    const dockerClient = await getDocker();
    
    if (dockerClient) {
      try {
        const container = dockerClient.getContainer(containerId);
        await container.stop();
        await container.remove();
        console.log(`[NEMOCLAW] Killed container ${containerId}`);
      } catch (e: any) {
        console.error('[NEMOCLAW] Kill failed:', e.message);
      }
    } else {
      console.log(`[NEMOCLAW] Mock: would kill ${containerId}`);
    }
  }
  
  /**
   * List running agent containers.
   */
  async listAgents(): Promise<AgentStatus[]> {
    const dockerClient = await getDocker();
    
    if (!dockerClient) {
      return [];
    }
    
    try {
      const containers = await dockerClient.listContainers({
        filters: { label: ['app=perception'] }
      });
      
      return containers.map((c: any) => ({
        container_id: c.Id,
        agent_id: c.Labels?.agent_id || 'unknown',
        role: c.Labels?.agent_role || 'unknown',
        status: c.State === 'running' ? 'running' : 'stopped',
        started_at: c.Created
      }));
    } catch (e) {
      console.error('[NEMOCLAW] List failed:', e);
      return [];
    }
  }
  
  /**
   * Get container stats (memory, CPU).
   */
  async getContainerStats(containerId: string): Promise<any> {
    const dockerClient = await getDocker();
    
    if (!dockerClient) return null;
    
    try {
      const container = dockerClient.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      return {
        memory_usage: stats.memory_stats?.usage || 0,
        cpu_delta: stats.cpu_stats?.cpu_usage?.total_usage || 0,
        network_rx: stats.networks?.rx_bytes || 0,
        network_tx: stats.networks?.tx_bytes || 0
      };
    } catch (e) {
      return null;
    }
  }
  
  private generateAgentId(role: string): string {
    const input = `${role}-${Date.now()}-${Math.random()}`;
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }
}

// ─── EXPORT [export-001] ───────────────────────────────────────────────────

export const spawner = new NemoClawSpawner();