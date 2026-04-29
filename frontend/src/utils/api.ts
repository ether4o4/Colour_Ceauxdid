/**
 * LLM dispatch layer.
 *
 * Supports OpenRouter (hosted) and Ollama (local via user-supplied base URL).
 *
 * - Keys are pulled from AsyncStorage (managed by SettingsScreen → API Keys).
 * - No hardcoded secrets. The previous hardcoded OpenRouter key has been removed.
 * - Round-robin across active keys of the chosen provider so concurrent agent
 *   calls don't all hit the same rate-limited key.
 * - Memory flow rule is enforced by the CALLER (ChatMainArea) by picking the
 *   right history. This module just streams whatever it's given.
 */

import { SwarmAgent, SwarmMessage } from '../types';
import {
  getAgentMemory,
  getApiKeys,
  getProviderSettings,
  markApiKeyUsed,
  ApiProvider,
  ApiKey,
} from '../store';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ────────── Key selection (round-robin) ──────────
let _rrCounter: Record<string, number> = {};

async function pickKey(provider: ApiProvider): Promise<ApiKey | null> {
  const keys = (await getApiKeys(provider)).filter(k => k.isActive && k.secret.trim().length > 0);
  if (keys.length === 0) return null;
  const idx = (_rrCounter[provider] ?? 0) % keys.length;
  _rrCounter[provider] = idx + 1;
  const k = keys[idx];
  markApiKeyUsed(k.id).catch(() => {});
  return k;
}

// ────────── Shared: build OpenAI-style message list for an agent ──────────
function buildApiMessages(agent: SwarmAgent, history: SwarmMessage[], userMessage: string) {
  const recent = history.slice(-20);
  const apiMessages = recent.map(m => ({
    role: (m.senderId === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.senderId !== 'user' ? `[${m.senderName}]: ${m.text}` : m.text,
  }));
  apiMessages.push({ role: 'user', content: userMessage });
  return apiMessages;
}

async function buildSystemPrompt(agent: SwarmAgent): Promise<string> {
  const memory = await getAgentMemory(agent.id);
  const memBlock = Object.keys(memory).length > 0
    ? `\n\nYour persistent memory:\n${Object.entries(memory).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : '';
  return agent.systemPrompt + memBlock;
}

// ────────── OpenRouter (streaming, OpenAI-compatible) ──────────
async function openrouterStream(
  apiKey: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  temperature: number,
  onChunk: (s: string) => void,
  onDone: () => void,
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
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      onError(`OpenRouter ${resp.status}: ${txt.slice(0, 200)}`);
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      // React Native web fallback: some environments don't expose a reader.
      const all = await resp.text();
      for (const line of all.split('\n')) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) onChunk(chunk);
          } catch {}
        }
      }
      onDone();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) onChunk(chunk);
        } catch {}
      }
    }
    onDone();
  } catch (err: any) {
    onError(err?.message || 'Network error');
  }
}

// ────────── Ollama (streaming, local) ──────────
async function ollamaStream(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  apiMessages: { role: 'user' | 'assistant'; content: string }[],
  temperature: number,
  onChunk: (s: string) => void,
  onDone: () => void,
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

    const reader = resp.body?.getReader();
    if (!reader) {
      const all = await resp.text();
      for (const line of all.split('\n')) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const chunk = parsed.message?.content;
          if (chunk) onChunk(chunk);
        } catch {}
      }
      onDone();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const chunk = parsed.message?.content;
          if (chunk) onChunk(chunk);
          if (parsed.done) { onDone(); return; }
        } catch {}
      }
    }
    onDone();
  } catch (err: any) {
    onError(err?.message || 'Network error contacting Ollama');
  }
}

// ────────── Public API ──────────
/**
 * Stream a response from the currently-configured default provider.
 *
 * `chatHistory` is already scope-filtered by the caller per the memory rules:
 *   - agent 1-on-1: that agent's private history + group memory where agent participates
 *   - group chat:   that group's messages only (NO individual-chat leakage)
 */
export async function streamAgentResponse(
  agent: SwarmAgent,
  userMessage: string,
  chatHistory: SwarmMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): Promise<void> {
  const settings = await getProviderSettings();
  const provider = settings.defaultProvider;

  const key = await pickKey(provider);
  if (!key) {
    onError(
      provider === 'openrouter'
        ? 'No OpenRouter API key configured. Open Settings → API Keys to add one.'
        : 'No Ollama endpoint configured. Open Settings → API Keys to add a base URL.'
    );
    return;
  }

  const systemPrompt = await buildSystemPrompt(agent);
  const apiMessages = buildApiMessages(agent, chatHistory, userMessage);

  // Per-agent temperature for personality flavor
  const temperature =
    agent.id === 'yellow' ? 0.9 :
    agent.id === 'red' ? 0.3 :
    0.7;

  if (provider === 'openrouter') {
    return openrouterStream(
      key.secret, settings.defaultModel, systemPrompt, apiMessages,
      temperature, onChunk, onDone, onError,
    );
  }
  if (provider === 'ollama') {
    return ollamaStream(
      key.secret, settings.ollamaModel, systemPrompt, apiMessages,
      temperature, onChunk, onDone, onError,
    );
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
      (chunk) => { full += chunk; },
      () => resolve(full),
      (err) => reject(new Error(err)),
    );
  });
}

// ────────── Key validation (used by settings UI) ──────────
export async function testOpenRouterKey(key: string): Promise<{ ok: boolean; error?: string; modelCount?: number }> {
  try {
    const r = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: `${r.status}: ${txt.slice(0, 120)}` };
    }
    const data = await r.json();
    return { ok: true, modelCount: (data.data || []).length };
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
