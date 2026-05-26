import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

export function loadDotEnv(envPath = resolve(process.cwd(), '.env')) {
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] != null) continue;
    process.env[key] = value.replace(/^['"]|['"]$/g, '');
  }
}

export function defaultTtsOutputPath(root = process.cwd()) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(root, 'tts-output', `elevenlabs-${stamp}.mp3`);
}

export async function synthesizeElevenLabsTts({
  text,
  outputPath,
  play = false,
  apiKey = process.env.ELEVENLABS_API_KEY,
  voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
  modelId = process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
  outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || DEFAULT_OUTPUT_FORMAT,
  stability,
  similarityBoost,
} = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('TTS text is required.');

  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey || cleanKey.includes('PASTE_')) {
    throw new Error('Set ELEVENLABS_API_KEY in .env or the process environment.');
  }

  const cleanVoice = String(voiceId || '').trim();
  if (!cleanVoice) throw new Error('Set ELEVENLABS_VOICE_ID or pass voiceId.');

  const filePath = resolve(outputPath || defaultTtsOutputPath());
  await mkdir(dirname(filePath), { recursive: true });

  const url = new URL(`${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(cleanVoice)}`);
  url.searchParams.set('output_format', outputFormat);

  const body = {
    text: cleanText,
    model_id: modelId,
    ...(stability != null || similarityBoost != null ? {
      voice_settings: {
        ...(stability != null ? { stability: Number(stability) } : {}),
        ...(similarityBoost != null ? { similarity_boost: Number(similarityBoost) } : {}),
      },
    } : {}),
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': cleanKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${resp.status}): ${detail.slice(0, 300)}`);
  }

  const audio = Buffer.from(await resp.arrayBuffer());
  if (audio.length === 0) throw new Error('ElevenLabs returned an empty audio file.');
  await writeFile(filePath, audio);

  const playback = play ? await playAudio(filePath) : { attempted: false, ok: false, command: '' };
  return {
    ok: true,
    filePath,
    fileName: basename(filePath),
    bytes: audio.length,
    voiceId: cleanVoice,
    modelId,
    outputFormat,
    playback,
  };
}

export async function playAudio(filePath) {
  const candidates = process.platform === 'android' || process.env.PREFIX?.includes('com.termux')
    ? [
        ['termux-media-player', ['play', filePath]],
        ['termux-open', ['--content-type', 'audio/mpeg', filePath]],
      ]
    : process.platform === 'win32'
      ? [['powershell.exe', ['-NoProfile', '-Command', `Start-Process -LiteralPath '${filePath.replace(/'/g, "''")}'`]]]
      : process.platform === 'darwin'
        ? [['open', [filePath]]]
        : [['xdg-open', [filePath]]];

  for (const [command, args] of candidates) {
    const result = await runPlaybackCommand(command, args);
    if (result.ok) return { attempted: true, ok: true, command: [command, ...args].join(' ') };
  }

  return {
    attempted: true,
    ok: false,
    command: candidates.map(([command]) => command).join(' or '),
    error: 'No supported audio opener succeeded.',
  };
}

function runPlaybackCommand(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', err => resolveRun({ ok: false, error: err.message }));
    child.on('spawn', () => {
      child.unref();
      resolveRun({ ok: true });
    });
  });
}
