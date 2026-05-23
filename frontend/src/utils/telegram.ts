/**
 * Foreground Telegram relay.
 *
 * While the app is open, long-polls Telegram for incoming messages, routes each
 * one through the normal agent stack (getSingleAgentResponse — same provider /
 * model / per-agent pinning as in-app chat), and replies in the Telegram chat.
 *
 * IMPORTANT: this only runs while the app is in the foreground. A React Native
 * app cannot keep a process alive in the background, so this is NOT a 24/7 bot —
 * for always-on, run the bot in Termux instead. Pure fetch + AsyncStorage +
 * secure-store; no native modules, so it can't crash app launch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSecret, getSecret, deleteSecret } from './secureStorage';
import { getSingleAgentResponse } from './api';
import { getCustomAgents } from '../store';
import { DEFAULT_AGENTS } from '../agents/config';
import { SwarmAgent } from '../types';

const TG_BASE = 'https://api.telegram.org';
const ENABLED_KEY = 'cc_telegram_enabled';
const AGENT_KEY = 'cc_telegram_agent';
const TOKEN_SECRET = 'telegram_bot_token';

// ── Config persistence ──
export async function setTelegramToken(token: string): Promise<void> {
  await setSecret(TOKEN_SECRET, token.trim());
}
export async function getTelegramToken(): Promise<string | null> {
  return getSecret(TOKEN_SECRET);
}
export async function clearTelegramToken(): Promise<void> {
  await deleteSecret(TOKEN_SECRET);
}
export async function isTelegramEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}
export async function setTelegramEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  if (on) await startRelay();
  else stopRelay();
}
export async function getTelegramAgentId(): Promise<string> {
  return (await AsyncStorage.getItem(AGENT_KEY)) || 'blue';
}
export async function setTelegramAgentId(id: string): Promise<void> {
  await AsyncStorage.setItem(AGENT_KEY, id);
}

// ── Telegram API ──
export async function testTelegramToken(
  token: string,
): Promise<{ ok: boolean; error?: string; username?: string }> {
  try {
    const r = await fetch(`${TG_BASE}/bot${token.trim()}/getMe`);
    const j: any = await r.json().catch(() => ({}));
    if (j?.ok && j.result) return { ok: true, username: j.result.username };
    return { ok: false, error: j?.description || `Telegram returned ${r.status}` };
  } catch {
    return { ok: false, error: 'Network error reaching Telegram.' };
  }
}

async function sendMessage(token: string, chatId: number, text: string): Promise<void> {
  await fetch(`${TG_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: (text || '').slice(0, 4000) }),
  }).catch(() => {});
}

async function resolveAgent(): Promise<SwarmAgent> {
  const id = await getTelegramAgentId();
  const customs = await getCustomAgents().catch(() => [] as SwarmAgent[]);
  const all = [...DEFAULT_AGENTS, ...customs];
  return all.find(a => a.id === id) || DEFAULT_AGENTS[0];
}

// ── Relay loop (foreground-only) ──
type RelayStatus = 'off' | 'running' | 'error';
let _running = false;
let _offset = 0;
let _status: RelayStatus = 'off';

export function relayStatus(): RelayStatus {
  return _status;
}

export async function startRelay(): Promise<void> {
  if (_running) return;
  const token = await getTelegramToken();
  if (!token) { _status = 'off'; return; }
  _running = true;
  _status = 'running';
  void loop(token);
}

export function stopRelay(): void {
  _running = false;
  _status = 'off';
}

async function loop(token: string): Promise<void> {
  while (_running) {
    try {
      // Long-poll: blocks up to 25s waiting for new messages.
      const r = await fetch(
        `${TG_BASE}/bot${token}/getUpdates?timeout=25&offset=${_offset}`,
      );
      const j: any = await r.json().catch(() => ({}));
      if (!_running) break;
      _status = 'running';
      if (j?.ok && Array.isArray(j.result)) {
        for (const u of j.result) {
          _offset = u.update_id + 1;
          const msg = u.message;
          const text: string | undefined = msg?.text;
          const chatId: number | undefined = msg?.chat?.id;
          if (!text || chatId == null) continue;
          // Ignore Telegram slash-commands like /start
          if (text.startsWith('/')) {
            await sendMessage(token, chatId, 'Send me a message and I’ll route it to your agents.');
            continue;
          }
          try {
            const agent = await resolveAgent();
            const reply = await getSingleAgentResponse(agent, text, []);
            await sendMessage(token, chatId, reply || '(no response)');
          } catch (e: any) {
            await sendMessage(token, chatId, `⚠ ${e?.message || 'error'}`);
          }
        }
      }
    } catch {
      _status = 'error';
      await new Promise(res => setTimeout(res, 3000)); // backoff on network error
    }
  }
  _status = 'off';
}

// Call on app launch / resume to restart the relay if it was left enabled.
export async function syncRelay(): Promise<void> {
  if (await isTelegramEnabled()) await startRelay();
  else stopRelay();
}
