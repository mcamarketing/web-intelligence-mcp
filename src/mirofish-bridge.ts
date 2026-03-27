/**
 * mirofish-bridge.ts
 * 
 * MiroFish OASIS simulation bridge.
 * All imports use .js extensions per Apify Docker build requirements.
 */

import { graphClient, type SimSeedJSON, type SimReport } from './forage-graph-client.js';

const MIROFISH_HOST = process.env.MIROFISH_HOST || 'http://mirofish:7000';

// ─── TYPES [types-001] ─────────────────────────────────────────────────────

interface MiroFishConfig {
  sim_duration_ticks?: number;
  agent_count?: number;
  temperature?: number;
}

// ─── BRIDGE [bridge-001] ───────────────────────────────────────────────────

export class MiroFishBridge {
  private readonly host: string;
  
  constructor(host: string = MIROFISH_HOST) {
    this.host = host;
  }
  
  /**
   * Seed simulation with FalkorDB subgraph and run.
   */
  async seedAndRun(entities: string[]): Promise<string> {
    console.log(`[MIROFISH] Exporting seed for ${entities.length} entities`);
    
    // Export subgraph as SimSeedJSON
    const seedData = await graphClient.exportSimSeed(entities);
    console.log(`[MIROFISH] Seed: ${seedData.entities.length} entities, ${seedData.connections.length} edges`);
    
    // POST to MiroFish simulation endpoint
    const response = await fetch(`${this.host}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: seedData,
        config: {
          sim_duration_ticks: 100,
          agent_count: Math.min(1000, seedData.entities.length * 10),
          temperature: 0.7
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`MiroFish error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    const simId = result.sim_id;
    
    console.log(`[MIROFISH] Started simulation: ${simId}`);
    return simId;
  }
  
  /**
   * Poll for simulation results.
   */
  async pollResults(simId: string, maxWaitMs: number = 600_000): Promise<SimReport> {
    const startTime = Date.now();
    const pollInterval = 30000; // 30 seconds
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(`${this.host}/results/${simId}`);
        
        if (response.status === 404) {
          // Still running, wait
          console.log(`[MIROFISH] Simulation ${simId} still running...`);
          await this.sleep(pollInterval);
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`MiroFish error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Format as SimReport
        const report: SimReport = {
          sim_id: result.sim_id,
          predictions: (result.predictions || []).map((p: any) => ({
            entity: p.entity,
            predicted_value: p.value,
            confidence: p.confidence || 0.5,
            horizon: '24h'
          })),
          narratives: (result.narratives || []).map((n: any) => ({
            topic: n.topic,
            sentiment: n.sentiment || 0,
            velocity: n.velocity || 0,
            reach: n.reach || 0
          })),
          completed_at: result.completed_at || new Date().toISOString()
        };
        
        console.log(`[MIROFISH] Simulation ${simId} completed`);
        return report;
      } catch (e: any) {
        console.error('[MIROFISH] Poll error:', e.message);
        await this.sleep(pollInterval);
      }
    }
    
    throw new Error(`Simulation ${simId} timed out after ${maxWaitMs}ms`);
  }
  
  /**
   * Run simulation and import results to graph.
   */
  async importAndWrite(entities: string[]): Promise<SimReport> {
    // Start simulation
    const simId = await this.seedAndRun(entities);
    
    // Wait for results
    const report = await this.pollResults(simId);
    
    // Import to graph
    console.log(`[MIROFISH] Importing ${report.predictions.length} predictions to graph`);
    await graphClient.importSimResults(report);
    
    return report;
  }
  
  /**
   * Check MiroFish health.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.host}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── EXPORT [export-001] ───────────────────────────────────────────────────

export const mirofishBridge = new MiroFishBridge();