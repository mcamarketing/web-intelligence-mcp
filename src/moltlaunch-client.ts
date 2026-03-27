/**
 * moltlaunch-client.ts
 * 
 * Moltlaunch ERC-8004 agent identity and job marketplace client.
 * All imports use .js extensions per Apify Docker build requirements.
 * 
 * Uses child_process.exec wrapped in Promise.
 */

import { graphClient } from './forage-graph-client.js';

const MOLTLAUNCH_CLI = process.env.MOLTLAUNCH_CLI || 'mltl';

// ─── TYPES [types-001] ─────────────────────────────────────────────────────

export interface MoltlaunchAgent {
  wallet_address: string;
  role: string;
  skills: string[];
  registered_at: string;
}

export interface MoltlaunchJob {
  job_id: string;
  agent_id: string;
  task: string;
  status: 'pending' | 'assigned' | 'completed' | 'disputed';
  budget: number;
}

export interface ReputationScore {
  score: number;
  completed_jobs: number;
  eth_earned: number;
}

// ─── EXEC WRAPPER [exec-001] ─────────────────────────────────────────────────

function execCommand(cmd: string): Promise<{stdout: string; stderr: string; code: number}> {
  return new Promise((resolve) => {
    const { exec } = require('node:child_process');
    exec(cmd, (err: any, stdout: string, stderr: string) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        code: err?.code || 0
      });
    });
  });
}

// ─── CLIENT [client-001] ───────────────────────────────────────────────────

export class MoltlaunchClient {
  private readonly cli: string;
  
  constructor(cliPath: string = MOLTLAUNCH_CLI) {
    this.cli = cliPath;
  }
  
  /**
   * Register an agent with Moltlaunch (ERC-8004).
   */
  async registerAgent(
    agentId: string, 
    role: string, 
    skills: string[]
  ): Promise<{wallet_address: string}> {
    const cmd = `${this.cli} register --id ${agentId} --role ${role} --skills ${skills.join(',')}`;
    
    console.log(`[MOLTLAUNCH] Registering agent ${agentId}...`);
    
    try {
      const result = await execCommand(cmd);
      
      if (result.code !== 0) {
        throw new Error(`Registration failed: ${result.stderr}`);
      }
      
      // Parse wallet address from output
      // Expected format: "Registered. Wallet: 0x..."
      const match = result.stdout.match(/0x[a-fA-F0-9]{40}/);
      const walletAddress = match ? match[0] : '';
      
      // Write to Forage graph
      await graphClient.addClaim(
        agentId,
        'MOLTLAUNCH_ID',
        walletAddress,
        JSON.stringify({ role, skills, registered_at: new Date().toISOString() }),
        'moltlaunch',
        1.0
      );
      
      console.log(`[MOLTLAUNCH] Registered ${agentId} with wallet ${walletAddress}`);
      
      return { wallet_address: walletAddress };
    } catch (e: any) {
      console.warn(`[MOLTLAUNCH] Registration failed (CLI may not be installed): ${e.message}`);
      // Return mock address if CLI not available
      const mockAddress = `0x${agentId.substring(0, 40).padEnd(40, '0')}`;
      return { wallet_address: mockAddress };
    }
  }
  
  /**
   * Submit a job to the marketplace.
   */
  async submitJob(agentId: string, task: string): Promise<{job_id: string}> {
    const cmd = `${this.cli} post-job --agent ${agentId} --task "${task}"`;
    
    console.log(`[MOLTLAUNCH] Submitting job for agent ${agentId}...`);
    
    try {
      const result = await execCommand(cmd);
      
      if (result.code !== 0) {
        throw new Error(`Job submission failed: ${result.stderr}`);
      }
      
      // Parse job ID from output
      const match = result.stdout.match(/job-[a-fA-F0-9]+/);
      const jobId = match ? match[0] : `job-${Date.now()}`;
      
      console.log(`[MOLTLAUNCH] Job submitted: ${jobId}`);
      
      return { job_id: jobId };
    } catch (e: any) {
      console.warn(`[MOLTLAUNCH] Job submission failed: ${e.message}`);
      return { job_id: `job-mock-${Date.now()}` };
    }
  }
  
  /**
   * Claim reward for completed job.
   */
  async claimReward(jobId: string): Promise<{tx_hash: string}> {
    const cmd = `${this.cli} claim-reward --job ${jobId}`;
    
    console.log(`[MOLTLAUNCH] Claiming reward for job ${jobId}...`);
    
    try {
      const result = await execCommand(cmd);
      
      if (result.code !== 0) {
        throw new Error(`Claim failed: ${result.stderr}`);
      }
      
      // Parse transaction hash
      const match = result.stdout.match(/0x[a-fA-F0-9]{64}/);
      const txHash = match ? match[0] : '';
      
      console.log(`[MOLTLAUNCH] Reward claimed: ${txHash}`);
      
      return { tx_hash: txHash };
    } catch (e: any) {
      console.warn(`[MOLTLAUNCH] Claim failed: ${e.message}`);
      return { tx_hash: '' };
    }
  }
  
  /**
   * Get agent reputation score.
   */
  async getReputation(agentId: string): Promise<ReputationScore> {
    const cmd = `${this.cli} reputation --agent ${agentId}`;
    
    try {
      const result = await execCommand(cmd);
      
      if (result.code !== 0) {
        throw new Error(`Reputation query failed: ${result.stderr}`);
      }
      
      // Parse output - expected format:
      // Score: 0.85, Jobs: 42, ETH: 2.5
      const scoreMatch = result.stdout.match(/Score:\s*([\d.]+)/);
      const jobsMatch = result.stdout.match(/Jobs:\s*(\d+)/);
      const ethMatch = result.stdout.match(/ETH:\s*([\d.]+)/);
      
      return {
        score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
        completed_jobs: jobsMatch ? parseInt(jobsMatch[1]) : 0,
        eth_earned: ethMatch ? parseFloat(ethMatch[1]) : 0
      };
    } catch (e: any) {
      console.warn(`[MOLTLAUNCH] Reputation query failed: ${e.message}`);
      return { score: 0.5, completed_jobs: 0, eth_earned: 0 };
    }
  }
  
  /**
   * Verify agent identity on-chain.
   */
  async verifyIdentity(agentId: string): Promise<boolean> {
    const cmd = `${this.cli} verify --id ${agentId}`;
    
    try {
      const result = await execCommand(cmd);
      return result.code === 0 && result.stdout.includes('Verified');
    } catch {
      return false;
    }
  }
}

// ─── EXPORT [export-001] ───────────────────────────────────────────────────

export const moltlaunchClient = new MoltlaunchClient();