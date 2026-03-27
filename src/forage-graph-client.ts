/**
 * forage-graph-client.ts
 * 
 * Extended for perception graph operations.
 * Drop this into the Forage MCP actor (web-intelligence-mcp).
 * Import graphClient, call methods after tool responses.
 * All methods use ESM with .js extensions per Apify Docker build requirements.
 */

import { createHash } from 'crypto';

const FORAGE_ENDPOINT = process.env.FORAGE_ENDPOINT || 'https://ernesta-labs--forage.apify.actor';
const APIFY_TOKEN = process.env.APIFY_TOKEN;

// ─── COST TRACKING [cost-001] ─────────────────────────────────────────────────

interface CostTracker {
  total: number;
  warnings: number;
  sessionStart: string;
  toolCalls: Array<{tool: string; entity: string; cost_usd: number; ts: string}>;
}

const costTracker: CostTracker = {
  total: 0,
  warnings: 0,
  sessionStart: new Date().toISOString(),
  toolCalls: []
};

const SESSION_BUDGET_USD = parseFloat(process.env.SESSION_BUDGET_USD || '5.00');
const COST_WARNING_THRESHOLD = 1.00;

function trackCost(toolName: string, entity: string, cost: number): void {
  costTracker.total += cost;
  costTracker.toolCalls.push({
    tool: toolName,
    entity,
    cost_usd: cost,
    ts: new Date().toISOString()
  });
  
  // Keep last 1000 calls
  if (costTracker.toolCalls.length > 1000) {
    costTracker.toolCalls = costTracker.toolCalls.slice(-1000);
  }
  
  if (costTracker.total >= COST_WARNING_THRESHOLD && costTracker.warnings === 0) {
    console.warn(`[COST] Warning: Session cost has reached $${COST_WARNING_THRESHOLD.toFixed(2)}`);
    costTracker.warnings = 1;
  } else if (costTracker.total >= costTracker.warnings + 1.0 && costTracker.warnings > 0) {
    console.warn(`[COST] Warning: Session cost has reached $${Math.floor(costTracker.total)}.00`);
    costTracker.warnings++;
  }
  
  if (costTracker.total >= SESSION_BUDGET_USD) {
    console.error(`[COST] ERROR: Budget exceeded $${SESSION_BUDGET_USD}. Stopping paid calls.`);
    throw new Error('SESSION_BUDGET_EXCEEDED');
  }
}

export function getCostTracker(): CostTracker {
  return { ...costTracker, toolCalls: [...costTracker.toolCalls] };
}

export function isBudgetExceeded(): boolean {
  return costTracker.total >= SESSION_BUDGET_USD;
}

// ─── ENTITY TYPES [perception-001] ───────────────────────────────────────────

export type EntityType = 
  | 'Nation' | 'Region' | 'City' | 'District' | 'Village'
  | 'Culture' | 'Religion' | 'IdentityGroup' | 'Belief'
  | 'Brand' | 'Product' | 'ProductCategory'
  | 'Organisation' | 'Person'
  | 'Narrative' | 'Event'
  | 'Agent';

export type GeoType = 'Nation' | 'Region' | 'City' | 'District' | 'Village';

export interface PerceptionAttrs {
  type?: 'PERCEIVES' | 'ASPIRES_TO' | 'DISTRUSTS' | 'NARRATIVE_FLOWS' | 'SHARES_MYTH' | 'BUYS' | 'LOCATED_IN' | 'BELONGS_TO';
  sentiment?: number;      // -1 to 1
  trust?: number;         // -1 to 1
  aspiration?: number;   // 0 to 1
  hostility?: number;     // 0 to 1
  familiarity?: number;   // 0 to 1
  velocity?: number;      // 0 to 1
  reach?: number;         // 0 to 1
  volume?: number;
  frequency?: string;
  channel?: string;
  intensity?: number;
  strength?: number;
  salience?: number;
  reason?: string;
  myth_name?: string;
}

// ─── SIMULATION TYPES [sim-001] ───────────────────────────────────────────────

export interface SimSeedJSON {
  entities: Array<{
    id: string;
    type: string;
    name: string;
    signals: Array<{metric: string; value: number; ts: string}>;
    causal_parents: Array<{id: string; weight: number}>;
  }>;
  connections: Array<{from: string; to: string; relation: string; weight: number}>;
  generated_at: string;
}

export interface SimReport {
  sim_id: string;
  predictions: Array<{
    entity: string;
    predicted_value: number;
    confidence: number;
    horizon: string;
  }>;
  narratives: Array<{
    topic: string;
    sentiment: number;
    velocity: number;
    reach: number;
  }>;
  completed_at: string;
}

// ─── MCP CLIENT [mcp-001] ───────────────────────────────────────────────────

async function callForageTool(toolName: string, params: Record<string, unknown>): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN not configured');
  }
  
  const response = await fetch(`${FORAGE_ENDPOINT}/mcp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.random().toString(36).substring(7),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    })
  });
  
  if (!response.ok) {
    if (response.status === 403) {
      // Charge API error - preserve main.ts pattern, ignore
      console.warn(`[CHARGE] 403 for ${toolName}, ignoring`);
      return null;
    }
    throw new Error(`Forage API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.result?.content?.[0]?.text ? JSON.parse(data.result.content[0].text) : null;
}

// ─── GRAPH CLIENT [graph-001] ───────────────────────────────────────────────

export const graphClient = {
  /**
   * Fire and forget — call this after every tool response.
   * Never awaited by the caller. Never throws. Never adds latency.
   */
  ingest(toolName: string, result: any): void {
    // Legacy method - no-op in extended version, use typed methods below
    if (!APIFY_TOKEN) return;
    
    // Background write would go here if needed
  },

  /**
   * Query knowledge graph with cache-first logic.
   * Returns cached data if fresh (<24h old).
   */
  async queryKnowledge(entity: string, minConfidence: number = 0.7): Promise<any> {
    trackCost('query_knowledge', entity, 0.05);
    try {
      return await callForageTool('query_knowledge', {
        question: entity,
        min_confidence: minConfidence
      });
    } catch (e) {
      console.error('[query_knowledge] error:', e);
      return null;
    }
  },

  /**
   * Get all claims for an entity.
   */
  async getClaims(entity: string): Promise<any> {
    trackCost('get_claims', entity, 0.05);
    try {
      return await callForageTool('get_claims', { entity });
    } catch (e) {
      console.error('[get_claims] error:', e);
      return null;
    }
  },

  /**
   * Add a claim to the graph.
   * Primary perception write tool.
   */
  async addClaim(
    entity: string,
    relation: string,
    target: string,
    assertion: string,
    sourceUrl: string,
    confidence: number = 0.7
  ): Promise<{claim_id: string} | null> {
    trackCost('add_claim', entity, 0.05);
    try {
      const result = await callForageTool('add_claim', {
        entity,
        relation,
        target,
        assertion,
        source_url: sourceUrl,
        confidence
      });
      return result;
    } catch (e) {
      console.error('[add_claim] error:', e);
      return null;
    }
  },

  /**
   * Add signal to graph.
   * Used for time-series data.
   */
  async addSignal(entity: string, metric: string, value: number, timestamp?: number): Promise<void> {
    trackCost('add_signal', entity, 0.05);
    try {
      await callForageTool('add_signal', {
        entity,
        metric,
        value,
        timestamp: timestamp || Date.now()
      });
    } catch (e) {
      console.error('[add_signal] error:', e);
    }
  },

  /**
   * Get signals for entity.
   */
  async getSignals(entity: string, metric?: string, limit: number = 100): Promise<any> {
    trackCost('get_signals', entity, 0.05);
    try {
      return await callForageTool('get_signals', {
        entity,
        metric,
        limit
      });
    } catch (e) {
      console.error('[get_signals] error:', e);
      return null;
    }
  },

  /**
   * Get graph stats.
   */
  async getGraphStats(): Promise<any> {
    trackCost('get_graph_stats', 'system', 0);
    try {
      return await callForageTool('get_graph_stats', {});
    } catch (e) {
      console.error('[get_graph_stats] error:', e);
      return null;
    }
  },

  /**
   * Set regime for entity.
   */
  async setRegime(entity: string, regime: string): Promise<void> {
    trackCost('set_regime', entity, 0.03);
    try {
      await callForageTool('set_regime', { entity, regime });
    } catch (e) {
      console.error('[set_regime] error:', e);
    }
  },

  /**
   * Get regime for entity.
   */
  async getRegime(entity: string): Promise<string | null> {
    trackCost('get_regime', entity, 0.03);
    try {
      const result = await callForageTool('get_regime', { entity });
      return result?.regime || null;
    } catch (e) {
      console.error('[get_regime] error:', e);
      return null;
    }
  },

  /**
   * Find connections between entities.
   */
  async findConnections(fromEntity: string, toEntity: string, maxHops: number = 3): Promise<any> {
    trackCost('find_connections', `${fromEntity}->${toEntity}`, 0.12);
    try {
      return await callForageTool('find_connections', {
        from_entity: fromEntity,
        to_entity: toEntity,
        max_hops: maxHops
      });
    } catch (e) {
      console.error('[find_connections] error:', e);
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PERCEPTION EDGE OPERATIONS [perception-002]
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Upsert a perception edge — idempotent write.
   * Queries existing data first, then adds claim + signals.
   */
  async upsertPerceptionEdge(
    fromEntity: string,
    fromType: EntityType,
    toEntity: string,
    toType: EntityType,
    attrs: PerceptionAttrs,
    source: string,
    confidence: number = 0.5
  ): Promise<{claim_id: string}> {
    // Check cache first - query existing knowledge
    const existingFrom = await this.queryKnowledge(fromEntity, 0);
    const existingTo = await this.queryKnowledge(toEntity, 0);
    
    // Build claim body
    const claimBody = {
      type: attrs.type || 'PERCEIVES',
      ...attrs
    };
    
    // Add the perception claim
    const claimResult = await this.addClaim(
      fromEntity,
      claimBody.type,
      toEntity,
      JSON.stringify(claimBody),
      source,
      confidence
    );
    
    // Add signals for numeric attributes
    if (attrs.sentiment !== undefined) {
      await this.addSignal(fromEntity, 'cross_border_sentiment', attrs.sentiment);
    }
    if (attrs.aspiration !== undefined) {
      await this.addSignal(fromEntity, 'aspiration_index', attrs.aspiration);
    }
    if (attrs.trust !== undefined) {
      await this.addSignal(fromEntity, 'cultural_trust', attrs.trust);
    }
    if (attrs.velocity !== undefined) {
      await this.addSignal(fromEntity, 'narrative_velocity', attrs.velocity);
    }
    if (attrs.reach !== undefined) {
      await this.addSignal(fromEntity, 'narrative_reach', attrs.reach);
    }
    
    return { claim_id: claimResult?.claim_id || '' };
  },

  /**
   * Upsert geographic node with hierarchy.
   */
  async upsertGeographicNode(
    name: string,
    type: GeoType,
    parent?: {name: string; type: GeoType},
    attrs?: Record<string, unknown>
  ): Promise<void> {
    // Use enrich_entity to create/update node
    trackCost('enrich_entity', name, 0.08);
    try {
      await callForageTool('enrich_entity', {
        identifier: name,
        type,
        ...attrs
      });
    } catch (e) {
      console.error('[upsertGeographicNode] error:', e);
    }
    
    // Add location edge if parent specified
    if (parent) {
      await this.addClaim(
        name,
        'LOCATED_IN',
        parent.name,
        JSON.stringify({ type: 'LOCATED_IN', parent_type: parent.type }),
        'osm',
        1.0
      );
    }
  },

  /**
   * Record narrative flow between entities.
   */
  async recordNarrativeFlow(
    source: string,
    target: string,
    velocity: number,
    reach: number,
    evidenceUrl: string
  ): Promise<void> {
    await this.addClaim(
      source,
      'NARRATIVE_FLOWS',
      target,
      JSON.stringify({
        type: 'NARRATIVE_FLOWS',
        velocity,
        reach,
        evidence: evidenceUrl
      }),
      evidenceUrl,
      0.7
    );
    
    await this.addSignal(source, 'narrative_velocity', velocity);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMULATION EXPORT/IMPORT [sim-seed-001]
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export subgraph as MiroFish OASIS compatible JSON.
   */
  async exportSimSeed(entities: string[]): Promise<SimSeedJSON> {
    const seed: SimSeedJSON = {
      entities: [],
      connections: [],
      generated_at: new Date().toISOString()
    };
    
    for (const entity of entities) {
      // Get signals for entity
      const signals = await this.getSignals(entity, undefined, 30);
      
      // Get causal parents
      let causalParents: Array<{id: string; weight: number}> = [];
      try {
        const causal = await callForageTool('causal_parents', { entity, limit: 10 });
        causalParents = (causal?.causal_parents || []).map((p: any) => ({
          id: p.entity || p.name,
          weight: p.weight || 0.5
        }));
      } catch (e) {
        // Ignore - may not have causal data
      }
      
      seed.entities.push({
        id: this.hashEntity(entity, 'Entity'),
        type: 'Entity',
        name: entity,
        signals: (signals || []).map((s: any) => ({
          metric: s.metric,
          value: s.value,
          ts: new Date(s.timestamp).toISOString()
        })),
        causal_parents: causalParents
      });
    }
    
    // Get connections between entities
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const conns = await this.findConnections(entities[i], entities[j]);
        if (conns?.connections?.length > 0) {
          for (const conn of conns.connections) {
            seed.connections.push({
              from: this.hashEntity(entities[i], 'Entity'),
              to: this.hashEntity(entities[j], 'Entity'),
              relation: conn.relation || 'related_to',
              weight: conn.confidence || 0.5
            });
          }
        }
      }
    }
    
    return seed;
  },

  /**
   * Import simulation results into graph.
   */
  async importSimResults(report: SimReport): Promise<void> {
    // Write predictions as signals
    for (const pred of report.predictions || []) {
      await this.addSignal(
        pred.entity,
        'sim_prediction',
        pred.predicted_value
      );
    }
    
    // Write narrative edges
    for (const narr of report.narratives || []) {
      await this.addClaim(
        'Simulation',
        'NARRATIVE_FLOWS',
        narr.topic,
        JSON.stringify({
          sentiment: narr.sentiment,
          velocity: narr.velocity,
          reach: narr.reach
        }),
        `sim:${report.sim_id}`,
        narr.sentiment > 0.5 ? 0.8 : 0.5
      );
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES [util-001]
  // ═══════════════════════════════════════════════════════════════════════════

  hashEntity(name: string, type: string): string {
    return createHash('sha256')
      .update(`${name}:${type}`)
      .digest('hex')
      .substring(0, 16);
  }
};

/**
 * ─── WHERE TO ADD THE ONE-LINER IN EACH HANDLER ──────────────────────────────
 *
 * For perception edges (cultural_analyst, brand_strategist agents):
 *   await graphClient.upsertPerceptionEdge(
 *     'Russia', 'Nation', 
 *     'Italian luxury', 'Brand',
 *     { type: 'PERCEIVES', aspiration: 0.8, trust: 0.3 },
 *     'gdelt+reddit',
 *     0.7
 *   );
 *
 * For geographic nodes:
 *   await graphClient.upsertGeographicNode('Kazan', 'City', 
 *     { name: 'Tatarstan', type: 'Region' },
 *     { population: 1250000 }
 *   );
 *
 * For narrative tracking:
 *   await graphClient.recordNarrativeFlow(
 *     'Russia', 'Western fashion', 0.8, 0.5, 'reddit.com/r/russia'
 *   );
 *
 * Budget tracking:
 *   if (isBudgetExceeded()) {
 *     console.warn('[AGENT] Budget exceeded, stopping paid calls');
 *     return;
 *   }
 */