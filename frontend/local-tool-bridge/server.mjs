import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { loadDotEnv, synthesizeElevenLabsTts } from './elevenlabs-tts.mjs';

const PORT = Number(process.env.RED_TOOL_PORT || 8787);
loadDotEnv(resolve(process.cwd(), '.env'));
const TOKEN = process.env.RED_TOOL_TOKEN;
const ROOT = resolve(process.env.RED_TOOL_ROOT || process.cwd());
const TIMEOUT_MS = Number(process.env.RED_TOOL_TIMEOUT_MS || 30000);
const MAX_OUTPUT = Number(process.env.RED_TOOL_MAX_OUTPUT || 12000);
const MODE = (process.env.RED_TOOL_MODE || 'allowlist').toLowerCase();
const ALLOWED_PREFIXES = (process.env.RED_TOOL_ALLOWED_PREFIXES || [
  'pwd', 'ls', 'dir', 'rg', 'grep', 'find', 'cat', 'type',
  'python', 'node', 'npm', 'npx', 'git',
].join(',')).split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.RED_TOOL_ALLOWED_ORIGINS || [
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'http://127.0.0.1:3002',
  'http://localhost:3002',
  'http://127.0.0.1:3003',
  'http://localhost:3003',
  'http://127.0.0.1:8081',
  'http://localhost:8081',
  'http://127.0.0.1:19006',
  'http://localhost:19006',
].join(',')).split(',').map(s => s.trim()).filter(Boolean);
const SHELL_CONTROL_TOKENS = /[;&|`<>]/;

if (!TOKEN) {
  console.error('Set RED_TOOL_TOKEN before starting the bridge.');
  console.error('Example: RED_TOOL_TOKEN=change-me-red-tool-token node local-tool-bridge/server.mjs');
  process.exit(1);
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || ALLOWED_ORIGINS[0] || '*');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Red-Tool-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function send(req, res, status, body) {
  cors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function truncate(text) {
  if (text.length <= MAX_OUTPUT) return text;
  const half = Math.floor((MAX_OUTPUT - 120) / 2);
  return `${text.slice(0, half)}\n\n... [bridge output truncated] ...\n\n${text.slice(-half)}`;
}

function isInsideRoot(path) {
  const target = resolve(path || ROOT);
  return target === ROOT || target.startsWith(ROOT + sep);
}

function allowedCommand(command) {
  if (MODE === 'full') return { ok: true };
  if (SHELL_CONTROL_TOKENS.test(command)) {
    return {
      ok: false,
      reason: 'Shell control operators are blocked in allowlist mode. Set RED_TOOL_MODE=full only for your private local bridge if you need raw shell behavior.',
    };
  }
  const first = command.trim().split(/\s+/)[0] || '';
  if (!ALLOWED_PREFIXES.includes(first)) {
    return {
      ok: false,
      reason: `Command is not allowlisted. Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`,
    };
  }
  return { ok: true };
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function runShell({ command, cwd }) {
  return new Promise((resolveRun) => {
    if (!command || typeof command !== 'string') {
      resolveRun({ ok: false, exitCode: 2, output: 'Missing command.' });
      return;
    }
    const commandCheck = allowedCommand(command);
    if (!commandCheck.ok) {
      resolveRun({
        ok: false,
        exitCode: 126,
        output: commandCheck.reason,
      });
      return;
    }
    const runCwd = resolve(cwd || ROOT);
    if (!isInsideRoot(runCwd)) {
      resolveRun({ ok: false, exitCode: 126, output: `CWD must stay inside ${ROOT}` });
      return;
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command];
    const child = spawn(shell, args, {
      cwd: runCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const chunks = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.stdout.on('data', d => chunks.push(d));
    child.stderr.on('data', d => chunks.push(d));
    child.on('close', code => {
      clearTimeout(timer);
      const output = truncate(Buffer.concat(chunks).toString('utf8'));
      resolveRun({ ok: code === 0, exitCode: code ?? 1, output });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolveRun({ ok: false, exitCode: 1, output: err.message });
    });
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function scrape({ url }) {
  if (!/^https?:\/\//i.test(url || '')) {
    return { ok: false, output: 'Only http:// and https:// URLs are allowed.' };
  }
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Colour-Ceauxdid-RedToolBridge/1.0',
      Accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
    },
  });
  const contentType = resp.headers.get('content-type') || '';
  const raw = await resp.text();
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
  const text = contentType.includes('html') ? stripHtml(raw) : raw;
  return {
    ok: resp.ok,
    output: truncate([
      `URL: ${url}`,
      `Status: ${resp.status}`,
      title ? `Title: ${title}` : '',
      '',
      text,
    ].filter(Boolean).join('\n')),
  };
}

async function tts({ text, outputPath, play = true, voiceId, modelId, outputFormat }) {
  const target = outputPath ? resolve(outputPath) : undefined;
  if (target && !isInsideRoot(target)) {
    return { ok: false, output: `Output path must stay inside ${ROOT}` };
  }
  try {
    const result = await synthesizeElevenLabsTts({
      text,
      outputPath: target,
      play,
      voiceId,
      modelId,
      outputFormat,
    });
    return {
      ok: true,
      output: [
        `Saved: ${result.filePath}`,
        `Bytes: ${result.bytes}`,
        result.playback.attempted
          ? `Playback: ${result.playback.ok ? 'started' : `not started (${result.playback.error || result.playback.command})`}`
          : 'Playback: skipped',
      ].join('\n'),
      filePath: result.filePath,
      bytes: result.bytes,
      playback: result.playback,
    };
  } catch (err) {
    return { ok: false, output: err?.message || 'ElevenLabs TTS failed.' };
  }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/health') {
    send(req, res, 200, { ok: true, mode: MODE, root: ROOT, allowedPrefixes: ALLOWED_PREFIXES });
    return;
  }
  if (req.headers['x-red-tool-token'] !== TOKEN) {
    send(req, res, 401, { ok: false, error: 'Unauthorized.' });
    return;
  }
  try {
    if (req.method === 'POST' && req.url === '/shell') {
      send(req, res, 200, await runShell(await readJson(req)));
      return;
    }
    if (req.method === 'POST' && req.url === '/scrape') {
      send(req, res, 200, await scrape(await readJson(req)));
      return;
    }
    if (req.method === 'POST' && req.url === '/tts') {
      send(req, res, 200, await tts(await readJson(req)));
      return;
    }
    send(req, res, 404, { ok: false, error: 'Not found.' });
  } catch (err) {
    send(req, res, 500, { ok: false, error: err?.message || 'Bridge error.' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Red tool bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Mode: ${MODE}`);
  console.log(`Root: ${ROOT}`);
  console.log(`Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`);
});
