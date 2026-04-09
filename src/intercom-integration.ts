// ==========================================
// INTERCOM FIN INTEGRATION
// Webhook handlers, lead qualification, Fin-to-Forage bridge
// ==========================================

import crypto from 'node:crypto';
import axios from 'axios';
import { graphClient } from './forage-graph-client.js';

// Intercom API configuration
const INTERCOM_API_BASE = 'https://api.intercom.io';

interface IntercomContact {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  custom_attributes?: Record<string, any>;
  created_at: number;
}

interface IntercomConversation {
  id: string;
  conversation_message?: {
    body?: string;
  };
  conversation_parts?: {
    conversation_parts: Array<{
      body?: string;
      part_type?: string;
    }>;
  };
}

// ==========================================
// WEBHOOK VERIFICATION
// ==========================================

export function verifyIntercomWebhook(payload: string, signature: string, secret: string): boolean {
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// ==========================================
// INTERCOM API CLIENT
// ==========================================

async function intercomRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT' = 'GET', data?: any) {
  const token = process.env.INTERCOM_ACCESS_TOKEN;
  if (!token) throw new Error('INTERCOM_ACCESS_TOKEN not configured');

  const res = await axios({
    method,
    url: `${INTERCOM_API_BASE}${endpoint}`,
    data,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return res.data;
}

// ==========================================
// CONTACT & LEAD MANAGEMENT
// ==========================================

export async function createIntercomContact(email: string, name?: string, attributes?: Record<string, any>) {
  return intercomRequest('/contacts', 'POST', {
    email,
    name,
    role: 'lead',
    custom_attributes: attributes,
  });
}

export async function getIntercomContact(id: string) {
  return intercomRequest(`/contacts/${id}`);
}

export async function tagContact(contactId: string, tag: string) {
  return intercomRequest('/tags', 'POST', {
    name: tag,
    users: [{ id: contactId }],
  });
}

export async function addNoteToContact(contactId: string, body: string) {
  return intercomRequest('/notes', 'POST', {
    admin_id: process.env.INTERCOM_ADMIN_ID,
    body,
    contact: { id: contactId },
  });
}

// ==========================================
// CONVERSATION MANAGEMENT
// ==========================================

export async function getIntercomConversation(id: string): Promise<IntercomConversation> {
  return intercomRequest(`/conversations/${id}`);
}

export async function replyToConversation(conversationId: string, message: string, type: 'comment' | 'note' = 'comment') {
  return intercomRequest(`/conversations/${conversationId}/reply`, 'POST', {
    message_type: type,
    type: 'admin',
    admin_id: process.env.INTERCOM_ADMIN_ID,
    body: message,
  });
}

// ==========================================
// LEAD QUALIFICATION ENGINE
// ==========================================

interface LeadScore {
  score: number;
  factors: string[];
  company?: any;
  funding?: any;
}

export async function qualifyLead(contact: IntercomContact): Promise<LeadScore> {
  const factors: string[] = [];
  let score = 0;
  let companyData = null;
  let fundingData = null;

  // Extract domain from email
  const email = contact.email;
  if (!email) return { score: 0, factors: ['No email provided'] };

  const domain = email.split('@')[1];
  if (!domain) return { score: 0, factors: ['Invalid email format'] };

  try {
    // Get company info from Forage
    const companyResult = await graphClient.queryKnowledge(domain, 0);
    if (companyResult.found) {
      companyData = companyResult;
      score += 20;
      factors.push('Company found in graph');

      // Check relationships
      const relCount = Object.values(companyResult.relationships || {}).flat().length;
      if (relCount > 5) {
        score += 15;
        factors.push(`Strong relationship network (${relCount} connections)`);
      }
    }
  } catch {
    // Company not in graph yet
  }

  // Check for funding intel if we have company data
  if (companyData) {
    try {
      // Funding data would be stored in graph under signals
      const signals = await graphClient.getSignals(companyData.entity.name, 'funding');
      if (signals && signals.length > 0) {
        fundingData = signals;
        score += 25;
        factors.push('Funding history available');

        // Recent funding is a strong signal
        const recentFunding = signals.find((s: any) => s.timestamp > Date.now() - 180 * 24 * 60 * 60 * 1000);
        if (recentFunding) {
          score += 20;
          factors.push('Recent funding round (< 6 months)');
        }
      }
    } catch {
      // No funding data
    }
  }

  // Score based on email domain quality
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
  if (!personalDomains.includes(domain.toLowerCase())) {
    score += 15;
    factors.push('Business email domain');
  }

  // Check name completeness
  if (contact.name && contact.name.trim().split(' ').length >= 2) {
    score += 10;
    factors.push('Complete name provided');
  }

  return {
    score: Math.min(100, score),
    factors,
    company: companyData,
    funding: fundingData,
  };
}

export async function handleQualifiedLead(contactId: string, score: LeadScore) {
  const QUALIFIED_THRESHOLD = 70;

  if (score.score >= QUALIFIED_THRESHOLD) {
    // Tag as qualified and route to sales
    await tagContact(contactId, 'Qualified Lead');
    await tagContact(contactId, `Score: ${score.score}`);

    // Add enriched data as note
    const noteBody = `🎯 Lead Score: ${score.score}/100\n\nFactors:\n${score.factors.map(f => `- ${f}`).join('\n')}\n\n${score.company ? `Company: ${score.company.entity.name}` : ''}`;
    await addNoteToContact(contactId, noteBody);

    // Log to graph
    await graphClient.ingest('lead_qualified', {
      contact_id: contactId,
      score: score.score,
      company: score.company?.entity?.name,
      qualified: true,
    });

    return { qualified: true, routed_to: 'sales' };
  } else {
    // Tag for marketing nurture
    await tagContact(contactId, 'Marketing');
    await tagContact(contactId, `Score: ${score.score}`);

    await graphClient.ingest('lead_qualified', {
      contact_id: contactId,
      score: score.score,
      qualified: false,
    });

    return { qualified: false, routed_to: 'marketing' };
  }
}

// ==========================================
// FIN-TO-FORAGE BRIDGE
// Handles complex queries Fin can't answer
// ==========================================

export async function handleFinHandoff(conversationId: string, query: string): Promise<string> {
  // Extract intent from query
  const lowerQuery = query.toLowerCase();
  let answer = '';
  let toolsUsed: string[] = [];

  try {
    // Company research queries
    if (lowerQuery.includes('company') || lowerQuery.includes('competitor') || lowerQuery.includes('funding')) {
      const companyMatch = query.match(/(?:company|about)\s+(\w+)/i);
      if (companyMatch) {
        const companyName = companyMatch[1];
        // Query knowledge graph
        const graphResult = await graphClient.queryKnowledge(companyName, 0);
        if (graphResult && graphResult.results.length > 0) {
          answer = `Based on our research, ${companyName} is ${graphResult.results[0].properties?.description || 'a company in our database'}. `;
          answer += `I found ${graphResult.results.length} related entities in our knowledge graph.`;
          toolsUsed.push('query_knowledge');
        }
      }
    }

    // Lead generation queries
    if (lowerQuery.includes('leads') || lowerQuery.includes('prospects') || lowerQuery.includes('contacts')) {
      answer = 'I can help you generate leads using our lead discovery tools. You can use `find_leads` to search by job title, location, and industry, or `skill_outbound_list` for a complete lead list with verified emails.';
      toolsUsed.push('find_leads', 'skill_outbound_list');
    }

    // Pricing/tool questions
    if (lowerQuery.includes('price') || lowerQuery.includes('cost') || lowerQuery.includes('$')) {
      answer = 'Forage uses pay-per-call pricing with $5 in free credits to start. Core tools range from $0.03 (search) to $0.25/100 leads. Skills range from $0.45 to $3.50 depending on complexity. All costs are shown in tool responses.';
      toolsUsed.push('pricing_info');
    }

    // If no specific match, provide general help
    if (!answer) {
      answer = 'I can help you with company research, lead generation, and using Forage tools. For complex queries, I recommend using the specific tools like `search_web`, `get_company_info`, or the Skills. Would you like me to guide you through any specific use case?';
    }

    // Add note to conversation with context
    const contextNote = `🤖 Forage AI Assistance\n\nQuery: "${query}"\n\nTools suggested: ${toolsUsed.join(', ')}\n\nDraft response:\n${answer}`;
    await replyToConversation(conversationId, contextNote, 'note');

    return answer;
  } catch (err: any) {
    console.error('[Intercom] Fin handoff error:', err);
    return 'I apologize, but I encountered an issue processing your request. A human agent will be with you shortly.';
  }
}

// ==========================================
// WEBHOOK HANDLERS
// ==========================================

export async function handleContactCreated(payload: any) {
  const contact: IntercomContact = payload.data?.item;
  if (!contact) return { status: 'no_contact' };

  console.log('[Intercom] New contact:', contact.email);

  try {
    // Qualify the lead
    const score = await qualifyLead(contact);
    const routing = await handleQualifiedLead(contact.id, score);

    return {
      status: 'qualified',
      contact_id: contact.id,
      score: score.score,
      routed_to: routing.routed_to,
    };
  } catch (err: any) {
    console.error('[Intercom] Lead qualification error:', err);
    return { status: 'error', error: err.message };
  }
}

export async function handleConversationOpened(payload: any) {
  const conversation: IntercomConversation = payload.data?.item;
  if (!conversation) return { status: 'no_conversation' };

  console.log('[Intercom] Conversation opened:', conversation.id);

  // Log to graph for analytics
  await graphClient.ingest('intercom_conversation', {
    conversation_id: conversation.id,
    event: 'opened',
    timestamp: Date.now(),
  });

  return { status: 'logged', conversation_id: conversation.id };
}

export async function handleConversationClosed(payload: any) {
  const conversation: IntercomConversation = payload.data?.item;
  if (!conversation) return { status: 'no_conversation' };

  console.log('[Intercom] Conversation closed:', conversation.id);

  // Update graph with outcome
  await graphClient.ingest('intercom_conversation', {
    conversation_id: conversation.id,
    event: 'closed',
    timestamp: Date.now(),
  });

  return { status: 'updated', conversation_id: conversation.id };
}

export async function handleUserIntercalated(payload: any) {
  const conversation: IntercomConversation = payload.data?.item;
  if (!conversation) return { status: 'no_conversation' };

  // Get the user's question from the conversation
  const question = conversation.conversation_message?.body ||
    conversation.conversation_parts?.conversation_parts?.pop()?.body ||
    'Unknown query';

  console.log('[Intercom] Fin handoff, question:', question.substring(0, 100));

  // Handle the handoff
  const answer = await handleFinHandoff(conversation.id, question);

  return {
    status: 'handled',
    conversation_id: conversation.id,
    answer_provided: !!answer,
  };
}

// ==========================================
// MCP TOOL HANDLERS
// ==========================================

export async function handleIntercomCreateContact(args: { email: string; name?: string; attributes?: Record<string, any> }) {
  const contact = await createIntercomContact(args.email, args.name, args.attributes);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        created: true,
        contact_id: contact.id,
        email: contact.email,
      }, null, 2),
    }],
  };
}

export async function handleIntercomGetConversation(args: { conversation_id: string }) {
  const conversation = await getIntercomConversation(args.conversation_id);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        id: conversation.id,
        message_count: conversation.conversation_parts?.conversation_parts?.length || 0,
        latest_message: conversation.conversation_message?.body?.substring(0, 200),
      }, null, 2),
    }],
  };
}

export async function handleIntercomReply(args: { conversation_id: string; message: string; type?: 'comment' | 'note' }) {
  const reply = await replyToConversation(args.conversation_id, args.message, args.type);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        replied: true,
        conversation_id: args.conversation_id,
        type: args.type || 'comment',
      }, null, 2),
    }],
  };
}

export async function handleIntercomQualifyLead(args: { contact_id: string }) {
  const contact = await getIntercomContact(args.contact_id);
  const score = await qualifyLead(contact);
  const routing = await handleQualifiedLead(args.contact_id, score);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        contact_id: args.contact_id,
        score: score.score,
        qualified: routing.qualified,
        routed_to: routing.routed_to,
        factors: score.factors,
      }, null, 2),
    }],
  };
}

export async function handleIntercomRouteToSales(args: { contact_id: string; note?: string }) {
  await tagContact(args.contact_id, 'Sales Handoff');
  if (args.note) {
    await addNoteToContact(args.contact_id, args.note);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        routed: true,
        contact_id: args.contact_id,
        tag: 'Sales Handoff',
        note_added: !!args.note,
      }, null, 2),
    }],
  };
}

// Tool definitions for MCP server
export const INTERCOM_TOOLS = [
  {
    name: 'intercom_create_contact',
    description: 'Create a new contact/lead in Intercom. Use for capturing leads from website or forms. Cost: $0.02',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        name: { type: 'string' },
        attributes: { type: 'object' },
      },
      required: ['email'],
    },
  },
  {
    name: 'intercom_get_conversation',
    description: 'Get details of an Intercom conversation including message history. Cost: $0.02',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
      },
      required: ['conversation_id'],
    },
  },
  {
    name: 'intercom_reply',
    description: 'Reply to an Intercom conversation as admin or add internal note. Cost: $0.03',
    inputSchema: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string' },
        message: { type: 'string' },
        type: { type: 'string', enum: ['comment', 'note'] },
      },
      required: ['conversation_id', 'message'],
    },
  },
  {
    name: 'intercom_qualify_lead',
    description: 'Score and qualify a lead using Forage enrichment. Auto-routes to sales or marketing. Cost: $0.25',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
      },
      required: ['contact_id'],
    },
  },
  {
    name: 'intercom_route_to_sales',
    description: 'Tag contact for sales handoff and add context note. Cost: $0.02',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['contact_id'],
    },
  },
];
