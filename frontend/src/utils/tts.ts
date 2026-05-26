/**
 * Text-to-speech via ElevenLabs.
 *
 * - Each agent speaks in a distinct voice (see AGENT_VOICES). Custom agents get
 *   a voice assigned round-robin from VOICE_POOL, stable per agent id.
 * - Multiple ElevenLabs keys rotate round-robin (mirrors the chat key rotation
 *   in api.ts). On a 401/429/quota error the next key is tried, so you can stack
 *   several free-tier keys to extend the monthly character quota.
 * - Audio is fetched as mp3, written to the cache dir, and played with
 *   expo-audio's imperative createAudioPlayer.
 */

import { SwarmAgent } from '../types';
import { getApiKeys, resolveApiKeySecret, markApiKeyUsed, ApiKey } from '../store';
import { RED_TOOL_BRIDGE } from '../config/redToolBridge';
import { speakWithElevenLabs } from './redToolBridge';

// NOTE: expo-audio and expo-file-system are loaded lazily (require) inside the
// functions that use them — NOT at module top level. This module is imported by
// ChatMainArea (the default tab), so a top-level native import that fails to
// initialize would crash the whole app on launch. Lazy-loading confines any
// audio-module problem to the Speak action itself.

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';
// Flash v2.5 is the cheapest/fastest model — best for stretching the free quota.
const TTS_MODEL = 'eleven_flash_v2_5';

// Current ElevenLabs default voices (available on the free tier). Mapped to fit
// each agent's character.
const AGENT_VOICES: Record<string, string> = {
  red: 'onwK4e9ZLuTAKqWW03F9',     // Daniel — authoritative, commanding
  blue: 'nPczCjzI2devNBz1zQrb',    // Brian — deep, measured narrator
  green: 'iP95p4xoKVk53GoZ742B',   // Chris — casual, practical
  yellow: 'FGY2WhTYpPnrIDTdsKH5',  // Laura — bright, upbeat
  purple: 'Xb7hH8MSUJpSbSDYk0k2',  // Alice — calm, dry British
};

// Custom agents draw from this pool, assigned deterministically by id hash so a
// given custom agent always sounds the same.
const VOICE_POOL = [
  '9BWtsMINqrJLrRacOk9x', // Aria
  'JBFqnCBsd6RMkjVDRZzb', // George
  'XB0fDUnXU5powFXDhCwa', // Charlotte
  'TX3LPaxmHKxFdv7VOQHJ', // Liam
  'XrExE9yKIg1WjnnlVkGX', // Matilda
  'cjVigY5qzO86Huf0OWal', // Eric
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function voiceForAgent(agent: SwarmAgent): string {
  if (AGENT_VOICES[agent.id]) return AGENT_VOICES[agent.id];
  return VOICE_POOL[hashStr(agent.id) % VOICE_POOL.length];
}

// Strip markdown/code/links and cap length so we don't burn quota reading symbols.
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '. (code block) .')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[>_~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

let _ttsKeyRr = 0;
let _player: any = null;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function activeElevenKeys(): Promise<ApiKey[]> {
  return (await getApiKeys('elevenlabs')).filter(k => k.isActive);
}

export async function isTtsConfigured(): Promise<boolean> {
  return (await activeElevenKeys()).length > 0;
}

export function stopSpeaking(): void {
  if (_player) {
    try { _player.pause(); } catch {}
    try { _player.remove(); } catch {}
    _player = null;
  }
}

async function waitForAudioReady(player: any, timeoutMs = 3500): Promise<boolean> {
  if (player?.isLoaded) return true;

  let removeListener: (() => void) | undefined;
  const statusReady = new Promise<boolean>((resolve) => {
    try {
      const sub = player?.addListener?.('playbackStatusUpdate', (status: any) => {
        if (status?.isLoaded) resolve(true);
        if (status?.error) resolve(false);
      });
      removeListener = () => sub?.remove?.();
    } catch {
      resolve(false);
    }
  });

  const pollReady = (async () => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (player?.isLoaded) return true;
      await wait(75);
    }
    return false;
  })();

  const timeout = wait(timeoutMs).then(() => false);
  const ready = await Promise.race([statusReady, pollReady, timeout]);
  removeListener?.();
  return !!ready || !!player?.isLoaded;
}

async function speakViaTermuxBridge(
  text: string,
  voiceId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!RED_TOOL_BRIDGE.enabled) {
    return { ok: false, error: 'Termux TTS bridge is not enabled.' };
  }
  const res = await speakWithElevenLabs(text, { voiceId, play: true });
  return res.ok ? { ok: true } : { ok: false, error: res.output };
}

async function synthAndPlay(
  secret: string,
  voiceId: string,
  text: string,
): Promise<{ ok: boolean; error?: string; rotate?: boolean }> {
  try {
    const resp = await fetch(
      `${ELEVEN_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': secret,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        }),
      },
    );

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const rotate =
        resp.status === 401 || resp.status === 429 ||
        /quota|limit|exceeded/i.test(body);
      const friendly =
        resp.status === 401 ? 'Invalid ElevenLabs key.'
        : resp.status === 429 ? 'ElevenLabs rate limit / quota hit.'
        : /quota|exceeded/i.test(body) ? 'ElevenLabs monthly quota exhausted.'
        : `ElevenLabs ${resp.status}`;
      return { ok: false, error: friendly, rotate };
    }

    // Lazy-load native modules only when actually playing (never at launch).
    const FileSystem = require('expo-file-system/legacy');
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');

    const buf = await resp.arrayBuffer();
    const b64 = bytesToB64(new Uint8Array(buf));
    const path = `${FileSystem.cacheDirectory}tts-${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(path, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}
    stopSpeaking();
    _player = createAudioPlayer({ uri: path }, { updateInterval: 100, downloadFirst: true });
    const ready = await waitForAudioReady(_player);
    if (!ready) {
      return { ok: false, error: 'Audio file saved, but player did not finish loading.', rotate: false };
    }
    _player.play();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'TTS network error', rotate: false };
  }
}

/**
 * Speak an agent's message. Rotates through active ElevenLabs keys round-robin,
 * advancing to the next key on rate-limit / quota / auth errors.
 */
export async function speakMessage(
  agent: SwarmAgent,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const clean = sanitizeForSpeech(text);
  if (!clean) return { ok: true };

  const voiceId = voiceForAgent(agent);
  const keys = await activeElevenKeys();
  if (keys.length === 0) {
    const bridge = await speakViaTermuxBridge(clean, voiceId);
    if (bridge.ok) return bridge;
    return { ok: false, error: 'No ElevenLabs key. Add one in Settings → Voice, or enable the Termux TTS bridge.' };
  }

  const n = keys.length;
  const start = _ttsKeyRr % n;
  _ttsKeyRr = (_ttsKeyRr + 1) % n;

  let lastErr = 'TTS failed';
  for (let i = 0; i < n; i++) {
    const key = keys[(start + i) % n];
    const secret = await resolveApiKeySecret(key);
    if (!secret) { lastErr = 'Key has no stored secret'; continue; }

    const res = await synthAndPlay(secret, voiceId, clean);
    if (res.ok) {
      markApiKeyUsed(key.id).catch(() => {});
      return { ok: true };
    }
    lastErr = res.error || lastErr;
    if (!res.rotate) break; // non-quota error → stop trying other keys
  }
  const bridge = await speakViaTermuxBridge(clean, voiceId);
  if (bridge.ok) return bridge;
  return { ok: false, error: lastErr };
}

export async function testElevenLabsKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${ELEVEN_BASE}/user`, { headers: { 'xi-api-key': key } });
    if (r.ok) return { ok: true };
    if (r.status === 401) return { ok: false, error: 'Invalid key. Check elevenlabs.io → Profile → API key.' };
    return { ok: false, error: `ElevenLabs returned ${r.status}.` };
  } catch {
    return { ok: false, error: 'Network error — check your connection.' };
  }
}
