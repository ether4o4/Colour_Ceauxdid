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
  // 'elevenlabs' is a TTS-only provider — never a chat target. Coerce to openrouter.
  const chatProvider: 'openrouter' | 'ollama' =
    (provider || settings.defaultProvider) === 'ollama' ? 'ollama' : 'openrouter';
  model = model || (chatProvider === 'ollama' ? settings.ollamaModel : settings.defaultModel);
  return { provider: chatProvider, model, keyId };
}

// ────────── Prompt assembly ──────────
const GROUP_CHAT_RULES = `

HOW TO TALK — read this carefully, it matters more than anything above:
You are texting in a group chat. Sound like a real person, not an AI. The single most important thing is that your replies feel natural and human.

Do:
- Use contractions (it's, you're, don't, that's, I'd). Always.
- Vary your rhythm. Real people mix a long thought with a three-word reaction. Sometimes a fragment. Sometimes one line is the whole reply.
- React to what was just said before answering — "yeah but", "wait", "honestly", "ok so". Talk WITH people, don't just emit answers AT them.
- Get to the point. Say the thing. Stop.

Never:
- Open with filler: no "Certainly", "Great question", "Sure thing", "I'd be happy to", "Absolutely". Just start.
- Close with filler: no "Let me know if you need anything", "Hope this helps", "Feel free to ask". Just stop.
- Prefix your name or role ("[Red]:", "As the analysis agent…"). The UI shows who you are. The "[Name]:" tags on past messages are only so you know who spoke — never copy that format.
- Restate the question back before answering it.
- Bullet-point or number things by reflex. Only use a list when you're genuinely listing. Default to prose, the way you'd actually type.
- Over-explain. If two sentences cover it, don't write six.

Example of the wrong robotic tone:
"Great question! As the analysis agent, I'd be happy to help. Here are three considerations: 1)… 2)… 3)… Let me know if you'd like me to elaborate!"
Example of the right natural tone:
"It mostly comes down to cost. The 70B is slower and gets rate-limited — for a chat like this the 8B is plenty. I'd just default to that."

Stay in your own distinct voice while doing all of the above.`;

async function buildSystemPrompt(agent: SwarmAgent): Promise<string> {
  const memory = await getAgentMemory(agent.id);
  const memBlock = Object.keys(memory).length > 0
    ? `\n\nYour persistent memory:\n${Object.entries(memory).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : '';
  const pinned = await getPinnedMemories(agent.id);
  const pinBlock = pinned.length > 0
    ? `\n\nPinned facts the user wants you to remember:\n${pinned.map(p => `  - ${p.key}: ${p.value}`).join('\n')}`
    : '';
  return agent.systemPrompt + memBlock + pinBlock + GROUP_CHAT_RULES;
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

  // Build a single attempt for one specific provider/model/key
  const attempt = async (p: 'openrouter' | 'ollama', m: string, kId?: string): Promise<{ ok: boolean; error?: string; was404?: boolean; was429?: boolean }> => {
    const k = await pickKeyForAgent(p, kId);
    if (!k) return { ok: false, error: 'no-key' };
    const secret = await resolveApiKeySecret(k);
    if (!secret) return { ok: false, error: 'no-secret' };

    const systemPrompt = await buildSystemPrompt(agent);
    const apiMessages = buildApiMessages(chatHistory, userMessage);
    const temperature = agent.id === 'yellow' ? 0.9 : agent.id === 'red' ? 0.3 : 0.7;

    let chunks = 0;
    let caughtErr: string | undefined;
    let caughtUsage: MessageUsage | undefined;
    const wrapChunk = (c: string) => { chunks++; onChunk(c); };

    await new Promise<void>((resolve) => {
      const onDoneInner = (u?: MessageUsage) => { caughtUsage = u; resolve(); };
      const onErrInner = (e: string) => { caughtErr = e; resolve(); };
      if (p === 'openrouter') {
        openrouterStream(secret, m, systemPrompt, apiMessages, temperature, wrapChunk, onDoneInner, onErrInner);
      } else {
        ollamaStream(secret, m, systemPrompt, apiMessages, temperature, wrapChunk, onDoneInner, onErrInner);
      }
    });

    if (caughtErr) {
      const is404 = /\b404\b|no endpoints found/i.test(caughtErr);
      const is429 = /\b429\b|rate.?limit|rate-limited/i.test(caughtErr);
      return { ok: false, error: caughtErr, was404: is404, was429: is429 };
    }
    if (chunks === 0) return { ok: false, error: 'empty response' };
    await wrappedDone(caughtUsage);
    return { ok: true };
  };

  // ── Primary attempt ──
  const primary = await attempt(provider, model, keyId);
  if (primary.ok) return;

  // ── Fallback strategy ──
  // 1. If model 404'd or got 429'd on OpenRouter, walk a list of currently
  //    active free models. Free models share an upstream pool; 429s on one
  //    don't mean 429s on another.
  // 2. If Ollama failed (unreachable / bad model), fall back to OpenRouter.
  // 3. If no-key, surface the friendly error immediately.
  if (primary.error === 'no-key') {
    onError(
      provider === 'openrouter'
        ? 'No active OpenRouter API key. Open Settings → API Keys to add one.'
        : 'No active Ollama endpoint. Open Settings → API Keys to add a base URL.'
    );
    return;
  }
  if (primary.error === 'no-secret') {
    onError('Selected API key has no stored secret — re-add it in Settings.');
    return;
  }

  // Retry: model 404'd (deprecated) or 429'd (shared free pool saturated).
  // Free models on OpenRouter churn constantly, so a hardcoded list rots. Fetch
  // the LIVE free-model catalog and walk it, smallest/most-reliable families
  // first. Backstop with a short hardcoded list only if the fetch fails.
  if (provider === 'openrouter' && (primary.was404 || primary.was429)) {
    let chain: string[] = [];
    try {
      const orKeys = await keysForProvider('openrouter');
      const secret = orKeys.length ? await resolveApiKeySecret(orKeys[0]) : undefined;
      const live = (await listOpenRouterModels(secret))
        .map(m => m.id)
        .filter(id => id.endsWith(':free'));
      const rank = (id: string) => {
        const s = id.toLowerCase();
        if (s.includes('llama-3.2-1b') || s.includes('llama-3.2-3b')) return 0;
        if (s.includes('qwen') || s.includes('llama-3.1-8b')) return 1;
        if (s.includes('mistral') || s.includes('gemma')) return 2;
        if (s.includes('llama-3.3-70b') || s.includes('deepseek')) return 3;
        return 4;
      };
      chain = live.sort((a, b) => rank(a) - rank(b));
    } catch {}
    if (chain.length === 0) {
      chain = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-7b-instruct:free',
      ];
    }
    let tried = 0;
    for (const fallbackModel of chain) {
      if (fallbackModel === model) continue;
      const retry = await attempt('openrouter', fallbackModel, keyId);
      if (retry.ok) return;
      // Keep walking only on 404/429; any other error (bad key, network) stops.
      if (!retry.was404 && !retry.was429) break;
      if (++tried >= 6) break; // cap attempts to keep latency sane
    }
    // Every free model we tried was unavailable.
    onError('All free models are busy or unavailable right now. Switch the model in Settings → Default Model, or add a little OpenRouter credit and pick a paid model (far more reliable than the free pool).');
    return;
  }

  // Retry #2: Local Ollama failed → fall back to OpenRouter if any active key exists
  if (provider === 'ollama') {
    const orKeys = await keysForProvider('openrouter');
    if (orKeys.length > 0) {
      const orSettings = await getProviderSettings();
      const retry = await attempt('openrouter', orSettings.defaultModel, undefined);
      if (retry.ok) return;
    }
  }

  // All retries exhausted — surface primary error
  onError(primary.error || 'Request failed');
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
      // Map common HTTP codes to friendly copy instead of leaking OpenRouter's JSON body.
      const msg =
        r.status === 401 ? 'Invalid API key. Check openrouter.ai/keys.'
        : r.status === 403 ? 'Key lacks permission. Regenerate with default scope.'
        : r.status === 429 ? 'Rate limited. Wait a moment and try again.'
        : r.status === 402 ? 'Key has no credits remaining.'
        : `OpenRouter returned ${r.status}. Try again later.`;
      return { ok: false, error: msg };
    }
    const data = await r.json().catch(() => ({} as any));
    const info = (data && (data.data || data)) || {};
    return { ok: true, label: info.label, limit: info.limit ?? null };
  } catch (e: any) {
    return { ok: false, error: 'Network error — check your connection.' };
  }
}

export async function testOllamaEndpoint(baseUrl: string): Promise<{ ok: boolean; error?: string; models?: string[] }> {
  try {
    const url = baseUrl.replace(/\/+$/, '') + '/api/tags';
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: `Ollama returned ${r.status}. Check the URL and that Ollama is running.` };
    const data = await r.json();
    const models = (data.models || []).map((m: any) => m.name);
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: 'Unreachable — check URL, port, and that Ollama is running.' };
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
