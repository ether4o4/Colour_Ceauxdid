/**
 * LLM dispatch layer.
 *
 * - BYOK multi-provider: OpenRouter (hosted) + Ollama (local).
 * - Secrets pulled from expo-secure-store via the store layer.
 * - Per-agent pinning: agent.preferredProvider / preferredModel / preferredKeyId
 *   override the defaults from ProviderSettings.
 * - Round-robin across active keys when no specific key is pinned.
 * - Usage tracking: parses OpenRouter's `usage` event (include_usage:true) and
 *   Ollama's final chunk tokens; logs every completion to the ledger.
 * - Pinned memories injected into the system prompt.
 */

import { SwarmAgent, SwarmMessage, MessageUsage } from '../types';
import {
  getAgentMemory, getPinnedMemories, getApiKeys, getProviderSettings,
  markApiKeyUsed, resolveApiKeySecret, getCoreAgentPrefs,
  logUsage as logUsageEntry,
  ApiProvider, ApiKey,
} from '../store';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ────────── Key selection ──────────
const _rrCounter: Record<string, number> = {};

async function keysForProvider(provider: ApiProvider): Promise<ApiKey[]> {
  return (await getApiKeys(provider)).filter(k => k.isActive);
}

async function pickKeyForAgent(
  provider: ApiProvider,
  preferredKeyId?: string,
): Promise<ApiKey | null> {
  const keys = await keysForProvider(provider);
  if (keys.length === 0) return null;
  if (preferredKeyId) {
    const pinned = keys.find(k => k.id === preferredKeyId);
    if (pinned) { markApiKeyUsed(pinned.id).catch(() => {}); return pinned; }
  }
  const idx = (_rrCounter[provider] ?? 0) % keys.length;
  _rrCounter[provider] = idx + 1;
  const k = keys[idx];
  markApiKeyUsed(k.id).catch(() => {});
  return k;
}

// ────────── Agent resolution helpers ──────────
async function resolveAgentProviderAndModel(agent: SwarmAgent) {
  const settings = await getProviderSettings();
  // Custom agents carry pinning on the agent itself; core agents carry it in prefs store.
  let provider = agent.preferredProvider;
  let model = agent.preferredModel;
  let keyId = agent.preferredKeyId;
  if (!agent.isCustom) {
    const prefs = await getCoreAgentPrefs();
    const mine = prefs[agent.id] || {};
    provider = provider || mine.preferredProvider;
    model = model || mine.preferredModel;
    keyId = keyId || mine.preferredKeyId;
  }
  provider = provider || settings.defaultProvider;
  model = model || (provider === 'ollama' ? settings.ollamaModel : settings.defaultModel);
  return { provider, model, keyId };
}

// ────────── Prompt assembly ──────────
async function buildSystemPrompt(agent: SwarmAgent): Promise<string> {
  const memory = await getAgentMemory(agent.id);
  const memBlock = Object.keys(memory).length > 0
    ? `\n\nYour persistent memory:\n${Object.entries(memory).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : '';
  const pinned = await getPinnedMemories(agent.id);
  const pinBlock = pinned.length > 0
    ? `\n\nPinned facts the user wants you to remember:\n${pinned.map(p => `  - ${p.key}: ${p.value}`).join('\n')}`
    : '';
  return agent.systemPrompt + memBlock + pinBlock;
}

function buildApiMessages(history: SwarmMessage[], userMessage: string) {
  const recent = history.slice(-20);
  const apiMessages = recent.map(m => ({
    role: (m.senderId === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.senderId !== 'user' ? `[${m.senderName}]: ${m.text}` : m.text,
  }));
  apiMessages.push({ role: 'user', content: userMessage });
  return apiMessages;
}

// ────────── OpenRouter streaming + usage capture ──────────
async function openrouterStream(
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  temperature: number,
  onChunk: (s: string) => void,
  onDone: (usage?: MessageUsage) => void,
  onError: (e: string) => void,
) {
  try {
    const resp = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://colour-ceauxdid.app',
        'X-Title': 'Colour Ceauxdid',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...apiMessages],
        stream: true,
        max_tokens: 600,
        temperature,
        // Ask OpenRouter to include a final usage chunk so we can log cost.
        stream_options: { include_usage: true },
        usage: { include: true },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      onError(`OpenRouter ${resp.status}: ${txt.slice(0, 200)}`);
      return;
    }

    let generationId: string | undefined;
    let usage: MessageUsage | undefined;

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.id && !generationId) generationId = parsed.id;
        const chunk = parsed.choices?.[0]?.delta?.content;
        if (chunk) onChunk(chunk);
        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens || 0,
            completionTokens: parsed.usage.completion_tokens || 0,
            totalTokens: parsed.usage.total_tokens || 0,
            costUsd: typeof parsed.usage.cost === 'number' ? parsed.usage.cost : undefined,
            model,
            provider: 'openrouter',
          };
        }
      } catch {}
    };

    const reader = resp.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) processLine(line);
      }
    } else {
      const all = await resp.text();
      for (const line of all.split('\n')) processLine(line);
    }

    // If cost wasn't in stream, ask the generation endpoint (costs nothing extra).
    if (usage && usage.costUsd == null && generationId) {
      try {
        const g = await fetch(`${OPENROUTER_BASE}/generation?id=${generationId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (g.ok) {
          const gjson = await g.json();
          const total = gjson?.data?.total_cost;
          if (typeof total === 'number') usage.costUsd = total;
        }
      } catch {}
    }

    onDone(usage);
  } catch (err: any) {
    onError(err?.message || 'Network error');
  }
}

// ────────── Ollama ──────────
async function ollamaStream(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  temperature: number,
  onChunk: (s: string) => void,
  onDone: (usage?: MessageUsage) => void,
  onError: (e: string) => void,
) {
  const url = baseUrl.replace(/\/+$/, '') + '/api/chat';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...apiMessages],
        stream: true,
        options: { temperature, num_predict: 600 },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      onError(`Ollama ${resp.status}: ${txt.slice(0, 200)}`);
      return;
    }

    let promptTokens = 0, completionTokens = 0;

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        const chunk = parsed.message?.content;
        if (chunk) onChunk(chunk);
        if (parsed.prompt_eval_count) promptTokens = parsed.prompt_eval_count;
        if (parsed.eval_count) completionTokens = parsed.eval_count;
        if (parsed.done) {
          onDone({
            promptTokens, completionTokens,
            totalTokens: promptTokens + completionTokens,
            costUsd: 0, model, provider: 'ollama',
          });
        }
      } catch {}
    };

    const reader = resp.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) processLine(line);
      }
    } else {
      const all = await resp.text();
      for (const line of all.split('\n')) processLine(line);
    }
  } catch (err: any) {
    onError(err?.message || 'Network error contacting Ollama');
  }
}

// ────────── Public API ──────────
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (usage?: MessageUsage) => void;
  onError: (err: string) => void;
}

export async function streamAgentResponse(
  agent: SwarmAgent,
  userMessage: string,
  chatHistory: SwarmMessage[],
  onChunk: (chunk: string) => void,
  onDone: (usage?: MessageUsage) => void | ((_: MessageUsage | undefined) => void),
  onError: (err: string) => void,
  context?: { scopeKey?: string },
): Promise<void> {
  const { provider, model, keyId } = await resolveAgentProviderAndModel(agent);

  const key = await pickKeyForAgent(provider, keyId);
  if (!key) {
    onError(
      provider === 'openrouter'
        ? 'No active OpenRouter API key. Open Settings → API Keys to add one.'
        : 'No active Ollama endpoint. Open Settings → API Keys to add a base URL.'
    );
    return;
  }
  const secret = await resolveApiKeySecret(key);
  if (!secret) {
    onError('Selected API key has no stored secret — re-add it in Settings.');
    return;
  }

  const systemPrompt = await buildSystemPrompt(agent);
  const apiMessages = buildApiMessages(chatHistory, userMessage);

  const temperature =
    agent.id === 'yellow' ? 0.9 :
    agent.id === 'red' ? 0.3 : 0.7;

  const wrappedDone = async (usage?: MessageUsage) => {
    if (usage && context?.scopeKey) {
      try {
        await logUsageEntry({
          id: uuidv4(),
          timestamp: Date.now(),
          scopeKey: context.scopeKey,
          agentId: agent.id,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          costUsd: usage.costUsd || 0,
          model: usage.model,
          provider: usage.provider,
        });
      } catch {}
    }
    (onDone as any)(usage);
  };

  if (provider === 'openrouter') {
    return openrouterStream(secret, model, systemPrompt, apiMessages, temperature, onChunk, wrappedDone, onError);
  }
  if (provider === 'ollama') {
    return ollamaStream(secret, model, systemPrompt, apiMessages, temperature, onChunk, wrappedDone, onError);
  }
  onError(`Unknown provider: ${provider}`);
}

export async function getSingleAgentResponse(
  agent: SwarmAgent,
  userMessage: string,
  chatHistory: SwarmMessage[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    let full = '';
    streamAgentResponse(
      agent, userMessage, chatHistory,
      (c) => { full += c; },
      () => resolve(full),
      (e) => reject(new Error(e)),
    );
  });
}

// ────────── Key validation ──────────
export async function testOpenRouterKey(key: string): Promise<{ ok: boolean; error?: string; label?: string; limit?: number | null }> {
  try {
    const r = await fetch(`${OPENROUTER_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: `${r.status}: ${txt.slice(0, 160) || 'invalid key'}` };
    }
    const data = await r.json().catch(() => ({} as any));
    const info = (data && (data.data || data)) || {};
    return { ok: true, label: info.label, limit: info.limit ?? null };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export async function testOllamaEndpoint(baseUrl: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    const url = baseUrl.replace(/\/+$/, '') + '/api/tags';
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `${r.status}` };
    const data = await r.json();
    const models = (data.models || []).map((m: any) => m.name);
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unreachable' };
  }
}

// ────────── OpenRouter model catalog (for per-agent model picker) ──────────
export async function listOpenRouterModels(apiKey?: string): Promise<{ id: string; name?: string; pricing?: any }[]> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const r = await fetch(`${OPENROUTER_BASE}/models`, { headers });
    if (!r.ok) return [];
    const data = await r.json();
    return data.data || [];
  } catch { return []; }
}
